// The "should this client get a nudge today?" decision, kept separate from
// Firebase so it can be tested directly. Nothing in here touches the network,
// the clock, or the admin SDK -- `now` is always passed in.

const CHECK_IN_OVERDUE_DAYS = 7;
// How long a brand-new client gets before the first nudge. Long enough that
// it doesn't land the same day they sign up, short enough to catch someone
// who opened the link and then went quiet.
const FIRST_CHECK_IN_GRACE_DAYS = 3;
// Never email the same person more often than this, whatever else is true.
const MIN_DAYS_BETWEEN_EMAILS = 6;
const WORKOUT_STALE_DAYS = 10;
// After this much silence, stop emailing. Someone a month past their last
// check-in has not missed a notification, they have stopped -- and that is a
// phone call from their coach, not a sixth automated nudge. Kept low enough
// that the address never starts collecting spam complaints, which is what
// would put the receipts and sign-in links at risk too.
const GIVE_UP_DAYS = 32;

/** Dates reach us in three shapes: ISO strings we wrote ourselves, Firestore
 * Timestamps from serverTimestamp(), and the plain {_seconds} form a Timestamp
 * takes once it has been through JSON. Anything else is treated as unknown
 * rather than coerced into a wrong date. */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value) ? null : value;
  if (typeof value.toDate === "function") {
    try {
      const d = value.toDate();
      return isNaN(d) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && typeof value._seconds === "number") {
    return new Date(value._seconds * 1000);
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d) ? null : d;
  }
  return null;
}

function daysBetween(later, earlier) {
  const a = toDate(later);
  const b = toDate(earlier);
  if (!a || !b) return null;
  return Math.floor((a - b) / 86400000);
}

/** The most recent date anything was logged against the program, or null. */
function lastWorkoutIso(client) {
  const days = (client.program && client.program.days) || [];
  let latest = null;
  for (const day of days) {
    for (const ex of day.exercises || []) {
      for (const week of ex.weeks || []) {
        if (week.updatedAt && (!latest || week.updatedAt > latest)) latest = week.updatedAt;
      }
    }
  }
  return latest;
}

function lastCheckInIso(client) {
  const checkIns = client.checkIns || [];
  if (!checkIns.length) return null;
  const dates = checkIns.map((c) => c.date).filter(Boolean).sort();
  const last = dates[dates.length - 1];
  return last ? `${last}T12:00:00.000Z` : null;
}

/**
 * Decides whether to email one client, and what to say.
 * Returns { send: false, reason } or { send: true, subject, lines, ... }.
 *
 * Deliberately conservative: anything unclear is a no-send. A coaching
 * relationship survives a missed reminder; it does not survive the app
 * emailing someone every morning.
 */
function decideReminder(client, nowIso) {
  const reminders = client.reminders || {};
  if (reminders.enabled === false) return { send: false, reason: "coach switched reminders off" };
  if (!reminders.email) return { send: false, reason: "no email on file" };
  if (client.revoked) return { send: false, reason: "client revoked" };
  // A client who hasn't paid hasn't got a program to be reminded about.
  if (client.priceCents > 0 && !client.paid) return { send: false, reason: "not paid yet" };

  if (reminders.lastReminderAt) {
    const since = daysBetween(nowIso, reminders.lastReminderAt);
    if (since !== null && since < MIN_DAYS_BETWEEN_EMAILS) {
      return { send: false, reason: `emailed ${since}d ago` };
    }
  }

  const name = client.displayName || client.label || "there";
  const checkInIso = lastCheckInIso(client);
  // How long they have been silent: since their last check-in, or since the
  // coach added them if they never made one.
  const silentSince = checkInIso || client.addedAt || client.createdAt || null;
  const silentDays = silentSince ? daysBetween(nowIso, silentSince) : null;
  if (silentDays !== null && silentDays > GIVE_UP_DAYS) {
    return { send: false, reason: `silent ${silentDays}d -- stopped emailing, needs a call`, stale: true, silentDays };
  }
  const workoutIso = lastWorkoutIso(client);
  const lines = [];

  let checkInDays = null;
  if (checkInIso) {
    checkInDays = daysBetween(nowIso, checkInIso);
    if (checkInDays !== null && checkInDays >= CHECK_IN_OVERDUE_DAYS) {
      lines.push(`It's been ${checkInDays} days since your last check-in. Weight, sleep and how you're feeling — it takes about ten seconds.`);
    }
  } else {
    // Never checked in. Give them a few days from when the coach added them.
    const addedIso = client.addedAt || client.createdAt || null;
    const age = addedIso ? daysBetween(nowIso, addedIso) : null;
    if (age === null || age >= FIRST_CHECK_IN_GRACE_DAYS) {
      lines.push("You haven't logged a starting weight yet. That first check-in is what everything after it gets measured against.");
    }
  }

  if (workoutIso) {
    const workoutDays = daysBetween(nowIso, workoutIso);
    if (workoutDays !== null && workoutDays >= WORKOUT_STALE_DAYS) {
      lines.push(`Nothing has been logged against your program in ${workoutDays} days either. If something's in the way, reply to this and tell me — that's what I'm here for.`);
    }
  }

  if (!lines.length) return { send: false, reason: "nothing overdue" };

  return {
    send: true,
    to: reminders.email,
    name,
    subject: checkInDays === null ? "Your first check-in" : "Time to check in",
    lines,
  };
}

/** Plain-text and HTML bodies from a decision. Kept here so the wording is
 * testable and lives next to the rules that produce it. */
function renderReminderEmail(decision, appUrl) {
  const greeting = `Hi ${decision.name},`;
  const cta = `Open your app: ${appUrl}`;
  const footer = "If you'd rather not get these, just tell me and I'll switch them off.";
  const text = [greeting, "", ...decision.lines, "", cta, "", footer, "", "— Carlos, SemperFit365"].join("\n");
  const html = [
    `<p>${greeting}</p>`,
    ...decision.lines.map((l) => `<p>${l}</p>`),
    `<p><a href="${appUrl}">Open your app</a></p>`,
    `<p style="color:#666;font-size:13px;">${footer}</p>`,
    `<p>— Carlos, SemperFit365</p>`,
  ].join("");
  return { text, html };
}

/** Clients the automated nudges have given up on, for the coach dashboard.
 * These are the ones worth a personal message. */
function isUnreachable(client, nowIso) {
  const decision = decideReminder(client, nowIso);
  return !!decision.stale;
}

module.exports = {
  decideReminder,
  isUnreachable,
  toDate,
  renderReminderEmail,
  lastCheckInIso,
  lastWorkoutIso,
  CHECK_IN_OVERDUE_DAYS,
  MIN_DAYS_BETWEEN_EMAILS,
  WORKOUT_STALE_DAYS,
  FIRST_CHECK_IN_GRACE_DAYS,
  GIVE_UP_DAYS,
};
