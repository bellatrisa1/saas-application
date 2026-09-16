import { z } from "zod";
import { requireUser, cookieName } from "@/server/auth";
import { cookies } from "next/headers";
import { digest } from "@/server/password";
import { pool, transaction } from "@/server/db";
import { access } from "@/server/access";
import { respond } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ workspace: string }> },
) {
  let workspace: string;
  let userId: string;
  let session: string;
  try {
    workspace = z.uuid().parse((await params).workspace);
    userId = (await requireUser()).id;
    session = digest((await cookies()).get(cookieName)!.value);
    await transaction((db) => access(db, workspace, userId));
  } catch (error) {
    return respond(async () => {
      throw error;
    });
  }
  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let timer: ReturnType<typeof setTimeout>;
      let cursor: string | null = null;
      const started = Date.now();
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      stop = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        controller.close();
        request.signal.removeEventListener("abort", stop);
      };
      request.signal.addEventListener("abort", stop);
      const tick = async () => {
        try {
          const valid = await pool.query(
            "SELECT 1 FROM members m JOIN sessions s ON s.user_id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND s.token_hash=$3 AND s.expires_at>now()",
            [workspace, userId, session],
          );
          if (!valid.rowCount) {
            send("event: revoked\ndata: {}\n\n");
            stop();
            return;
          }
          if (Date.now() - started > 240000) {
            stop();
            return;
          }
          if (cursor === null) {
            cursor = (
              await pool.query(
                "SELECT COALESCE(max(id),0)::text id FROM events WHERE workspace_id=$1",
                [workspace],
              )
            ).rows[0].id;
            send("event: ready\ndata: {}\n\n");
          } else {
            const { rows } = await pool.query<{ id: string; kind: string }>(
              "SELECT id::text,kind FROM events WHERE workspace_id=$1 AND id>$2 ORDER BY id LIMIT 100",
              [workspace, cursor],
            );
            for (const row of rows) {
              send(
                `id: ${row.id}\nevent: change\ndata: ${JSON.stringify({ kind: row.kind })}\n\n`,
              );
              cursor = row.id;
            }
          }
          send(": heartbeat\n\n");
          if (!closed) timer = setTimeout(tick, 1500);
        } catch (error) {
          console.error("SSE failure", error);
          stop();
        }
      };
      void tick();
    },
    cancel() {
      stop();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
