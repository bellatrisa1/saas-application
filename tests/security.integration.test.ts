import "dotenv/config";
import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { eventsAfter } from "../src/server/events";
import { digest } from "../src/server/password";

const suite = process.env.RUN_INTEGRATION === "1" ? describe : describe.skip;
const origin = process.env.TEST_ORIGIN ?? "http://localhost:3000";
type Actor = { cookie: string; email: string; id: string };
async function request(
  actor: Actor,
  path: string,
  method = "GET",
  data?: unknown,
) {
  return fetch(`${origin}${path}`, {
    method,
    headers: {
      Origin: origin,
      Cookie: actor.cookie,
      "Content-Type": "application/json",
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
async function register(): Promise<Actor> {
  const email = `security-${crypto.randomUUID()}@test.local`;
  const response = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      name: "Security tester",
      password: "Security-test-2026!",
    }),
  });
  expect(response.status).toBe(200);
  return {
    email,
    cookie: response.headers.get("set-cookie")!.split(";")[0],
    id: "",
  };
}
suite("security and data integrity", () => {
  let owner: Actor, viewer: Actor, member: Actor, admin: Actor;
  let workspace: string, project: string, issue: string;
  beforeAll(async () => {
    owner = await register();
    viewer = await register();
    member = await register();
    admin = await register();
    workspace = (
      await (
        await request(owner, "/api/workspaces", "POST", {
          name: "Security checks",
        })
      ).json()
    ).id;
    for (const [actor, role] of [
      [viewer, "viewer"],
      [member, "member"],
      [admin, "admin"],
    ] as const) {
      const invitation = await (
        await request(owner, `/api/w/${workspace}/invite`, "POST", {
          email: actor.email,
          role,
        })
      ).json();
      expect(
        (
          await request(actor, "/api/invitations", "POST", {
            token: invitation.url.split("/").at(-1),
          })
        ).status,
      ).toBe(200);
    }
    const members = (await (
      await request(owner, `/api/w/${workspace}/members`)
    ).json()) as { email: string; user_id: string }[];
    for (const actor of [owner, viewer, member, admin])
      actor.id = members.find((m) => m.email === actor.email)!.user_id;
    project = (
      await (
        await request(owner, `/api/w/${workspace}/projects`, "POST", {
          name: "Security",
          key: "SEC",
        })
      ).json()
    ).id;
    issue = (
      await (
        await request(owner, `/api/w/${workspace}/issues`, "POST", {
          projectId: project,
          title: "Keep fields",
          description: "Preserve me",
          status: "in-progress",
          priority: "high",
          assigneeId: member.id,
          dueDate: "2026-10-01",
          labels: ["frontend"],
        })
      ).json()
    ).id;
  });
  it("enforces every role boundary and rejects unintended routes", async () => {
    const base = `/api/w/${workspace}`;
    for (const path of ["/issues", "/projects", "/invite", "/settings"])
      expect(
        (await request(viewer, base + path, "POST", {})).status,
      ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await request(member, base + "/settings", "POST", {
          name: "Unauthorized",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(admin, base + "/member", "POST", {
          userId: owner.id,
          remove: true,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(admin, base + "/invite", "POST", {
          email: "admin@test.local",
          role: "admin",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(owner, base + "/issues", "DELETE", {
          title: "Must not create",
          projectId: project,
        })
      ).status,
    ).toBe(405);
    expect(
      (
        await request(owner, base + `/issues/${issue}/typo`, "PATCH", {
          title: "Must not change",
          version: 1,
        })
      ).status,
    ).toBe(404);
    expect((await request(owner, base + "/projects/typo")).status).toBe(404);
  });
  it("preserves omitted fields, date-only values, and assignment notifications", async () => {
    const updated = await request(
      member,
      `/api/w/${workspace}/issues/${issue}`,
      "PATCH",
      { title: "Renamed", version: 1 },
    );
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({
      description: "Preserve me",
      status: "in-progress",
      priority: "high",
      assignee_id: member.id,
      due_date: "2026-10-01",
      labels: ["frontend"],
    });
    const notifications = await (
      await request(member, `/api/w/${workspace}/notifications?cursor=`)
    ).json();
    expect(notifications.unread).toBeGreaterThan(0);
    expect(
      (await request(member, `/api/w/${workspace}/notifications`, "POST", {}))
        .status,
    ).toBe(200);
    expect(
      (
        await (
          await request(member, `/api/w/${workspace}/notifications`)
        ).json()
      ).unread,
    ).toBe(0);
  });
  it("keeps attachments private and rejects malformed uploads", async () => {
    const path = `/api/w/${workspace}/attachments`;
    const upload = async (actor: Actor) => {
      const form = new FormData();
      form.set("issueId", issue);
      form.set("file", new Blob(["private content"]), "sample.txt");
      return fetch(origin + path, {
        method: "POST",
        headers: { Cookie: actor.cookie, Origin: origin },
        body: form,
      });
    };
    expect((await upload(viewer)).status).toBe(403);
    const result = await upload(member);
    expect(result.status).toBe(200);
    const file = await result.json();
    const download = await request(viewer, `${path}?id=${file.id}`);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain("attachment");
    expect(await download.text()).toBe("private content");
    const outsider = await register();
    expect((await request(outsider, `${path}?id=${file.id}`)).status).toBe(403);
    expect((await request(member, path, "POST", {})).status).toBe(400);
  });
  it("uses numeric event order across digit boundaries and enforces session expiration", async () => {
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    try {
      await db.query("BEGIN");
      await db.query(
        "CREATE TEMP TABLE events(id bigint PRIMARY KEY,workspace_id uuid,kind text) ON COMMIT DROP",
      );
      await db.query(
        "INSERT INTO events VALUES(9,$1,'issue'),(10,$1,'comment'),(11,$1,'member')",
        [workspace],
      );
      expect(
        (await eventsAfter(db, workspace, "0")).rows.map((r) => r.id),
      ).toEqual(["9", "10", "11"]);
      await db.query("ROLLBACK");
      const expired = await register();
      const raw = expired.cookie.slice(expired.cookie.indexOf("=") + 1);
      await db.query(
        "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
        [digest(raw)],
      );
      expect((await request(expired, "/api/workspaces")).status).toBe(401);
    } finally {
      await db.end();
    }
  });
});
