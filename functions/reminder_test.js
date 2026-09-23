const { decideReminder, renderReminderEmail } = require("./reminders.js");

let pass = 0, fail = 0;
const check = (l, c, d) => { if (c) { pass++; console.log("  PASS", l); } else { fail++; console.log("  FAIL", l, d !== undefined ? JSON.stringify(d).slice(0,200) : ""); } };

const NOW = "2026-09-23T13:00:00.000Z";
const ago = (days) => new Date(Date.parse(NOW) - days * 86400000).toISOString();
const agoDate = (days) => ago(days).slice(0, 10);

const base = (over = {}) => ({
  label: "Jordan",
  reminders: { enabled: true, email: "j@example.com" },
  checkIns: [{ date: agoDate(2), weight: 200 }],
  addedAt: ago(60),
  ...over,
});

console.log("Does not email when it shouldn't");
check("recent check-in", !decideReminder(base(), NOW).send);
check("reminders off", !decideReminder(base({ reminders: { enabled: false, email: "j@example.com" } }), NOW).send);
check("no email on file", !decideReminder(base({ reminders: { enabled: true } }), NOW).send);
check("revoked client", !decideReminder(base({ revoked: true, checkIns: [{ date: agoDate(30) }] }), NOW).send);
check("unpaid client", !decideReminder(base({ priceCents: 5000, paid: false, checkIns: [{ date: agoDate(30) }] }), NOW).send);
check("paid client is fine", decideReminder(base({ priceCents: 5000, paid: true, checkIns: [{ date: agoDate(30) }] }), NOW).send);
check("brand new client inside grace period", !decideReminder(base({ checkIns: [], addedAt: ago(1) }), NOW).send, decideReminder(base({ checkIns: [], addedAt: ago(1) }), NOW));

console.log("Throttle");
const recentlyEmailed = base({ checkIns: [{ date: agoDate(30) }], reminders: { enabled: true, email: "j@example.com", lastReminderAt: ago(2) } });
check("won't email twice in a week", !decideReminder(recentlyEmailed, NOW).send, decideReminder(recentlyEmailed, NOW));
const emailedLongAgo = base({ checkIns: [{ date: agoDate(30) }], reminders: { enabled: true, email: "j@example.com", lastReminderAt: ago(20) } });
check("will email again after the gap", decideReminder(emailedLongAgo, NOW).send);

console.log("Does email when it should");
const overdue = decideReminder(base({ checkIns: [{ date: agoDate(9) }] }), NOW);
check("9 days since check-in -> send", overdue.send, overdue);
check("says how many days", overdue.lines[0].includes("9 days"), overdue.lines);
check("addressed to the saved email", overdue.to === "j@example.com");
check("uses their name", overdue.name === "Jordan");

const never = decideReminder(base({ checkIns: [], addedAt: ago(10) }), NOW);
check("never checked in, past grace -> send", never.send, never);
check("different subject for the first one", never.subject === "Your first check-in", never.subject);
check("no 'NaN days' in the copy", !JSON.stringify(never).includes("NaN"), never.lines);

console.log("Stale workouts");
const staleProgram = {
  days: [{ exercises: [{ weeks: [{ updatedAt: ago(14) }, { updatedAt: null }] }] }],
};
const stale = decideReminder(base({ checkIns: [{ date: agoDate(9) }], program: staleProgram }), NOW);
check("mentions both check-in and training", stale.lines.length === 2, stale.lines);
check("counts workout days correctly", stale.lines[1].includes("14 days"), stale.lines[1]);

const freshProgram = { days: [{ exercises: [{ weeks: [{ updatedAt: ago(1) }] }] }] };
const freshTraining = decideReminder(base({ checkIns: [{ date: agoDate(9) }], program: freshProgram }), NOW);
check("training recently -> only the check-in line", freshTraining.lines.length === 1, freshTraining.lines);

console.log("Uses the LATEST check-in, not the first");
const outOfOrder = decideReminder(base({ checkIns: [{ date: agoDate(40) }, { date: agoDate(1) }, { date: agoDate(20) }] }), NOW);
check("unsorted check-ins -> uses the newest", !outOfOrder.send, outOfOrder);

console.log("Bad data doesn't produce a broken email");
check("missing checkIns key", decideReminder({ reminders: { enabled: true, email: "a@b.c" }, addedAt: ago(30) }, NOW).send);
check("checkIn with no date", !JSON.stringify(decideReminder(base({ checkIns: [{ weight: 1 }] }), NOW)).includes("NaN"));
check("no name falls back", decideReminder({ reminders: { enabled: true, email: "a@b.c" }, addedAt: ago(30) }, NOW).name === "there");

console.log("Firestore Timestamp shapes");
// serverTimestamp() comes back as a Timestamp, not a string. If that isn't
// handled, a brand-new client gets emailed on day one.
const asTimestamp = (iso) => ({ toDate: () => new Date(iso) });
const asJsonTimestamp = (iso) => ({ _seconds: Math.floor(Date.parse(iso) / 1000), _nanoseconds: 0 });
check("Timestamp addedAt respects the grace period",
  !decideReminder(base({ checkIns: [], addedAt: asTimestamp(ago(1)) }), NOW).send,
  decideReminder(base({ checkIns: [], addedAt: asTimestamp(ago(1)) }), NOW));
check("Timestamp addedAt sends once past it",
  decideReminder(base({ checkIns: [], addedAt: asTimestamp(ago(10)) }), NOW).send);
check("JSON-shaped Timestamp works too",
  !decideReminder(base({ checkIns: [], addedAt: asJsonTimestamp(ago(1)) }), NOW).send);
check("Timestamp lastReminderAt throttles",
  !decideReminder(base({ checkIns: [{ date: agoDate(30) }], reminders: { enabled: true, email: "j@e.c", lastReminderAt: asTimestamp(ago(2)) } }), NOW).send);
check("garbage date doesn't crash or leak NaN",
  !JSON.stringify(decideReminder(base({ checkIns: [], addedAt: "not a date" }), NOW)).includes("NaN"));

console.log("Email body");
const body = renderReminderEmail(overdue, "https://trainsemperfit365.com/app/");
check("text has the link", body.text.includes("https://trainsemperfit365.com/app/"));
check("html has the link", body.html.includes('href="https://trainsemperfit365.com/app/"'));
check("has an opt-out line", body.text.includes("switch them off") && body.html.includes("switch them off"));
check("signed", body.text.includes("Carlos"));
check("no undefined leaked into the body", !body.text.includes("undefined") && !body.html.includes("undefined"), body.text);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
