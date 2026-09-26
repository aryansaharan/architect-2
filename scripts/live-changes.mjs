// Live check of "ask for a change" on a deployment: node scripts/live-changes.mjs [baseUrl]
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "https://architect-2-aryan.vercel.app";
const REQUESTS = [
  ["screen:intake-queue", "Add a column for SLA risk to the claims table"],
  [null, "Make every agent ask before it sends a message to anyone"],
  [null, "Add a screen where team leads see today's payouts by adjuster"],
  [null, "Rename the Intake Queue screen to New Claims and make the brand colour deep green"],
  ["agent:fraud-screener", "Add a rule: never accuse a policyholder of fraud, only flag for review"],
  ["agent:settlement", "Add a rehearsal where the payout is above $25,000"],
];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(base + "/demo"); await page.waitForURL(/\/blueprint/, { timeout: 60000 });
const ws = page.url().split("?")[0].replace(/\/blueprint$/, "");
for (const [i, [sel, req]] of REQUESTS.entries()) {
  const t = Date.now();
  try {
    await page.goto(`${ws}/blueprint${sel ? `?sel=${sel}` : ""}`); await page.waitForTimeout(1200);
    const composer = page.getByRole("textbox", { name: "Ask for a change" });
    await composer.fill(req); await composer.press("Enter");
    const order = page.getByRole("region", { name: "Work Order" });
    await order.waitFor({ timeout: 150000 });
    const text = (await order.innerText()).replace(/\s+/g, " ");
    const approve = order.getByRole("button", { name: /Approve/ });
    let res = "NOT APPLIED";
    if (await approve.count() && await approve.isEnabled()) {
      await approve.click();
      await page.getByText(/Undo|Save point #\d+/).first().waitFor({ timeout: 30000 });
      res = "APPLIED";
    }
    await page.screenshot({ path: `/tmp/C-${i + 1}.png` });
    console.log(`${i + 1}. ${res} (${((Date.now() - t) / 1000).toFixed(0)}s) ${req}\n   → ${text.slice(0, 300)}`);
  } catch (e) {
    await page.screenshot({ path: `/tmp/C-${i + 1}-fail.png` });
    console.log(`${i + 1}. FAILED ${req}: ${String(e.message).split("\n")[0]}`);
  }
}
await browser.close();
