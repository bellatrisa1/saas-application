import "dotenv/config";
import pg from "pg";
import { hashPassword } from "../src/server/password";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  await db.query("BEGIN");
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12)
    throw new Error("Set SEED_PASSWORD to at least 12 characters");
  const existing = await db.query("SELECT 1 FROM users WHERE email=$1", [
    "bella@orbit.local",
  ]);
  if (existing.rowCount)
    throw new Error("Seed user already exists; refusing to overwrite data");
  const hash = await hashPassword(password);
  const names = [
    ["Bella Morgan", "bella@orbit.local"],
    ["Anna Chen", "anna@orbit.local"],
    ["Victor Kim", "victor@orbit.local"],
    ["James Wilson", "james@orbit.local"],
  ];
  const users: string[] = [];
  for (const [name, email] of names)
    users.push(
      (
        await db.query<{ id: string }>(
          "INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id",
          [name, email, hash],
        )
      ).rows[0].id,
    );
  const workspace = (
    await db.query<{ id: string }>(
      "INSERT INTO workspaces(name) VALUES($1) RETURNING id",
      ["Acme Studio"],
    )
  ).rows[0].id;
  for (const [i, user] of users.entries())
    await db.query("INSERT INTO members VALUES($1,$2,$3)", [
      workspace,
      user,
      i === 0 ? "owner" : i === 3 ? "viewer" : "member",
    ]);
  const projectNames = [
    ["Platform", "ORB", "The foundation for better work."],
    ["Website redesign", "WEB", "A fresh perspective on our digital home."],
    ["Mobile app", "MOB", "Your workspace, wherever you are."],
  ];
  const projects: string[] = [];
  for (const [name, key, description] of projectNames)
    projects.push(
      (
        await db.query<{ id: string }>(
          "INSERT INTO projects(workspace_id,name,key,description) VALUES($1,$2,$3,$4) RETURNING id",
          [workspace, name, key, description],
        )
      ).rows[0].id,
    );
  const issues = [
    ["Explore workspace analytics", "backlog", "medium", ["research"]],
    ["Document API authentication", "backlog", "low", ["documentation"]],
    ["Design notification preferences", "backlog", "none", ["design"]],
    ["Add keyboard shortcuts", "todo", "high", ["enhancement"]],
    ["Improve empty states", "todo", "medium", ["design", "frontend"]],
    ["Set up error monitoring", "todo", "high", ["infrastructure"]],
    ["Build the command menu", "in-progress", "high", ["frontend"]],
    ["Refine onboarding experience", "in-progress", "medium", ["design"]],
    ["Optimize issue search queries", "in-progress", "urgent", ["performance"]],
    [
      "Workspace invitation flow",
      "in-review",
      "medium",
      ["frontend", "feature"],
    ],
    ["Update component library", "in-review", "low", ["design system"]],
    ["Implement secure sessions", "done", "high", ["security"]],
    ["Create project foundations", "done", "medium", ["infrastructure"]],
    ["Add light and dark themes", "done", "low", ["design"]],
  ] as const;
  for (const [i, [title, status, priority, labels]] of issues.entries())
    await db.query(
      "INSERT INTO issues(workspace_id,project_id,number,title,description,status,priority,assignee_id,reporter_id,labels) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        workspace,
        projects[i % 3],
        i + 101,
        title,
        "Align the implementation with our product principles. Keep it accessible, focused, and easy to use.",
        status,
        priority,
        users[i % 3],
        users[0],
        [...labels],
      ],
    );
  await db.query("UPDATE workspaces SET issue_counter=114 WHERE id=$1", [
    workspace,
  ]);
  await db.query(
    "INSERT INTO activity(workspace_id,actor_id,action,data) VALUES($1,$2,$3,$4)",
    [
      workspace,
      users[0],
      "workspace.created",
      JSON.stringify({ title: "Acme Studio" }),
    ],
  );
  await db.query("COMMIT");
  console.log(
    "Seeded Acme Studio. Sign in as bella@orbit.local with SEED_PASSWORD.",
  );
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  await db.end();
}
