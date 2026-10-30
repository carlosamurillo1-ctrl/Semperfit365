const { chromium } = require("playwright");
const SP = process.env.SHOTS || "/tmp";
let pass = 0, fail = 0;
const check = (l, c, d) => { if (c) { pass++; console.log("  PASS", l); } else { fail++; console.log("  FAIL", l, d !== undefined ? JSON.stringify(d).slice(0,400) : ""); } };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  page.on("dialog", d => d.accept());
  await page.goto(process.env.BASE || "http://localhost:8123/app/", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.setItem("sf365.theme", "dark"));
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  console.log("The tab");
  check("a Me tab exists", await page.isVisible('[data-route="profile"]'));
  await page.click('[data-route="profile"]');
  await page.waitForTimeout(500);
  let body = await page.innerText("body");
  check("shows compliance", /Compliance/i.test(body), body.slice(0,200));
  check("cold start says nothing logged", /Nothing logged yet/i.test(body), body.slice(0,400));
  check("shows today's food", /Today's food/i.test(body));
  check("shows weight", /Weight/i.test(body));
  check("offers the next day to do", /Next up/i.test(body), body.slice(0,500));
  await page.screenshot({ path: `${SP}/prof-1-cold.png`, fullPage: true });

  console.log("Log a workout and come back");
  await page.click('[data-route="program"]');
  await page.waitForTimeout(400);
  await page.click('[data-action="open-day"]');
  await page.waitForTimeout(400);
  await page.click('[data-action="open-exercise"]');
  await page.waitForTimeout(500);
  const boxes = await page.$$('input[data-kind="value"]');
  await boxes[0].fill("135");
  await page.waitForTimeout(700);
  await page.click('[data-route="profile"]');
  await page.waitForTimeout(600);
  body = await page.innerText("body");
  const stats = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll(".macro-stat")].slice(0, 3);
    return tiles.map(t => ({ label: t.querySelector(".macro-stat-label")?.innerText, value: t.querySelector("h3")?.innerText }));
  });
  check("workouts done is 1", stats[0]?.value === "1", stats);
  check("streak is 1 after logging today", stats[1]?.value === "1", stats);
  check("last 7 days is 1", stats[2]?.value === "1", stats);
  check("says when the last workout was", /Last workout/i.test(body), body.slice(0,300));
  await page.screenshot({ path: `${SP}/prof-2-logged.png`, fullPage: true });

  console.log("Logging a second exercise in the same day is still ONE workout");
  await page.click('[data-route="program"]');
  await page.waitForTimeout(400);
  await page.click('[data-action="open-day"]');
  await page.waitForTimeout(400);
  const exLinks = await page.$$('[data-action="open-exercise"]');
  if (exLinks.length > 1) {
    await exLinks[1].click();
    await page.waitForTimeout(500);
    const b2 = await page.$$('input[data-kind="value"]');
    await b2[0].fill("90");
    await page.waitForTimeout(700);
    await page.click('[data-route="profile"]');
    await page.waitForTimeout(600);
    const stats2 = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll(".macro-stat")].slice(0, 1);
      return tiles.map(t => t.querySelector("h3")?.innerText);
    });
    check("still 1 workout, not 2", stats2[0] === "1", stats2);
  }

  console.log("Food shows up on the dashboard");
  await page.click('[data-route="nutrition"]');
  await page.waitForTimeout(400);
  await page.click('[data-action="go-nutrition-add"][data-meal="Lunch"]');
  await page.waitForTimeout(300);
  await page.click('[data-action="go-food-library"]');
  await page.waitForTimeout(400);
  await page.fill("#food-lib-search", "banana");
  await page.waitForTimeout(350);
  await page.click('[data-action="open-library-food"]');
  await page.waitForTimeout(400);
  const bid = await page.evaluate(() => document.querySelector('[data-action="log-library-food"]').dataset.food);
  await page.click(`[data-action="log-library-food"][data-food="${bid}"]`);
  await page.waitForTimeout(600);
  await page.click('[data-route="profile"]');
  await page.waitForTimeout(600);
  body = await page.innerText("body");
  check("today's food count updates", /1 item/.test(body), body.slice(0,600));
  const cals = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".card")];
    const food = cards.find(c => c.innerText.startsWith("Today's food"));
    return food ? food.innerText : "";
  });
  check("calories and macros are on the dashboard", /CALORIES/i.test(cals) && /PROTEIN/i.test(cals), cals.slice(0,200));
  await page.screenshot({ path: `${SP}/prof-3-food.png`, fullPage: true });

  console.log("Check-in shows up");
  await page.click('[data-action="go-nutrition-weight"]');
  await page.waitForTimeout(500);
  await page.fill("#weight-input", "182");
  await page.waitForTimeout(300);
  const saveBtn = await page.$('[data-action="confirm-log-weight"]');
  if (saveBtn) { await saveBtn.click(); await page.waitForTimeout(700); }
  await page.click('[data-route="profile"]');
  await page.waitForTimeout(600);
  body = await page.innerText("body");
  check("weight appears on the dashboard", /182/.test(body), body.slice(0,700));
  check("says when they last checked in", /Checked in today|days since/i.test(body), body.slice(0,700));
  await page.screenshot({ path: `${SP}/prof-4-checkin.png`, fullPage: true });

  check("no page errors", errs.length === 0, errs);
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
