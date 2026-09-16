import "server-only";
import pg, { type PoolClient } from "pg";
// Preserve date-only values rather than applying the server timezone.
pg.types.setTypeParser(1082, (value) => value);
const globalDb = globalThis as unknown as { pool?: pg.Pool };
export const pool =
  globalDb.pool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
if (process.env.NODE_ENV !== "production") globalDb.pool = pool;
export async function transaction<T>(
  fn: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const value = await fn(db);
    await db.query("COMMIT");
    return value;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
