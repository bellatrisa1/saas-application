import type { PoolClient } from 'pg';
import { AppError, can, type Role } from '@/lib/domain';
export async function access(
  db: PoolClient,
  workspace: string,
  user: string,
  action: Parameters<typeof can>[1] = 'read'
) {
  const { rows } = await db.query<{ role: Role }>(
    'SELECT role FROM members WHERE workspace_id=$1 AND user_id=$2 FOR SHARE',
    [workspace, user]
  );
  if (!rows[0]) throw new AppError(403, 'You do not belong to this workspace');
  if (!can(rows[0].role, action)) throw new AppError(403, 'Your role does not allow this action');
  return rows[0].role;
}
export async function record(
  db: PoolClient,
  workspace: string,
  actor: string,
  action: string,
  data: unknown = {},
  issue: string | null = null,
  project: string | null = null
) {
  await db.query(
    'INSERT INTO activity(workspace_id,actor_id,action,data,issue_id,project_id) VALUES($1,$2,$3,$4,$5,$6)',
    [workspace, actor, action, JSON.stringify(data), issue, project]
  );
  // Serialize event allocation through commit, so cursor order cannot skip a late commit.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [workspace]);
  await db.query('INSERT INTO events(workspace_id,kind) VALUES($1,$2)', [
    workspace,
    action.split('.')[0],
  ]);
}
