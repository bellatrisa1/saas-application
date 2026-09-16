import { z } from "zod";
import { AppError } from "@/lib/domain";
import { transaction } from "./db";
import { access, record } from "./access";
import { digest, token } from "./password";
export async function createWorkspace(user: string, input: unknown) {
  const { name } = z
    .object({ name: z.string().trim().min(2).max(80) })
    .parse(input);
  return transaction(async (db) => {
    const { rows } = await db.query<{ id: string; name: string }>(
      "INSERT INTO workspaces(name) VALUES($1) RETURNING id,name",
      [name],
    );
    await db.query("INSERT INTO members VALUES($1,$2,$3)", [
      rows[0].id,
      user,
      "owner",
    ]);
    await record(db, rows[0].id, user, "workspace.created");
    return rows[0];
  });
}
export async function workspaceAction(
  workspace: string,
  user: string,
  action: string,
  input: unknown,
) {
  return transaction(async (db) => {
    const role = await access(db, workspace, user, "manage");
    if (action === "settings") {
      const { name } = z
        .object({ name: z.string().trim().min(2).max(80) })
        .parse(input);
      await db.query("UPDATE workspaces SET name=$1 WHERE id=$2", [
        name,
        workspace,
      ]);
      await record(db, workspace, user, "workspace.updated", { name });
      return { ok: true };
    }
    if (action === "invite") {
      const data = z
        .object({
          email: z.email().transform((s) => s.toLowerCase()),
          role: z.enum(["admin", "member", "viewer"]),
        })
        .parse(input);
      if (data.role === "admin" && role !== "owner")
        throw new AppError(403, "Only owners can invite admins");
      const raw = token();
      await db.query(
        "INSERT INTO invitations(workspace_id,email,role,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '7 days')",
        [workspace, data.email, data.role, digest(raw)],
      );
      await record(db, workspace, user, "member.invited", {
        email: data.email,
        role: data.role,
      });
      return { url: `${process.env.APP_ORIGIN}/invite/${raw}` };
    }
    if (action === "member") {
      const data = z
        .object({
          userId: z.uuid(),
          role: z.enum(["admin", "member", "viewer"]).optional(),
          remove: z.boolean().optional(),
        })
        .parse(input);
      const target = await db.query<{ role: string }>(
        "SELECT role FROM members WHERE workspace_id=$1 AND user_id=$2 FOR UPDATE",
        [workspace, data.userId],
      );
      if (!target.rowCount) throw new AppError(404, "Member not found");
      if (
        target.rows[0].role === "owner" ||
        ((target.rows[0].role === "admin" || data.role === "admin") &&
          role !== "owner")
      )
        throw new AppError(
          403,
          "Only owners can manage administrators; owners cannot be removed",
        );
      if (data.remove) {
        await db.query(
          "UPDATE issues SET assignee_id=NULL,version=version+1 WHERE workspace_id=$1 AND assignee_id=$2",
          [workspace, data.userId],
        );
        await db.query(
          "DELETE FROM members WHERE workspace_id=$1 AND user_id=$2",
          [workspace, data.userId],
        );
      } else if (data.role)
        await db.query(
          "UPDATE members SET role=$1 WHERE workspace_id=$2 AND user_id=$3",
          [data.role, workspace, data.userId],
        );
      else throw new AppError(422, "Choose a role or remove the member");
      await record(db, workspace, user, "member.updated", data);
      await db.query(
        "INSERT INTO notifications(workspace_id,user_id,title) SELECT workspace_id,user_id,$2 FROM members WHERE workspace_id=$1",
        [workspace, "Workspace membership changed"],
      );
      return { ok: true };
    }
    throw new AppError(404, "Unknown action");
  });
}
export async function acceptInvitation(
  user: { id: string; email: string },
  raw: string,
) {
  return transaction(async (db) => {
    const { rows } = await db.query<{
      id: string;
      workspace_id: string;
      email: string;
      role: string;
    }>(
      "SELECT * FROM invitations WHERE token_hash=$1 AND expires_at>now() AND accepted_at IS NULL FOR UPDATE",
      [digest(raw)],
    );
    const invite = rows[0];
    if (!invite)
      throw new AppError(404, "Invitation is expired or has already been used");
    if (invite.email !== user.email)
      throw new AppError(403, "Sign in using the invited email address");
    await db.query(
      "INSERT INTO members VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [invite.workspace_id, user.id, invite.role],
    );
    await db.query("UPDATE invitations SET accepted_at=now() WHERE id=$1", [
      invite.id,
    ]);
    await record(db, invite.workspace_id, user.id, "member.joined");
    return { workspaceId: invite.workspace_id };
  });
}
export async function projectAction(
  workspace: string,
  user: string,
  input: unknown,
) {
  const data = z
    .object({
      id: z.uuid().optional(),
      name: z.string().trim().min(2).max(80),
      key: z.string().regex(/^[A-Z][A-Z0-9]{1,7}$/),
      description: z.string().max(2000).default(""),
      archived: z.boolean().default(false),
      memberIds: z.array(z.uuid()).max(1000).optional(),
    })
    .parse(input);
  return transaction(async (db) => {
    await access(db, workspace, user, "manage");
    const result = data.id
      ? await db.query<{ id: string }>(
          "UPDATE projects SET name=$1,key=$2,description=$3,archived=$4 WHERE workspace_id=$5 AND id=$6 RETURNING id",
          [
            data.name,
            data.key,
            data.description,
            data.archived,
            workspace,
            data.id,
          ],
        )
      : await db.query<{ id: string }>(
          "INSERT INTO projects(workspace_id,name,key,description) VALUES($1,$2,$3,$4) RETURNING id",
          [workspace, data.name, data.key, data.description],
        );
    if (!result.rowCount) throw new AppError(404, "Project not found");
    const id = result.rows[0].id;
    if (data.memberIds) {
      await db.query("DELETE FROM project_members WHERE project_id=$1", [id]);
      for (const member of data.memberIds)
        await db.query("INSERT INTO project_members VALUES($1,$2,$3)", [
          workspace,
          id,
          member,
        ]);
    }
    await record(db, workspace, user, "project.updated", data, null, id);
    return { id };
  });
}
