// Captures the README screenshots: node scripts/readme-shots.mjs https://prod-ai-studio.vercel.app docs/screenshots
// Makes a few real model calls (planning a new project, a margin note, a helper test chat, an import).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "docs/screenshots";
const only = process.argv[4] ? new Set(process.argv[4].split(",")) : null;
const want = (name) => !only || only.has(name.slice(0, 2));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.setDefaultTimeout(60_000);
const snap = async (name, wait = 900) => {
  if (!want(name)) return;
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("ok", name);
};
const top = () => page.evaluate(() => document.querySelectorAll("*").forEach((el) => { if (el.scrollTop) el.scrollTop = 0; }));

// A finished example project (guest session), opened on its Sheet.
await page.goto(base + "/demo");
await page.waitForURL(/\/p\/[0-9a-f-]+/);
const ws = page.url().split("?")[0].replace(/\/(blueprint|preview|agents|code|ship|handoffs)$/, "");

if (want("01") || want("02") || want("03") || want("04")) {
  // A new project: questions skipped, planned by Claude, then the sketch on the Sheet.
  await page.goto(base + "/new?prompt=" + encodeURIComponent("A claims triage desk for a mid-size insurer: take in new claims, flag likely fraud, route each claim to the right adjuster, and prepare payouts that a human approves."));
  await page.getByRole("button", { name: /Skip, use sensible defaults/ }).click();
  await page.waitForURL(/\/p\/[0-9a-f-]+/, { timeout: 180_000 });
  const build = page.getByRole("button", { name: /Build it/ });
  await build.waitFor({ timeout: 60_000 });
  await top();
  await snap("01-sketch", 1500);

  // Make it real: screens ink in from pencil at normal speed. Wait until the first screen has inked.
  await build.click();
  await page.getByText(/[1-9] of \d+ screens? inked/).first().waitFor({ timeout: 60_000 }).catch(() => console.log("no screen inked yet; capturing anyway"));
  await snap("02-inking", 1200);

  // Skip to the end; the test run stops on a problem and a note offers two fixes.
  await page.getByRole("radio", { name: /Skip/ }).click();
  const repair = page.getByRole("alertdialog");
  await repair.waitFor({ timeout: 90_000 });
  await repair.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector('[role="alertdialog"]')?.scrollIntoView({ block: "center" }));
  await snap("03-fix-note", 1400);
  await repair.getByRole("button", { name: /Use this fix/ }).first().click();
  await page.getByText(/It.s real/).first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(2500);
  await top();
  await snap("04-real-app", 1500);
}

if (want("05")) {
  // A note in the margin: Prod AI answers with the change in plain words, its price, and Apply.
  await page.goto(ws);
  await page.getByText(/It.s real/).first().waitFor({ timeout: 60_000 }).catch(() => {});
  const note = page.getByRole("textbox", { name: "Ask for a change" });
  await note.waitFor();
  await note.fill("Add an SLA risk column to the claims table");
  await note.press("Enter");
  const order = page.getByRole("region", { name: "Work Order" });
  await order.waitFor({ timeout: 150_000 });
  await order.scrollIntoViewIfNeeded();
  await snap("05-margin-note", 1500);
}

if (want("06")) {
  // AI helpers: Try it, with a real approval gate before an action that can't be undone.
  await page.goto(ws + "/agents?agent=settlement&tab=playground");
  await page.getByRole("button", { name: /Standard payout/ }).click();
  await page.getByRole("group", { name: "Approval needed" }).waitFor({ timeout: 120_000 });
  await page.getByRole("group", { name: "Approval needed" }).scrollIntoViewIfNeeded();
  await snap("06-try-it-approval", 1200);
}

if (want("07")) {
  // Import: a real public repo, House Rules, then the Code tab: your repo untouched, new files proposed as PR #1.
  await page.goto(base + "/new?mode=import&repo=openai/openai-cs-agents-demo");
  await page.getByRole("heading", { name: "House Rules" }).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: /Sign House Rules and map it/ }).click();
  await page.waitForURL(/\/p\/[0-9a-f-]+/, { timeout: 180_000 });
  const imported = page.url().split("?")[0].replace(/\/(blueprint|preview|agents|code|ship|handoffs)$/, "");
  await page.goto(imported + "/code");
  await page.getByText("Your repo · untouched").first().waitFor({ timeout: 60_000 });
  await snap("07-import-pr", 2000);
}

if (want("08")) {
  await page.goto(ws + "/ship");
  await page.getByRole("button", { name: /Publish/ }).first().waitFor({ timeout: 30_000 }).catch(() => {});
  await snap("08-publish", 1800);
}

if (want("09")) {
  await page.goto(ws + "/blueprint?sel=agent:settlement");
  await page.getByRole("complementary", { name: "Inspector" }).waitFor({ timeout: 30_000 }).catch(() => {});
  await snap("09-plan-map", 2000);
}

if (want("00")) {
  // The landing, signed out.
  const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await fresh.newPage();
  await p.goto(base + "/");
  await p.waitForTimeout(3500);
  await p.screenshot({ path: `${out}/00-landing.png` });
  console.log("ok", "00-landing");
  await fresh.close();
}
await browser.close();
