import { requireUser } from "@/server/auth";
import { pool } from "@/server/db";
import { respond, body, sameOrigin } from "@/server/http";
import { createWorkspace } from "@/server/workspaces";
export async function GET() {
  return respond(async () => {
    const user = await requireUser();
    return (
      await pool.query(
        "SELECT w.id,w.name,m.role FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE m.user_id=$1 ORDER BY w.created_at LIMIT 100",
        [user.id],
      )
    ).rows;
  });
}
export async function POST(request: Request) {
  return respond(async () => {
    sameOrigin(request);
    return createWorkspace((await requireUser()).id, await body(request));
  });
}
