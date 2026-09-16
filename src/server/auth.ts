import 'server-only';
import { cookies } from 'next/headers';
import { pool } from './db';
import { digest, token } from './password';
import { AppError } from '@/lib/domain';
export const cookieName = 'orbit_session';
export type User = { id: string; name: string; email: string };
export async function currentUser(): Promise<User | null> {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value) return null;
  const { rows } = await pool.query<User>(
    'SELECT u.id,u.name,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',
    [digest(value)]
  );
  return rows[0] ?? null;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new AppError(401, 'Please sign in to continue');
  return user;
}
export async function createSession(userId: string) {
  const raw = token();
  await pool.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
    [digest(raw), userId]
  );
  (await cookies()).set(cookieName, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 604800,
  });
}
export async function logout() {
  const jar = await cookies();
  const raw = jar.get(cookieName)?.value;
  if (raw) await pool.query('DELETE FROM sessions WHERE token_hash=$1', [digest(raw)]);
  jar.delete(cookieName);
}
export async function rateLimit(key: string) {
  const { rows } = await pool.query<{ count: number }>(
    `INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END,expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE rate_limits.expires_at END RETURNING count`,
    [digest(key)]
  );
  if (rows[0].count > 15) throw new AppError(429, 'Too many attempts. Try again in 15 minutes.');
}
