import { z } from "zod";
import { AppError } from "@/lib/domain";
import { requireUser } from "@/server/auth";
import { transaction } from "@/server/db";
import { access, record } from "@/server/access";
import { getIssue } from "@/server/issues";
import { respond, sameOrigin, limitedBody } from "@/server/http";
type Context = { params: Promise<{ workspace: string }> };
export async function POST(request: Request, { params }: Context) {
  return respond(async () => {
    sameOrigin(request);
    const user = await requireUser();
    const workspace = z.uuid().parse((await params).workspace);
    if (Number(request.headers.get("content-length") ?? 0) > 5300000)
      throw new AppError(413, "Maximum upload size is 5 MB");
    const bytesBody = await limitedBody(request, 5300000);
    const form = await new Response(Buffer.from(bytesBody), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const id = z.uuid().parse(form.get("issueId"));
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 5242880 || !file.size)
      throw new AppError(422, "Choose a file between 1 byte and 5 MB");
    const bytes = Buffer.from(await file.arrayBuffer());
    return transaction(async (db) => {
      await access(db, workspace, user.id, "issue");
      const issue = await getIssue(db, workspace, id);
      await db.query("SELECT id FROM issues WHERE id=$1 FOR UPDATE", [id]);
      if (
        Number(
          (
            await db.query(
              "SELECT count(*) FROM attachments WHERE issue_id=$1",
              [id],
            )
          ).rows[0].count,
        ) >= 20
      )
        throw new AppError(422, "Maximum 20 attachments per issue");
      const { rows } = await db.query(
        "INSERT INTO attachments(workspace_id,issue_id,name,mime,size,content) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
        [
          workspace,
          id,
          file.name.slice(0, 180),
          "application/octet-stream",
          file.size,
          bytes,
        ],
      );
      await record(
        db,
        workspace,
        user.id,
        "issue.attachment",
        {},
        id,
        issue.project_id,
      );
      return rows[0];
    });
  });
}
export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const workspace = z.uuid().parse((await params).workspace);
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const file = await transaction(async (db) => {
      await access(db, workspace, user.id);
      const { rows } = await db.query<{ content: Buffer; name: string }>(
        "SELECT content,name FROM attachments WHERE workspace_id=$1 AND id=$2",
        [workspace, id],
      );
      if (!rows[0]) throw new AppError(404, "Attachment not found");
      return rows[0];
    });
    return new Response(new Uint8Array(file.content), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return respond(async () => {
      throw error;
    });
  }
}
