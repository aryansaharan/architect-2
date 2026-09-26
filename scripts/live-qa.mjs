// Live QA against a deployment with a real model: node scripts/live-qa.mjs https://architect-2-aryan.vercel.app
// Exercises a novel brief end to end and prints what happened at each step (live vs offline, timings).
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "https://architect-2-aryan.vercel.app";
const brief = process.argv[3] ?? "A reservations desk for a busy restaurant group: take bookings from the website and WhatsApp, remind guests the day before, manage the waitlist, and ask the manager before refunding any deposit.";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text().slice(0, 200)));
page.on("response", (r) => r.status() >= 500 && errors.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`));
const t0 = Date.now();
const log = (step, msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${step}: ${msg}`);
const snap = (n) => page.screenshot({ path: `/tmp/Q-${n}.png` });
async function step(name, fn) {
  const s = Date.now();
  try { const r = await fn(); log(name, `ok (${((Date.now() - s) / 1000).toFixed(1)}s) ${r ?? ""}`); }
  catch (e) { log(name, `FAILED ${(e.message || e).toString().split("\n")[0]}`); await snap(`fail-${name}`); }
}

await step("demo", async () => { await page.goto(base + "/demo"); await page.waitForURL(/\/blueprint/, { timeout: 60000 }); });

let proj = "";
await step("plan", async () => {
  await page.goto(base + "/new?prompt=" + encodeURIComponent(brief));
  await page.getByRole("button", { name: /Plan it/ }).click();
  await page.waitForTimeout(3000);
  const eyebrow = await page.locator("p.micro-label").first().innerText();
  await page.waitForURL(/\/p\/[0-9a-f-]+\/blueprint/, { timeout: 180000 });
  proj = page.url().split("?")[0].replace(/\/blueprint$/, "");
  await page.waitForTimeout(2000); await snap("plan-blueprint");
  const note = await page.locator("text=/offline|starter/i").count();
  const title = await page.locator("header h1").first().innerText();
  return `eyebrow="${eyebrow}" project="${title}" offlineMentions=${note}`;
});

await step("build", async () => {
  await page.getByRole("button", { name: /Build it/ }).click();
  await page.getByRole("radio", { name: /Skip/ }).click();
  const repair = page.getByRole("alertdialog");
  const done = page.getByRole("status").filter({ hasText: /built and rehearsed/ });
  await Promise.race([repair.waitFor({ timeout: 90000 }), done.waitFor({ timeout: 90000 })]);
  let r = "no repair";
  if (await repair.isVisible()) {
    r = "repair: " + (await repair.locator("h2, p").first().innerText()).slice(0, 90);
    await snap("build-repair");
    await repair.getByRole("button", { name: /Use this fix/ }).first().click();
  }
  await done.waitFor({ timeout: 90000 }); await snap("build-done");
  return r;
});

const changes = [
  "Add a column for party size to the bookings table",
  "Make every agent ask before it sends a message to a guest",
  "Change the brand colour to a deep green",
  "Add a screen where the manager sees tonight's covers by hour",
];
for (const [i, c] of changes.entries()) {
  await step(`change-${i + 1}`, async () => {
    await page.goto(proj + "/blueprint"); await page.waitForTimeout(1200);
    const composer = page.getByRole("textbox", { name: "Ask for a change" });
    await composer.fill(c); await composer.press("Enter");
    const order = page.getByRole("region", { name: "Work Order" });
    await order.waitFor({ timeout: 120000 });
    const text = (await order.innerText()).replace(/\s+/g, " ").slice(0, 220);
    await snap(`change-${i + 1}`);
    const approve = order.getByRole("button", { name: /Approve/ });
    if (await approve.count() && await approve.isEnabled()) {
      await approve.click();
      await page.getByText(/Save point #\d+|Undo/).first().waitFor({ timeout: 30000 }).catch(() => {});
      return `APPLIED · ${text}`;
    }
    return `NOT APPLIED · ${text}`;
  });
}

await step("agents-playground", async () => {
  await page.goto(proj + "/agents?tab=playground"); await page.waitForTimeout(1500);
  const header = (await page.locator("text=/Scripted|Live|Claude/").first().innerText().catch(() => "?")).slice(0, 80);
  const box = page.getByRole("textbox", { name: /Message/ });
  await box.fill("A guest called Maria Lopez wants to cancel tonight's booking for 4 at 8pm and get her $50 deposit back. Please handle it.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const approval = page.getByRole("group", { name: "Approval needed" });
  const reply = page.locator("p.whitespace-pre-wrap");
  await Promise.race([approval.waitFor({ timeout: 90000 }), page.waitForTimeout(60000)]);
  let r = `header="${header}"`;
  if (await approval.isVisible()) {
    r += " · approval asked: " + (await approval.innerText()).replace(/\s+/g, " ").slice(0, 120);
    await snap("agent-approval");
    await approval.getByRole("button", { name: /Deny/ }).click();
    await page.waitForTimeout(15000);
  }
  await snap("agent-after");
  const replies = await reply.allInnerTexts();
  return r + ` · replies=${replies.length} last="${(replies.at(-1) ?? "").slice(0, 160)}"`;
});

await step("add-agent", async () => {
  await page.goto(proj + "/agents"); await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /^Add$/ }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.waitFor();
  const ta = dlg.locator("textarea").first();
  await ta.fill("An agent that spots likely no-shows from booking history and texts those guests to confirm, asking a person before cancelling anything.");
  await dlg.getByRole("button", { name: /Add|Create|Hire/ }).last().click();
  await dlg.waitFor({ state: "hidden", timeout: 90000 });
  await page.waitForTimeout(1500); await snap("add-agent");
  return (await page.locator("aside, ul").filter({ hasText: /agents/i }).first().innerText().catch(() => "")).slice(0, 120).replace(/\s+/g, " ");
});

await step("ship", async () => {
  await page.goto(proj + "/ship"); await page.waitForTimeout(1500);
  const btn = page.getByRole("button", { name: /Go live|Update the live version|Fix .* to go live/ });
  const label = await btn.innerText();
  if (/Fix/.test(label)) return `blocked: ${label}`;
  await btn.click();
  await page.getByRole("dialog", { name: "You're live" }).waitFor({ timeout: 40000 });
  const url = await page.getByRole("dialog").locator("code").innerText();
  await snap("ship-live");
  const p2 = await ctx.newPage(); await p2.goto(url); await p2.waitForTimeout(2000);
  await p2.screenshot({ path: "/tmp/Q-live-app.png" });
  const ok = await p2.getByText("Built with Architect").count();
  return `live ${url} footer=${ok}`;
});

await step("import", async () => {
  await page.goto(base + "/new?mode=import&repo=openai/openai-cs-agents-demo");
  await page.getByRole("heading", { name: "House Rules" }).waitFor({ timeout: 60000 });
  await snap("import-report");
  await page.getByRole("button", { name: /Sign House Rules and map it/ }).click();
  await page.waitForTimeout(3000);
  const eyebrow = await page.locator("p.micro-label").first().innerText();
  await page.waitForURL(/\/p\/[0-9a-f-]+\/blueprint/, { timeout: 180000 });
  await page.waitForTimeout(1500); await snap("import-blueprint");
  return `eyebrow="${eyebrow}" project="${await page.locator("header h1").first().innerText()}"`;
});

console.log("\nERRORS:\n" + (errors.length ? [...new Set(errors)].join("\n") : "none"));
await browser.close();
