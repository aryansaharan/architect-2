// Landing page frames for visual review: node scripts/landing-shots.mjs http://localhost:3000
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(base + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(350); await page.screenshot({ path: "/tmp/L-0.png" });
await page.mouse.move(900, 300);
await page.waitForTimeout(1600); await page.screenshot({ path: "/tmp/L-1.png" });
await page.waitForTimeout(3500); await page.screenshot({ path: "/tmp/L-2.png" });
const h = await page.evaluate(() => document.documentElement.scrollHeight);
let i = 3;
for (let y = 800; y < h; y += 800) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `/tmp/L-${i++}.png` });
}
await browser.close();
console.log("frames", i - 3, "height", h);
