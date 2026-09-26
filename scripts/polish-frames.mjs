// Frames of the non-canvas surfaces for visual review: node scripts/polish-frames.mjs http://localhost:3000
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const snap = (n) => page.screenshot({ path: `/tmp/P-${n}.png` });
await page.goto(base + "/login"); await page.waitForTimeout(1400); await snap("0-login");
await page.goto(base + "/demo"); await page.waitForURL(/\/blueprint/);
const ws = page.url().split("?")[0].replace(/\/blueprint$/, "");
await page.goto(base + "/home"); await page.waitForTimeout(250); await snap("1-home-early");
await page.waitForTimeout(1500); await snap("2-home");
await page.locator("#brief").click(); await page.getByRole("button", { name: "Claims triage" }).click(); await page.waitForTimeout(600); await snap("3-home-focus");
await page.goto(ws + "/preview"); await page.waitForTimeout(1500); await snap("4-preview-desktop");
await page.getByRole("radio", { name: "Phone" }).click(); await page.waitForTimeout(900); await snap("5-preview-phone");
await page.getByRole("radio", { name: "Tablet" }).click(); await page.waitForTimeout(900); await snap("6-preview-tablet");
await page.goto(ws + "/agents"); await page.waitForTimeout(1500); await snap("7-agents");
await browser.close();
console.log("done");
