// Usage: node scripts/shots.mjs [baseUrl] [outDir]: captures key screens for visual review.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "/tmp/shots";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const shot = async (name, url, prep) => {
  if (url) await page.goto(base + url, { waitUntil: "networkidle" });
  if (prep) await prep(page);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("✓", name, page.url());
};
await shot("01-landing", "/");
await page.goto(base + "/demo", { waitUntil: "networkidle" });
const ws = page.url().split("?")[0].replace(/\/blueprint$/, "");
console.log("workspace", ws);
await shot("02-blueprint-tour", null);
await shot("03-blueprint-agent", `${ws.replace(base, "")}/blueprint?sel=agent:settlement`);
await shot("04-preview", `${ws.replace(base, "")}/preview`);
await shot("05-agents", `${ws.replace(base, "")}/agents?agent=settlement`);
await shot("06-code", `${ws.replace(base, "")}/code`);
await shot("07-ship", `${ws.replace(base, "")}/ship`);
await shot("08-home", "/home");
await browser.close();
