import { test, expect, type Page, type Locator } from "@playwright/test";
const password = "Test-password-2026!";
const suffix = Date.now();
async function register(page: Page, email: string, name: string) {
  await page.goto("/register");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Create workspace", exact: true }).first(),
  ).toBeVisible();
}

async function dragIssue(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("Drag target is not visible");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from.x + from.width / 2 + 12,
    from.y + from.height / 2,
    { steps: 4 },
  );
  await page.mouse.move(to.x + to.width / 2, to.y + 90, { steps: 20 });
  await page.mouse.up();
}
test("critical lifecycle, permissions, and realtime between sessions", async ({
  page,
  browser,
}) => {
  const email = `owner-${suffix}@test.local`;
  const viewerEmail = `viewer-${suffix}@test.local`;
  await register(page, email, "Test Owner");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .last()
    .click();
  await page.getByLabel("Workspace name").fill("E2E Team");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page.getByLabel("Switch workspace")).toHaveValue(/.+/);
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .first()
    .click();
  await page.getByLabel("Project name").fill("Launch");
  await page.getByLabel("Project identifier").fill("LCH");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page.getByRole("button", { name: "Create issue", exact: true }).click();
  await page.getByLabel("Issue title").fill("Ship the first release");
  await page
    .getByRole("combobox", { name: "Assignee", exact: true })
    .selectOption({ label: "Test Owner" });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create issue", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Ship the first release", exact: true }),
  ).toBeVisible();
  const workspace = await page.getByLabel("Switch workspace").inputValue();
  await page.getByRole("button", { name: "Open command menu" }).click();
  await page.getByRole("option", { name: /Invite member/ }).click();
  await page.getByRole("dialog").getByLabel("Email address").fill(viewerEmail);
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Role", exact: true })
    .selectOption("viewer");
  await page.getByRole("button", { name: "Create invitation" }).click();
  const invite = await page.getByLabel("Invitation link").inputValue();
  await page.getByRole("button", { name: "Close dialog" }).click();
  const viewerContext = await browser.newContext();
  const viewer = await viewerContext.newPage();
  await register(viewer, viewerEmail, "Test Viewer");
  await viewer.goto(invite);
  await viewer.getByRole("button", { name: "Accept invitation" }).click();
  await expect(
    viewer.getByRole("button", { name: "Ship the first release", exact: true }),
  ).toBeVisible();
  await expect(
    viewer.getByRole("button", { name: "Create issue", exact: true }),
  ).toHaveCount(0);
  const forbidden = await viewer.request.post(`/api/w/${workspace}/issues`, {
    headers: { Origin: "http://localhost:3000" },
    data: { title: "Forbidden" },
  });
  expect(forbidden.status()).toBe(403);
  const drag = page.getByRole("button", {
    name: "Drag Ship the first release",
  });
  const target = page.getByRole("region", { name: "In progress column" });
  await dragIssue(page, drag, target);
  await expect(
    target.getByRole("button", { name: "Ship the first release", exact: true }),
  ).toBeVisible();
  await expect(
    viewer
      .getByRole("region", { name: "In progress column" })
      .getByRole("button", { name: "Ship the first release", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await page
    .getByRole("button", { name: "Ship the first release", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Comment", exact: true })
    .fill(`Ready for review @${viewerEmail}`);
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(
    page.getByText(`Ready for review @${viewerEmail}`, { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await viewer.getByRole("button", { name: /^Inbox/ }).click();
  await expect(
    viewer.getByRole("button", { name: /New comment on LCH-1/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Test Owner owner/i }).click();
  await expect(page).toHaveURL(/login/);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Switch workspace")).toBeVisible();
  await viewerContext.close();
  await page.getByRole("button", { name: "List view" }).click();
  await page
    .getByRole("textbox", { name: "Search issues", exact: true })
    .fill("status:in-progress");
  await page
    .getByRole("textbox", { name: "Search issues", exact: true })
    .press("Enter");
  await expect(page).toHaveURL(/q=status/);
  await expect(
    page.getByRole("button", { name: /Ship the first release/ }),
  ).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByRole("textbox", { name: "Search commands" }).fill("theme");
  await page.getByRole("textbox", { name: "Search commands" }).press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Board view" }).click();
  await page.route("**/api/w/*/issues/*", async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "Concurrent edit conflict" }),
      });
    else await route.continue();
  });
  await dragIssue(
    page,
    page.getByRole("button", { name: "Drag Ship the first release" }),
    page.getByRole("region", { name: "Done column" }),
  );
  await expect(
    page.getByRole("alert").filter({ hasText: "Concurrent edit conflict" }),
  ).toContainText("Concurrent edit conflict");
  await expect(
    page
      .getByRole("region", { name: "In progress column" })
      .getByRole("button", { name: "Ship the first release", exact: true }),
  ).toBeVisible();
});

test("editing preserves assignees and drafts; nested palette closes independently", async ({
  page,
}) => {
  const email = `draft-${crypto.randomUUID()}@test.local`;
  const headers = { Origin: "http://localhost:3000" };
  const register = await page.request.post("/api/auth/register", {
    headers,
    data: { email, name: "Draft tester", password: "Draft-password-2026!" },
  });
  expect(register.status()).toBe(200);
  const workspace = (
    await (
      await page.request.post("/api/workspaces", {
        headers,
        data: { name: "Draft test" },
      })
    ).json()
  ).id;
  const project = (
    await (
      await page.request.post(`/api/w/${workspace}/projects`, {
        headers,
        data: { name: "Draft project", key: "DFT" },
      })
    ).json()
  ).id;
  const owner = (
    await (await page.request.get(`/api/w/${workspace}/members`)).json()
  )[0].user_id;
  const issue = await (
    await page.request.post(`/api/w/${workspace}/issues`, {
      headers,
      data: { projectId: project, title: "Original draft", assigneeId: owner },
    })
  ).json();
  await page.goto(`/?workspace=${workspace}&issue=${issue.id}`);
  await expect(page.getByLabel("Issue title")).toHaveValue("Original draft");
  await page.getByLabel("Search members").fill("no-matching-person");
  await expect(
    page.getByRole("combobox", { name: "Assignee", exact: true }),
  ).toHaveValue(owner);
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("dialog", { name: "Command menu" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Search commands" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Command menu" })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Issue title")).toBeVisible();
  await page.getByLabel("Issue title").fill("My unsaved draft");
  const remote = await page.request.patch(
    `/api/w/${workspace}/issues/${issue.id}`,
    { headers, data: { title: "Remote edit", version: 1 } },
  );
  expect(remote.status()).toBe(200);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "This issue changed" }),
  ).toBeVisible();
  await expect(page.getByLabel("Issue title")).toHaveValue("My unsaved draft");
  expect(
    (
      await (
        await page.request.get(`/api/w/${workspace}/issues/${issue.id}`)
      ).json()
    ).title,
  ).toBe("Remote edit");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Hide sidebar" }).click();
  await expect(page.getByRole("complementary")).toBeHidden();
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await expect(page.getByRole("complementary")).toBeVisible();
});
