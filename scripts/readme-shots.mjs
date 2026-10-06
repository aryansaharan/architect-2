// Captures the README screenshots and the landing page's product image by walking the real flow as a guest:
//   node scripts/readme-shots.mjs [baseUrl] [outDir]
// Defaults: https://prod-ai-studio.vercel.app and docs/screenshots. No Claude calls: guests use the starter plans.
import { chromium } from "@playwright/test";
import { copyFileSync, mkdirSync } from "node:fs";

const base = (process.argv[2] ?? "https://prod-ai-studio.vercel.app").replace(/\/$/, "");
const out = process.argv[3] ?? "docs/screenshots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  // Running against a dev server, hide its badge.
  page.on("load", () => page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {}));
  return page;
};
const shot = async (page, name, settle = 1200) => {
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log("saved", name);
};

const page = await newPage();

// 00 The landing page, after the headline has been written.
await page.goto(base + "/");
await shot(page, "00-landing", 3200);

// 01 The questions, with an answer circled in pencil.
await page.goto(base + "/start?next=/new");
await page.waitForURL(/\/new/, { timeout: 30_000 });
await page.goto(base + "/new?prompt=" + encodeURIComponent("A support inbox for a small SaaS team: read tickets, draft replies from the help centre, and escalate outages to on-call."));
await page.getByRole("button", { name: /Skip, use sensible defaults/ }).waitFor({ timeout: 30_000 });
const option = page.getByRole("radio").nth(1);
if (await option.isVisible().catch(() => false)) await option.click();
await shot(page, "01-questions", 900);

// 02 The plan as a pencil sketch on its Sheet.
await page.getByRole("button", { name: /Skip, use sensible defaults/ }).click();
await page.waitForURL(/\/p\/[0-9a-f-]+/, { timeout: 150_000 });
const ws = page.url().split("?")[0];
await shot(page, "02-sketch", 4500);

// 03 Making it real: screens going from pencil to ink.
await page.getByRole("button", { name: /Make it real/ }).first().click();
await shot(page, "03-inking", 3500);

// 04 A test run caught a problem: the fix note.
await page.getByRole("radio", { name: /Skip/ }).click().catch(() => {});
const fix = page.getByRole("alertdialog");
await fix.waitFor({ timeout: 90_000 });
await shot(page, "04-fix-note", 1200);
await fix.getByRole("button", { name: /Use this fix/ }).first().click();

// 05 "It's real.": the working app on the Sheet (also the landing page's product image).
await page.getByText(/It.s real/).first().waitFor({ timeout: 90_000 });
await shot(page, "05-real-app", 2600);
copyFileSync(`${out}/05-real-app.png`, "public/showcase/studio.png");

// 06 A note in the margin, answered with the change and its price.
const note = page.getByRole("textbox", { name: /Ask for a change/ });
await note.fill("Add a column for priority to the open tickets");
await note.press("Enter");
await page.getByRole("region", { name: "Work Order" }).waitFor({ timeout: 60_000 });
await shot(page, "06-margin-change", 1200);
await page.getByRole("region", { name: "Work Order" }).getByRole("button", { name: /Apply/ }).click();
await page.waitForTimeout(2500);

// 07 AI helpers: what each one is allowed to do, and Try it.
await page.goto(ws + "/agents");
await shot(page, "07-ai-helpers", 2500);

// 08 The Plan map under the hood.
await page.goto(ws + "/blueprint");
await shot(page, "08-plan-map", 2500);

// 09 Publish, then the Publish page with its controls.
await page.goto(ws + "/ship");
await page.waitForTimeout(2500);
await page.getByRole("button", { name: /^Publish/ }).first().click();
await page.getByRole("dialog", { name: "You're live" }).waitFor({ timeout: 30_000 });
const live = (await page.content()).match(/\/live\/[a-z0-9-]+/)?.[0];
await page.keyboard.press("Escape");
await shot(page, "09-publish", 2000);

// 10 The published app, as its owner.
await page.goto(base + live);
await shot(page, "10-published-app", 2500);

// 11 A visitor on a published app's public page (the example claims desk has one).
const demo = await newPage();
await demo.goto(base + "/demo");
await demo.waitForURL(/\/p\/[0-9a-f-]+/, { timeout: 60_000 });
await demo.goto(demo.url().split("?")[0] + "/ship");
await demo.waitForTimeout(2500);
const demoLive = (await demo.content()).match(/\/live\/[a-z0-9-]+/)?.[0];
const visitor = await newPage();
await visitor.goto(base + demoLive);
await shot(visitor, "11-visitor-page", 2500);

await browser.close();
