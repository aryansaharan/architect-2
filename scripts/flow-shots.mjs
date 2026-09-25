// Captures the multi-step flows for visual review: node scripts/flow-shots.mjs http://localhost:3001 /tmp/flow
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://localhost:3001";
const out = process.argv[3] ?? "/tmp/flow";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const snap = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${name}.png` }); console.log("✓", name); };

await page.goto(base + "/login"); await snap("00-login");
await page.goto(base + "/demo"); await page.waitForURL(/\/blueprint/);
const ws = page.url().split("?")[0].replace(/\/blueprint$/, "");

await page.goto(base + "/new?prompt=" + encodeURIComponent("A returns desk for an online furniture store: read return requests, check the order and warranty, approve simple refunds, and ask me before sending money back."));
await snap("10-new-questions");
await page.getByRole("button", { name: /^Plan it/ }).click();
await page.waitForTimeout(1800); await snap("11-new-planning");
await page.waitForURL(/\/p\/.*\/blueprint/, { timeout: 60000 });
await page.waitForTimeout(800); await snap("12-draft-workorder");
await page.getByRole("button", { name: /Build it/ }).click();
await page.waitForTimeout(3500); await snap("13-building");
await page.getByRole("radio", { name: /Skip/ }).click();
await page.getByRole("alertdialog").waitFor({ timeout: 60000 }); await snap("14-repair");
await page.getByRole("alertdialog").getByRole("button", { name: /Use this fix/ }).first().click();
await page.getByText("Built", { exact: true }).first().waitFor({ timeout: 60000 }); await page.waitForTimeout(1200); await snap("15-built");

await page.goto(ws + "/preview"); await page.getByRole("radio", { name: /Tweak/ }).click();
await page.getByRole("heading", { name: "New and in-progress claims" }).click(); await snap("20-tweak");
await page.keyboard.press("Escape");
await page.goto(ws + "/preview"); await page.getByRole("radio", { name: /Comment/ }).click(); await snap("21-comment");
await page.getByRole("radio", { name: /^Phone$/ }).click().catch(() => {});
await page.locator('[title="Phone"]').click(); await page.getByRole("radio", { name: /Use/ }).click(); await snap("22-phone");

await page.goto(ws + "/agents?agent=settlement&tab=rehearsals"); await snap("30-rehearsals");
await page.getByRole("button", { name: /Run all/ }).click(); await page.waitForTimeout(2500); await snap("31-rehearsals-run");
await page.goto(ws + "/agents?agent=intake-triage&tab=replay"); await snap("32-replay");
await page.goto(ws + "/agents?agent=settlement&tab=code"); await snap("33-agent-code");
await page.goto(ws + "/agents?agent=settlement&tab=playground");
await page.getByRole("button", { name: /Standard payout/ }).click();
await page.getByRole("group", { name: "Approval needed" }).waitFor({ timeout: 30000 }); await snap("34-approval");

await page.goto(ws + "/code?compare=1"); await snap("40-diff");
await page.goto(ws + "/handoffs"); await snap("41-handoff-teammate");
await page.goto(base + "/new?mode=import&repo=openai/openai-cs-agents-demo");
await page.getByRole("heading", { name: "House Rules" }).waitFor({ timeout: 30000 }); await snap("50-import-report");
await page.goto(base + "/settings"); await snap("60-settings");
await page.goto(ws + "/ship");
const slug = (await page.locator("code").filter({ hasText: "/live/" }).first().innerText()).trim();
await page.goto(base + slug); await snap("70-live");
await browser.close();
