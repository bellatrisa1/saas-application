import "dotenv/config";
import pg from "pg";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query("BEGIN");
  const user = (
    await db.query<{ id: string }>(
      "INSERT INTO users(email,name,password_hash) VALUES($1,'Scale owner','not-a-login') RETURNING id",
      [`scale-${crypto.randomUUID()}@test.local`],
    )
  ).rows[0].id;
  const workspace = (
    await db.query<{ id: string }>(
      "INSERT INTO workspaces(name) VALUES('Scale check') RETURNING id",
    )
  ).rows[0].id;
  await db.query("INSERT INTO members VALUES($1,$2,'owner')", [
    workspace,
    user,
  ]);
  const project = (
    await db.query<{ id: string }>(
      "INSERT INTO projects(workspace_id,name,key) VALUES($1,'Scale','SC') RETURNING id",
      [workspace],
    )
  ).rows[0].id;
  await db.query(
    "INSERT INTO users(email,name,password_hash) SELECT $1||'-'||n||'@scale.local','Member '||n,'not-a-login' FROM generate_series(1,1000) n",
    [workspace],
  );
  await db.query(
    "INSERT INTO members SELECT $1,id,'member' FROM users WHERE email LIKE $2",
    [workspace, `${workspace}-%@scale.local`],
  );
  await db.query(
    "INSERT INTO issues(workspace_id,project_id,number,title,status,priority,reporter_id) SELECT $1,$2,n,'Scale issue '||n,(ARRAY['backlog','todo','in-progress','in-review','done'])[1+n%5],'medium',$3 FROM generate_series(1,10000) n",
    [workspace, project, user],
  );
  await db.query("ANALYZE issues");
  const plan = await db.query(
    "EXPLAIN (ANALYZE, BUFFERS) SELECT id,title FROM issues WHERE workspace_id=$1 AND status='in-progress' ORDER BY created_at DESC,id DESC LIMIT 51",
    [workspace],
  );
  console.log(plan.rows.map((r) => r["QUERY PLAN"]).join("\n"));
} finally {
  await db.query("ROLLBACK");
  await db.end();
}
