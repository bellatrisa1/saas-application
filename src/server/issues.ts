import { z } from "zod";
import type { PoolClient } from "pg";
import {
  AppError,
  issueInput,
  issuePatch,
  parseSearch,
  type Issue,
} from "@/lib/domain";
import { transaction } from "./db";
import { access, record } from "./access";
const select = `SELECT i.*,to_char(i.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') created_at,u.name assignee_name,r.name reporter_name,p.name project_name,p.key project_key FROM issues i JOIN projects p ON p.id=i.project_id JOIN users r ON r.id=i.reporter_id LEFT JOIN users u ON u.id=i.assignee_id`;
export async function listIssues(
  db: PoolClient,
  workspace: string,
  params: URLSearchParams,
) {
  const filter = parseSearch(
    z
      .string()
      .max(500)
      .parse(params.get("q") ?? ""),
  );
  const args: unknown[] = [workspace];
  const clauses = ["i.workspace_id=$1"];
  function add(sql: string, value: unknown) {
    args.push(value);
    clauses.push(sql.replace("?", `$${args.length}`));
  }
  if (filter.text)
    add(
      "to_tsvector('english',i.title||' '||i.description) @@ websearch_to_tsquery('english',?)",
      filter.text,
    );
  if (filter.status) add("i.status=?", filter.status);
  if (params.get("status"))
    add(
      "i.status=?",
      z
        .enum(["backlog", "todo", "in-progress", "in-review", "done"])
        .parse(params.get("status")),
    );
  if (filter.priority) add("i.priority=?", filter.priority);
  if (filter.assignee) add("u.name ILIKE ?", `%${filter.assignee}%`);
  if (filter.label) add("i.labels @> ?::text[]", [filter.label]);
  if (filter.due) add("i.due_date < ?::date", filter.due);
  if (params.get("project"))
    add("i.project_id=?", z.uuid().parse(params.get("project")));
  if (params.get("cursor")) {
    let cursor: unknown;
    try {
      cursor = JSON.parse(
        Buffer.from(params.get("cursor")!, "base64url").toString(),
      );
    } catch {
      throw new AppError(422, "Invalid pagination cursor");
    }
    const c = z
      .object({ created_at: z.iso.datetime(), id: z.uuid() })
      .parse(cursor);
    args.push(c.created_at, c.id);
    clauses.push(
      `(i.created_at,i.id)<($${args.length - 1}::timestamptz,$${args.length}::uuid)`,
    );
  }
  const { rows } = await db.query<Issue>(
    `${select} WHERE ${clauses.join(" AND ")} ORDER BY i.created_at DESC,i.id DESC LIMIT 51`,
    args,
  );
  const items = rows.slice(0, 50);
  const last = items.at(-1);
  return {
    items,
    next:
      rows.length > 50 && last
        ? Buffer.from(
            JSON.stringify({ created_at: last.created_at, id: last.id }),
          ).toString("base64url")
        : null,
  };
}
export async function getIssue(db: PoolClient, workspace: string, id: string) {
  const { rows } = await db.query<Issue>(
    `${select} WHERE i.workspace_id=$1 AND i.id=$2`,
    [workspace, id],
  );
  if (!rows[0]) throw new AppError(404, "Issue not found");
  return rows[0];
}
async function assignment(
  db: PoolClient,
  workspace: string,
  actor: string,
  issue: Issue,
  previous: string | null,
) {
  if (
    issue.assignee_id &&
    issue.assignee_id !== previous &&
    issue.assignee_id !== actor
  )
    await db.query(
      "INSERT INTO notifications(workspace_id,user_id,issue_id,title) VALUES($1,$2,$3,$4)",
      [
        workspace,
        issue.assignee_id,
        issue.id,
        `You were assigned ${issue.project_key}-${issue.number}: ${issue.title}`,
      ],
    );
}
export async function mutateIssue(
  workspace: string,
  user: string,
  id: string | null,
  input: unknown,
  remove = false,
) {
  return transaction(async (db) => {
    await access(db, workspace, user, "issue");
    if (!id) {
      const d = issueInput.parse(input);
      const project = await db.query(
        "SELECT 1 FROM projects WHERE workspace_id=$1 AND id=$2 AND NOT archived FOR SHARE",
        [workspace, d.projectId],
      );
      if (!project.rowCount)
        throw new AppError(422, "Choose an active project");
      const { rows } = await db.query<{ issue_counter: number }>(
        "UPDATE workspaces SET issue_counter=issue_counter+1 WHERE id=$1 RETURNING issue_counter",
        [workspace],
      );
      const created = await db.query<{ id: string }>(
        "INSERT INTO issues(workspace_id,project_id,number,title,description,status,priority,assignee_id,reporter_id,due_date,labels) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
        [
          workspace,
          d.projectId,
          rows[0].issue_counter,
          d.title,
          d.description,
          d.status,
          d.priority,
          d.assigneeId,
          user,
          d.dueDate,
          d.labels,
        ],
      );
      const issue = await getIssue(db, workspace, created.rows[0].id);
      await assignment(db, workspace, user, issue, null);
      await record(
        db,
        workspace,
        user,
        "issue.created",
        { title: issue.title, key: `${issue.project_key}-${issue.number}` },
        issue.id,
        issue.project_id,
      );
      return issue;
    }
    await db.query(
      "SELECT id FROM issues WHERE workspace_id=$1 AND id=$2 FOR UPDATE",
      [workspace, id],
    );
    const before = await getIssue(db, workspace, id);
    const d = issuePatch.parse(input);
    if (d.version !== before.version)
      throw new AppError(
        409,
        "This issue changed. Refresh and retry your edit.",
      );
    if (remove) {
      await db.query("DELETE FROM issues WHERE id=$1", [id]);
      await record(
        db,
        workspace,
        user,
        "issue.deleted",
        { title: before.title },
        id,
        before.project_id,
      );
      return { ok: true };
    }
    if (d.projectId) {
      const p = await db.query(
        "SELECT 1 FROM projects WHERE workspace_id=$1 AND id=$2 AND NOT archived FOR SHARE",
        [workspace, d.projectId],
      );
      if (!p.rowCount) throw new AppError(422, "Choose an active project");
    }
    const values: unknown[] = [];
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const mapping = {
      title: "title",
      description: "description",
      projectId: "project_id",
      status: "status",
      priority: "priority",
      assigneeId: "assignee_id",
      dueDate: "due_date",
      labels: "labels",
    } as const;
    const sets: string[] = [];
    for (const key of Object.keys(mapping) as (keyof typeof mapping)[]) {
      if (d[key] !== undefined) {
        values.push(d[key]);
        sets.push(`${mapping[key]}=$${values.length}`);
        changes[key] = { from: before[mapping[key]], to: d[key] };
      }
    }
    if (!sets.length) throw new AppError(422, "No changes submitted");
    values.push(id);
    await db.query(
      `UPDATE issues SET ${sets.join(",")},version=version+1,updated_at=now() WHERE id=$${values.length}`,
      values,
    );
    const issue = await getIssue(db, workspace, id);
    await assignment(db, workspace, user, issue, before.assignee_id);
    await record(
      db,
      workspace,
      user,
      "issue.updated",
      { key: `${issue.project_key}-${issue.number}`, changes },
      id,
      issue.project_id,
    );
    await db.query(
      "INSERT INTO notifications(workspace_id,user_id,issue_id,title) SELECT workspace_id,user_id,issue_id,$3 FROM watchers WHERE issue_id=$1 AND user_id<>$2",
      [id, user, `${issue.project_key}-${issue.number} was updated`],
    );
    return issue;
  });
}
export async function comment(
  workspace: string,
  user: string,
  id: string,
  input: unknown,
) {
  const { body } = z
    .object({ body: z.string().trim().min(1).max(10000) })
    .parse(input);
  return transaction(async (db) => {
    await access(db, workspace, user, "issue");
    const issue = await getIssue(db, workspace, id);
    const { rows } = await db.query(
      "INSERT INTO comments(workspace_id,issue_id,author_id,body) VALUES($1,$2,$3,$4) RETURNING id",
      [workspace, id, user, body],
    );
    const mentions = [...body.matchAll(/@([\w.+-]+@[\w.-]+\.[A-Za-z]+)/g)].map(
      (m) => m[1].toLowerCase(),
    );
    await db.query(
      "INSERT INTO notifications(workspace_id,user_id,issue_id,title) SELECT m.workspace_id,m.user_id,$3,$4 FROM members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id<>$2 AND (u.email=ANY($5::text[]) OR m.user_id IN (SELECT user_id FROM watchers WHERE issue_id=$3))",
      [
        workspace,
        user,
        id,
        `New comment on ${issue.project_key}-${issue.number}`,
        mentions,
      ],
    );
    await record(
      db,
      workspace,
      user,
      "comment.created",
      {},
      id,
      issue.project_id,
    );
    return rows[0];
  });
}
