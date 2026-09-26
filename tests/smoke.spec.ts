import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end smoke test of the reviewer's path. Works in both modes:
 * LLM_PROVIDER=anthropic (live) and LLM_PROVIDER=none (scripted/offline).
 */

async function openDemo(page: Page) {
  await page.goto("/demo");
  await page.waitForURL(/\/p\/[0-9a-f-]+\/blueprint/);
  return page.url().split("?")[0].replace(/\/blueprint$/, "");
}

test("landing renders real content on first paint", async ({ request }) => {
  const res = await request.get("/");
  expect(res.ok()).toBeTruthy();
  const html = await res.text();
  expect(html).toContain("in production.");
  expect(html).toContain("Try the demo");
});

test("demo → blueprint → inspector faces", async ({ page }) => {
  await openDemo(page);
  await expect(page.getByRole("button", { name: /Settlement/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Settlement/ }).filter({ hasText: "Prepares payouts" }).first().click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await expect(inspector.getByText("What it's allowed to do")).toBeVisible();
  await inspector.getByRole("radio", { name: /Code/ }).click();
  await expect(inspector.getByText("agent.yaml").first()).toBeVisible();
});

test("preview: point-and-tweak is free and makes a save point", async ({ page }) => {
  const base = await openDemo(page);
  await page.goto(`${base}/preview`);
  await expect(page.getByText("CLM-20931").first()).toBeVisible();
  await page.getByRole("radio", { name: /Tweak/ }).click();
  await page.getByRole("heading", { name: "New and in-progress claims" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Today's claims");
  await page.getByRole("button", { name: "Save · free" }).click();
  await expect(page.getByText("Tweaked", { exact: true })).toBeVisible();
});

test("agent playground asks before an irreversible action", async ({ page }) => {
  const base = await openDemo(page);
  await page.goto(`${base}/agents?agent=settlement&tab=playground`);
  await page.getByRole("textbox", { name: /Message Settlement/ }).fill("CLM-20935 for Grace Liu is approved at $1,640. Pay her by ACH now.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const approval = page.getByRole("group", { name: "Approval needed" });
  await expect(approval).toBeVisible({ timeout: 90_000 });
  await approval.getByRole("button", { name: /Allow once/ }).click();
  await expect(page.getByText(/approved · done|done/).first()).toBeVisible({ timeout: 90_000 });
});

test("ship: preflight passes and the live URL serves the app", async ({ page }) => {
  const base = await openDemo(page);
  await page.goto(`${base}/ship`);
  await expect(page.getByText("Ready to go live")).toBeVisible();
  const slug = (await page.locator("code").filter({ hasText: "/live/" }).first().innerText()).trim();
  await page.goto(slug);
  await expect(page.getByText("Built with Wonderwork")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Intake Queue" })).toBeVisible();
});

test("new project: plan → Work Order → build with a repair → built", async ({ page }) => {
  test.setTimeout(240_000);
  await openDemo(page);
  await page.goto("/new?prompt=" + encodeURIComponent("A support inbox for a small SaaS team: read tickets, draft replies from the help centre, and escalate outages to on-call."));
  await page.getByRole("button", { name: /Skip, use sensible defaults/ }).click();
  await page.waitForURL(/\/p\/[0-9a-f-]+\/blueprint/, { timeout: 150_000 });
  await page.getByRole("button", { name: /Build it/ }).click();
  await page.getByRole("radio", { name: /Skip/ }).click();
  const repair = page.getByRole("alertdialog");
  await expect(repair).toBeVisible({ timeout: 60_000 });
  await repair.getByRole("button", { name: /Use this fix/ }).first().click();
  await expect(page.getByText("Built", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
});

test("import: public repo → stack report → house rules → mapped project", async ({ page }) => {
  test.setTimeout(240_000);
  await openDemo(page);
  await page.goto("/new?mode=import&repo=langchain-ai/langgraph-example");
  await expect(page.getByText("LangGraph").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "House Rules" })).toBeVisible();
  await page.getByRole("button", { name: /Sign House Rules and map it/ }).click();
  await page.waitForURL(/\/p\/[0-9a-f-]+\/blueprint/, { timeout: 150_000 });
  await expect(page.getByText("Signed").first()).toBeVisible();
});

test("handoff: ask a teammate → see what they see → resolve", async ({ page }) => {
  const base = await openDemo(page);
  await page.goto(`${base}/blueprint?sel=connection:policy-system`);
  await page.getByRole("complementary", { name: "Inspector" }).getByRole("button", { name: /Ask a teammate/ }).first().click();
  await page.getByRole("button", { name: /Send with context/ }).click();
  await page.goto(`${base}/handoffs`);
  await page.getByRole("button", { name: /Resolve as/ }).click();
  await expect(page.getByText(/Resolved/).first()).toBeVisible();
});

test("ask for a change → priced Work Order → approve → new save point", async ({ page }) => {
  test.setTimeout(180_000);
  const base = await openDemo(page);
  await page.goto(`${base}/blueprint?sel=screen:intake-queue`);
  const composer = page.getByRole("textbox", { name: "Ask for a change" });
  await composer.fill("Add an SLA risk column to the claims table");
  await composer.press("Enter");
  const order = page.getByRole("region", { name: "Work Order" });
  await expect(order).toBeVisible({ timeout: 120_000 });
  await order.getByRole("button", { name: /Approve/ }).click();
  await expect(page.getByText(/Save point #\d+/).first()).toBeVisible({ timeout: 30_000 });
});
