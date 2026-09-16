import { credentials, AppError } from "@/lib/domain";
import { pool } from "@/server/db";
import { createSession, logout, rateLimit } from "@/server/auth";
import { hashPassword, verifyPassword } from "@/server/password";
import { respond, body, sameOrigin } from "@/server/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  return respond(async () => {
    sameOrigin(request);
    const { action } = await params;
    if (action === "logout") {
      await logout();
      return { ok: true };
    }
    if (!["register", "login"].includes(action))
      throw new AppError(404, "Unknown action");
    const input = credentials.parse(await body(request));
    await rateLimit(`auth:${input.email}`);
    if (action === "register") {
      if (!input.name) throw new AppError(422, "Name is required");
      const { rows } = await pool.query<{ id: string }>(
        "INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id",
        [input.email, input.name, await hashPassword(input.password)],
      );
      await createSession(rows[0].id);
    } else {
      const { rows } = await pool.query<{ id: string; password_hash: string }>(
        "SELECT id,password_hash FROM users WHERE email=$1",
        [input.email],
      );
      const fallback = "00000000000000000000000000000000:" + "00".repeat(64);
      const valid = await verifyPassword(
        input.password,
        rows[0]?.password_hash ?? fallback,
      );
      if (!rows[0] || !valid)
        throw new AppError(401, "Email or password is incorrect");
      await createSession(rows[0].id);
    }
    return { ok: true };
  });
}
