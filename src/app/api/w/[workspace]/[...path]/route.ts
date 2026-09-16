import { z } from "zod";
import { AppError } from "@/lib/domain";
import { requireUser } from "@/server/auth";
import { transaction } from "@/server/db";
import { access, record } from "@/server/access";
import { respond, body, sameOrigin } from "@/server/http";
import { workspaceAction, projectAction } from "@/server/workspaces";
import { listIssues, getIssue, mutateIssue, comment } from "@/server/issues";
type Context = { params: Promise<{ workspace: string; path: string[] }> };
export async function GET(request: Request, context: Context) {
  return respond(async () => {
    const user = await requireUser();
    const { workspace, path } = await context.params;
    z.uuid().parse(workspace);
    const [resource, id, child] = path;
    const p = new URL(request.url).searchParams;
    return transaction(async (db) => {
      await access(db, workspace, user.id);
      if (resource === "projects") {
        return (
          await db.query(
            "SELECT * FROM projects WHERE workspace_id=$1 ORDER BY name LIMIT 200",
            [workspace],
          )
        ).rows;
      }
      if (resource === "project-members") {
        z.uuid().parse(id);
        return (
          await db.query(
            "SELECT user_id FROM project_members WHERE workspace_id=$1 AND project_id=$2",
            [workspace, id],
          )
        ).rows;
      }
      if (resource === "members") {
        const cursor = p.get("cursor") || null;
        if (cursor) z.uuid().parse(cursor);
        return (
          await db.query(
            "SELECT m.user_id,m.role,u.name,u.email FROM members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND (u.name ILIKE $2 OR u.email ILIKE $2) AND ($3::uuid IS NULL OR m.user_id>$3) ORDER BY m.user_id LIMIT 50",
            [workspace, `%${(p.get("q") ?? "").slice(0, 100)}%`, cursor],
          )
        ).rows;
      }
      if (resource === "issues" && !id) return listIssues(db, workspace, p);
      if (resource === "issues" && id) {
        z.uuid().parse(id);
        const issue = await getIssue(db, workspace, id);
        if (!child) return issue;
        if (child === "comments") {
          const cursor = p.get("cursor") || null;
          const cursorParts = cursor?.split("|");
          if (cursorParts)
            z.tuple([z.iso.datetime(), z.uuid()]).parse(cursorParts);
          return (
            await db.query(
              `SELECT c.id,c.body,to_char(c.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') created_at,u.name author_name FROM comments c JOIN users u ON u.id=c.author_id WHERE c.issue_id=$1 AND ($2::timestamptz IS NULL OR (c.created_at,c.id)<($2::timestamptz,$3::uuid)) ORDER BY c.created_at DESC,c.id DESC LIMIT 50`,
              [id, cursorParts?.[0] ?? null, cursorParts?.[1] ?? null],
            )
          ).rows;
        }
        if (child === "attachments")
          return (
            await db.query(
              "SELECT id,name,size FROM attachments WHERE issue_id=$1",
              [id],
            )
          ).rows;
        if (child === "watchers")
          return {
            watching: !!(
              await db.query(
                "SELECT 1 FROM watchers WHERE issue_id=$1 AND user_id=$2",
                [id, user.id],
              )
            ).rowCount,
          };
      }
      if (resource === "activity") {
        const cursor = p.get("cursor") || null;
        if (cursor) z.string().regex(/^\d+$/).parse(cursor);
        const project = p.get("project") || null;
        if (project) z.uuid().parse(project);
        return (
          await db.query(
            "SELECT a.*,u.name actor_name FROM activity a LEFT JOIN users u ON u.id=a.actor_id WHERE a.workspace_id=$1 AND ($2::bigint IS NULL OR a.id<$2) AND ($3::uuid IS NULL OR a.project_id=$3) ORDER BY a.id DESC LIMIT 50",
            [workspace, cursor, project],
          )
        ).rows;
      }
      if (resource === "notifications") {
        const cursor = p.get("cursor") || null;
        if (cursor) z.string().regex(/^\d+$/).parse(cursor);
        return {
          items: (
            await db.query(
              "SELECT * FROM notifications WHERE workspace_id=$1 AND user_id=$2 AND ($3::bigint IS NULL OR id<$3) ORDER BY id DESC LIMIT 50",
              [workspace, user.id, cursor],
            )
          ).rows,
          unread: Number(
            (
              await db.query(
                "SELECT count(*) FROM notifications WHERE workspace_id=$1 AND user_id=$2 AND read_at IS NULL",
                [workspace, user.id],
              )
            ).rows[0].count,
          ),
        };
      }
      throw new AppError(404, "Resource not found");
    });
  });
}
async function mutate(request: Request, context: Context) {
  return respond(async () => {
    sameOrigin(request);
    const user = await requireUser();
    const { workspace, path } = await context.params;
    z.uuid().parse(workspace);
    const [resource, id, child] = path;
    const data = await body(request);
    if (
      resource === "settings" ||
      resource === "invite" ||
      resource === "member"
    )
      return workspaceAction(workspace, user.id, resource, data);
    if (resource === "projects") return projectAction(workspace, user.id, data);
    if (resource === "issues") {
      if (id) z.uuid().parse(id);
      if (child === "comments") return comment(workspace, user.id, id, data);
      if (child === "watchers")
        return transaction(async (db) => {
          await access(db, workspace, user.id);
          await getIssue(db, workspace, id);
          const { watching } = z.object({ watching: z.boolean() }).parse(data);
          if (watching)
            await db.query(
              "INSERT INTO watchers VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
              [workspace, id, user.id],
            );
          else
            await db.query(
              "DELETE FROM watchers WHERE issue_id=$1 AND user_id=$2",
              [id, user.id],
            );
          return { watching };
        });
      return mutateIssue(
        workspace,
        user.id,
        id ?? null,
        data,
        request.method === "DELETE",
      );
    }
    if (resource === "notifications")
      return transaction(async (db) => {
        await access(db, workspace, user.id);
        const { id } = z
          .object({ id: z.string().regex(/^\d+$/).optional() })
          .parse(data);
        await db.query(
          "UPDATE notifications SET read_at=now() WHERE workspace_id=$1 AND user_id=$2 AND ($3::bigint IS NULL OR id=$3)",
          [workspace, user.id, id ?? null],
        );
        await record(db, workspace, user.id, "notification.read");
        return { ok: true };
      });
    throw new AppError(404, "Unknown action");
  });
}
export const POST = mutate;
export const PATCH = mutate;
export const DELETE = mutate;
