// Exports the architecture diagram for the submission form:
//   node scripts/architecture-export.mjs [baseUrl]
// → public/docs/architecture-diagram.png (2x) and public/docs/architecture.pdf
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://localhost:3000";
mkdirSync("public/docs", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1900, height: 1200 }, deviceScaleFactor: 2 });
await page.goto(base + "/architecture?print=1", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.locator("#architecture-diagram").screenshot({ path: "public/docs/architecture-diagram.png" });
await page.emulateMedia({ media: "screen" });
const height = await page.evaluate(() => document.documentElement.scrollHeight);
await page.pdf({ path: "public/docs/architecture.pdf", printBackground: true, width: "1900px", height: `${height + 4}px`, margin: { top: "0", bottom: "0", left: "0", right: "0" } });
await browser.close();
console.log("exported");
