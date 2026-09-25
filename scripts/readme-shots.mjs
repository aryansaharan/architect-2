// Captures the README screenshots: node scripts/readme-shots.mjs http://localhost:3001 docs/screenshots
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://localhost:3001";
const out = process.argv[3] ?? "docs/screenshots";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const snap = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: `${out}/${name}.png` }); console.log("✓", name); };

await page.goto(base + "/demo"); await page.waitForURL(/\/blueprint/);
const ws = page.url().split("?")[0].replace(/\/blueprint$/, "");
await page.goto(ws + "/blueprint?sel=agent:settlement"); await page.getByRole("button", { name: /Settlement/ }).filter({ hasText: "Prepares payouts" }).first().hover(); await snap("01-blueprint");

await page.goto(base + "/new?prompt=" + encodeURIComponent("A claims triage desk for a mid-size insurer: take in new claims, flag likely fraud, route each claim to the right adjuster, and prepare payouts that a human approves."));
await page.getByRole("button", { name: /Skip — use sensible defaults/ }).click();
await page.waitForURL(/\/p\/.*\/blueprint/, { timeout: 60000 });
const draft = page.url().split("?")[0];
await page.goto(draft); await snap("02-work-order");
await page.getByRole("button", { name: /Build it/ }).click();
await page.getByRole("radio", { name: /Skip/ }).click();
await page.getByRole("alertdialog").waitFor({ timeout: 60000 }); await snap("03-repair");
await page.getByRole("alertdialog").getByRole("button", { name: /Use this fix/ }).first().click();
await page.getByText("Built", { exact: true }).first().waitFor({ timeout: 60000 });

await page.goto(ws + "/preview"); await page.getByRole("radio", { name: /Tweak/ }).click();
await page.getByRole("heading", { name: "New and in-progress claims" }).click(); await snap("04-tweak");

await page.goto(ws + "/agents?agent=settlement&tab=playground");
await page.getByRole("button", { name: /Standard payout/ }).click();
await page.getByRole("group", { name: "Approval needed" }).waitFor({ timeout: 30000 }); await snap("05-approval");

await page.goto(base + "/new?mode=import&repo=openai/openai-cs-agents-demo");
await page.getByRole("heading", { name: "House Rules" }).waitFor({ timeout: 30000 }); await snap("06-import");
await page.goto(ws + "/code?compare=1"); await snap("07-diff");
await page.goto(ws + "/ship"); await snap("08-ship");
await page.goto(ws + "/handoffs"); await snap("09-handoff");
await page.goto(base + "/"); await snap("00-landing");
await browser.close();
