import type { PoolClient } from "pg";

/** Keep the bigint sort independent of the serialized text ID. */
export async function eventsAfter(
  db: Pick<PoolClient, "query">,
  workspace: string,
  cursor: string,
) {
  return db.query<{ id: string; kind: string }>(
    "SELECT id::text,kind FROM events WHERE workspace_id=$1 AND id>$2 ORDER BY events.id LIMIT 100",
    [workspace, cursor],
  );
}
