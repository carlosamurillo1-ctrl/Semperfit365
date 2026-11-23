// The coach opens one of his own client links to check it, and his dashboard
// vanishes: every client link carries m=1, and that flag made isCoachDevice()
// false with nothing on screen to say why. Opening the coach link didn't clear
// it either, so the one documented way back in didn't work.
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://localhost:8123/app/";
let pass = 0, fail = 0;
const check = (l, c, d) => { if (c) { pass++; console.log("  PASS", l); } else { fail++; console.log("  FAIL", l, d !== undefined ? JSON.stringify(d).slice(0, 300) : ""); } };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  page.on("dialog", (d) => d.accept());

  const settings = async () => {
    await page.click('[data-route="settings"]');
    await page.waitForTimeout(500);
    return page.innerText("body");
  };

  // 1. A coach device, set up the normal way.
  await page.goto(BASE + "?coach=coach-abc", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  check("coach link makes this the coach's device", /Coach dashboard/i.test(await settings()));

  // 2. He opens one of his own client links here to see what they see.
  await page.goto(BASE + "?client=client-xyz&m=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  const afterClientLink = await settings();
  check("the dashboard is no longer offered outright", !/Open coach dashboard/i.test(afterClientLink), afterClientLink.slice(0, 300));
  check("but it SAYS why, instead of vanishing silently", /Coach dashboard is hidden/i.test(afterClientLink), afterClientLink.slice(0, 400));
  check("and offers the way back", await page.isVisible('[data-action="restore-coach-device"]'));

  // 3. The escape hatch works.
  await page.click('[data-action="restore-coach-device"]');
  await page.waitForTimeout(700);
  const restored = await page.innerText("body");
  check("switching back restores the dashboard", /Open coach dashboard/i.test(restored), restored.slice(0, 300));
  await page.click('[data-action="go-coach"]');
  await page.waitForTimeout(600);
  check("the dashboard actually opens", /client|roster|Add client/i.test(await page.innerText("body")));

  // 4. The other documented route back must work too: the coach link itself.
  await page.goto(BASE + "?client=client-xyz&m=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  check("locked down again by a client link", !/Open coach dashboard/i.test(await settings()));
  await page.goto(BASE + "?coach=coach-abc", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2200);
  check("the coach link clears client mode", /Open coach dashboard/i.test(await settings()));

  // 5. A real client, who was never a coach, still sees nothing about a dashboard.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page2 = await ctx2.newPage();
  await page2.goto(BASE + "?client=someone-else&m=1", { waitUntil: "domcontentloaded" });
  await page2.waitForTimeout(2200);
  await page2.click('[data-route="settings"]');
  await page2.waitForTimeout(500);
  const clientView = await page2.innerText("body");
  check("a real client sees no dashboard and no hint of one",
    !/Coach dashboard/i.test(clientView), clientView.slice(0, 300));

  // 6. A half-built link -- "?coach=" with nothing pasted after it -- must not
  // quietly overwrite a working coach id with an empty one.
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page3 = await ctx3.newPage();
  await page3.goto(BASE + "?coach=coach-real", { waitUntil: "domcontentloaded" });
  await page3.waitForTimeout(1800);
  await page3.click('[data-route="settings"]');
  await page3.waitForTimeout(500);
  check("set up as coach first", /Open coach dashboard/i.test(await page3.innerText("body")));
  await page3.goto(BASE + "?coach=", { waitUntil: "domcontentloaded" });
  await page3.waitForTimeout(1800);
  await page3.click('[data-route="settings"]');
  await page3.waitForTimeout(500);
  check("an empty ?coach= leaves the real id alone", /Open coach dashboard/i.test(await page3.innerText("body")),
    await page3.innerText("body"));
  check("and stores nothing empty", await page3.evaluate(() => localStorage.getItem("sf365.coachId")) === "coach-real",
    await page3.evaluate(() => localStorage.getItem("sf365.coachId")));

  check("no page errors", errs.length === 0, errs);
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
