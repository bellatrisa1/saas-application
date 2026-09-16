import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto("http://localhost:3000/login");
await page.getByLabel("Email address").fill("bella@orbit.local");
await page
  .getByLabel("Password", { exact: true })
  .fill(process.env.SEED_PASSWORD);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page
  .getByRole("button", { name: "Build the command menu", exact: true })
  .waitFor();
await page.screenshot({ path: "docs/workspace.png", fullPage: true });
await browser.close();
