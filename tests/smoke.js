// Walks every screen in the app and fails on any page error or empty render.
// Lives in the repo on purpose: test suites kept in a scratch directory do not
// survive the container, and a suite you cannot re-run has stopped being a test.
//
//   node tests/smoke.js            (serve the repo on :8123 first)
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:8123/app/";
let pass = 0, fail = 0;
const check = (l, c, d) => { if (c) { pass++; console.log("  PASS", l); } else { fail++; console.log("  FAIL", l, d !== undefined ? JSON.stringify(d).slice(0, 300) : ""); } };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("dialog", (d) => d.accept());

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.setItem("sf365.theme", "dark");
    localStorage.setItem("sf365.coachId", "smoke-coach");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  const visit = async (label, steps) => {
    try {
      await steps();
      await page.waitForTimeout(350);
      const text = await page.innerText("body");
      check(`${label} renders`, text.trim().length > 40, text.slice(0, 120));
    } catch (e) {
      check(`${label} renders`, false, e.message);
    }
  };

  for (const route of ["profile", "program", "history", "nutrition", "settings"]) {
    await visit(`tab: ${route}`, () => page.click(`[data-route="${route}"]`));
  }

  await visit("day", async () => {
    await page.click('[data-route="program"]');
    await page.waitForTimeout(300);
    await page.click('[data-action="open-day"]');
  });
  await visit("exercise", () => page.click('[data-action="open-exercise"]'));

  await visit("nutrition add", async () => {
    await page.click('[data-route="nutrition"]');
    await page.waitForTimeout(300);
    await page.click('[data-action="go-nutrition-add"][data-meal="Lunch"]');
  });
  await visit("food library", () => page.click('[data-action="go-food-library"]'));
  await visit("food detail", () => page.click('[data-action="open-library-food"]'));

  await visit("meal plans", async () => {
    await page.click('[data-route="nutrition"]');
    await page.waitForTimeout(300);
    await page.click('[data-action="go-meal-plans"]');
  });
  await visit("meal plan builder", () => page.click('[data-action="go-meal-plan-new"]'));
  await visit("generated plan", async () => {
    await page.fill("#mp-weight", "175");
    await page.click('[data-action="generate-meal-plan"]');
  });

  await visit("recipe library", async () => {
    await page.click('[data-route="nutrition"]');
    await page.waitForTimeout(300);
    await page.click('[data-action="go-recipe-library"]');
  });
  await visit("check-in", async () => {
    await page.click('[data-route="nutrition"]');
    await page.waitForTimeout(300);
    await page.click('[data-action="go-nutrition-weight"]');
  });
  await visit("goals", async () => {
    await page.click('[data-route="nutrition"]');
    await page.waitForTimeout(300);
    await page.click('[data-action="go-nutrition-goals"]');
  });
  await visit("coach dashboard", async () => {
    await page.click('[data-route="settings"]');
    await page.waitForTimeout(300);
    await page.click('[data-action="go-coach"]');
  });
  await visit("templates", async () => {
    await page.click('[data-route="settings"]');
    await page.waitForTimeout(300);
    await page.click('[data-action="go-templates"]');
  });
  await visit("exercise library", async () => {
    await page.click('[data-route="settings"]');
    await page.waitForTimeout(300);
    await page.click('[data-action="go-exercise-library"]');
  });

  check("no page errors anywhere", errs.length === 0, errs);
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
