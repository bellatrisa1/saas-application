import { describe, it, expect } from "vitest";
const origin = process.env.TEST_ORIGIN ?? "http://localhost:3000";
const run = process.env.RUN_INTEGRATION === "1" ? describe : describe.skip;
run("real API and PostgreSQL invariants", () => {
  it("enforces CSRF, tenant isolation, optimistic versions, invitations and session revocation", async () => {
    const suffix = crypto.randomUUID();
    let cookie = "";
    async function req(
      path: string,
      method = "GET",
      data?: unknown,
      auth = cookie,
    ) {
      return fetch(`${origin}${path}`, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: auth,
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
    }
    const email = `integration-${suffix}@test.local`;
    const registered = await req("/api/auth/register", "POST", {
      email,
      name: "Integration Owner",
      password: "integration-password-2026",
    });
    expect(registered.status).toBe(200);
    cookie = registered.headers.get("set-cookie")!.split(";")[0];
    expect(registered.headers.get("set-cookie")).toMatch(/httponly/i);
    expect(
      (
        await fetch(`${origin}/api/workspaces`, {
          method: "POST",
          headers: {
            Cookie: cookie,
            Origin: "https://evil.example",
            "Content-Type": "application/json",
          },
          body: '{"name":"bad"}',
        })
      ).status,
    ).toBe(403);
    const w = (await (
      await req("/api/workspaces", "POST", { name: "Integration" })
    ).json()) as {
      id: string;
    };
    const other = (await (
      await req("/api/workspaces", "POST", { name: "Other tenant" })
    ).json()) as { id: string };
    const p = (await (
      await req(`/api/w/${w.id}/projects`, "POST", {
        name: "Project",
        key: "INT",
      })
    ).json()) as { id: string };
    expect(
      (
        await req(`/api/w/${other.id}/issues`, "POST", {
          title: "Cross-tenant",
          projectId: p.id,
        })
      ).status,
    ).toBe(422);
    const issue = (await (
      await req(`/api/w/${w.id}/issues`, "POST", {
        title: "Original",
        projectId: p.id,
      })
    ).json()) as { id: string; version: number };
    const updates = await Promise.all([
      req(`/api/w/${w.id}/issues/${issue.id}`, "PATCH", {
        title: "A",
        version: 1,
      }),
      req(`/api/w/${w.id}/issues/${issue.id}`, "PATCH", {
        title: "B",
        version: 1,
      }),
    ]);
    expect(updates.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await req(`/api/w/${other.id}/issues/${issue.id}`)).status).toBe(
      404,
    );
    expect((await req(`/api/w/${w.id}/issues?q=status:invalid`)).status).toBe(
      422,
    );
    const audit = (await (await req(`/api/w/${w.id}/activity`)).json()) as {
      action: string;
    }[];
    expect(audit.filter((a) => a.action === "issue.updated")).toHaveLength(1);
    // Exercise empty and continuation cursors through the real adapters.
    expect((await req(`/api/w/${w.id}/notifications?cursor=`)).status).toBe(
      200,
    );
    expect((await req(`/api/w/${w.id}/members?cursor=`)).status).toBe(200);
    for (let n = 0; n < 55; n++) {
      expect(
        (
          await req(`/api/w/${w.id}/issues`, "POST", {
            title: `Paged ${n}`,
            projectId: p.id,
          })
        ).status,
      ).toBe(200);
    }
    const first = (await (await req(`/api/w/${w.id}/issues`)).json()) as {
      items: { id: string }[];
      next: string;
    };
    const second = (await (
      await req(`/api/w/${w.id}/issues?cursor=${first.next}`)
    ).json()) as { items: { id: string }[] };
    expect(first.items).toHaveLength(50);
    expect(second.items).toHaveLength(6);
    expect(
      new Set([...first.items, ...second.items].map((i) => i.id)).size,
    ).toBe(56);
    const invite = (await (
      await req(`/api/w/${w.id}/invite`, "POST", { email, role: "member" })
    ).json()) as { url: string };
    const token = invite.url.split("/").at(-1);
    expect((await req("/api/invitations", "POST", { token })).status).toBe(200);
    expect((await req("/api/invitations", "POST", { token })).status).toBe(404);
    const outsider = await req("/api/auth/register", "POST", {
      email: `outsider-${suffix}@test.local`,
      name: "Outsider",
      password: "integration-password-2026",
    });
    const outsiderCookie = outsider.headers.get("set-cookie")!.split(";")[0];
    expect(
      (await req(`/api/w/${w.id}/issues`, "GET", undefined, outsiderCookie))
        .status,
    ).toBe(403);
    expect((await req("/api/auth/logout", "POST", {})).status).toBe(200);
    expect((await req("/api/workspaces")).status).toBe(401);
  });
});
