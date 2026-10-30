const { chromium } = require("playwright");
let pass = 0, fail = 0;
const check = (l, c, d) => { if (c) { pass++; console.log("  PASS", l); } else { fail++; console.log("  FAIL", l, d !== undefined ? JSON.stringify(d).slice(0,300) : ""); } };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium" });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  // A managed client, the way one arrives: via their link.
  await page.goto((process.env.BASE || "http://localhost:8123/app/") + "?client=abc-123&m=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  check("app loads for a managed client", (await page.innerText("body")).length > 40);
  check("the Me tab is there for them too", await page.isVisible('[data-route="profile"]'));
  await page.click('[data-route="profile"]');
  await page.waitForTimeout(600);
  const body = await page.innerText("body");
  check("dashboard renders", /Compliance/i.test(body), body.slice(0,200));
  check("shows their food section", /Today's food/i.test(body));
  check("shows weight/check-in", /Weight/i.test(body));
  check("no page errors", errs.length === 0, errs);
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
