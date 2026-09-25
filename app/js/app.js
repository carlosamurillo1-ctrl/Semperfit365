import { fetchGoogleSheetCsv, parseGoogleSheetUrl } from "./csv.js";
import { parseWorkoutSheet, parseWorkoutSheets } from "./workoutParser.js";
import { Store } from "./store.js";
import { SEED_SHEET_TEXT } from "./seedProgram.js";
import { PROGRAM_TEMPLATES } from "./programTemplates.js";
import { EXERCISE_CATALOG, MUSCLE_GROUPS } from "./exerciseCatalog.js";
import { Nutrition } from "./nutrition.js";
import { lookupBarcode, searchFoodByName } from "./foodApi.js";
import { RECIPE_LIBRARY, DIET_TAGS, MEAL_SLOTS, filterRecipes } from "./recipeLibrary.js";
import { ZONES, LEVELS, DURATIONS, buildSession, zoneBreakdown, estimateCalories, sessionTimeline, totalSeconds } from "./treadmill.js";
import {
  isSyncConfigured,
  newId,
  pushClientProgram,
  pushClientCheckIns,
  setClientReminders,
  runSyncDiagnostics,
  addClientToRoster,
  removeClientFromRoster,
  listenRoster,
  listenClient,
  markClientPaid,
  onSyncStatusChange,
  getClientLabel,
  publishCustomProgram,
  setClientManagedProgram,
  getClientManagedProgram,
  getCustomProgram,
  unpublishCustomProgram,
  assignProgramToClient,
  isSignInLink,
  sendClientSignInLink,
  completeClientSignIn,
  getCurrentClientEmail,
  recordClientEmail,
} from "./sync.js";

const LOCAL_KEYS = {
  clientId: "sf365.clientId",
  clientName: "sf365.clientName",
  coachId: "sf365.coachId",
  clientPriceCents: "sf365.clientPriceCents",
  clientPaid: "sf365.clientPaid",
  clientEmail: "sf365.clientEmail",
  theme: "sf365.theme",
  lastAppliedAssignment: "sf365.lastAppliedAssignment",
  // Set from the client link when the coach built their program. A managed
  // device shows that one program, read-only, and re-reads it on every load.
  managed: "sf365.managed",
  managedProgramLocalId: "sf365.managedProgramLocalId",
  checkInPromptedOn: "sf365.checkInPromptedOn",
  remindersOff: "sf365.remindersOff",
  coachPin: "sf365.coachPin",
  coachPinOkUntil: "sf365.coachPinOkUntil",
};

/** True on a device whose program is owned by the coach: no editing, no other
 * programs, no templates. Checked before rendering any editing control *and*
 * again in the action handler, so nothing is reachable by firing the action. */
function isManagedClient() {
  return localStorage.getItem(LOCAL_KEYS.managed) === "true";
}

/** "auto" (default, follows system) | "light" | "dark" -- a per-device display preference, not synced. */
function getTheme() {
  return localStorage.getItem(LOCAL_KEYS.theme) || "auto";
}
function applyTheme(theme) {
  if (theme === "light" || theme === "dark") {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
}
function setTheme(theme) {
  localStorage.setItem(LOCAL_KEYS.theme, theme);
  applyTheme(theme);
}

function getLocalClientId() {
  return localStorage.getItem(LOCAL_KEYS.clientId) || "";
}
function getClientName() {
  return localStorage.getItem(LOCAL_KEYS.clientName) || "";
}
function setClientName(name) {
  localStorage.setItem(LOCAL_KEYS.clientName, name);
}
const COACH_EMAIL = "Semperfit365@gmail.com";
const COACH_PHONE_DISPLAY = "(914) 575-9554";
const COACH_PHONE_HREF = "+19145759554";

/** Email + text buttons for reaching the coach directly, used on client-facing screens. */
function contactCoachButtons() {
  return `
    <div class="btn-row">
      <a class="btn" href="mailto:${COACH_EMAIL}">Email coach</a>
      <a class="btn" href="sms:${COACH_PHONE_HREF}">Text coach</a>
    </div>
  `;
}

function getOrCreateCoachId() {
  let id = localStorage.getItem(LOCAL_KEYS.coachId);
  if (!id) {
    id = newId();
    localStorage.setItem(LOCAL_KEYS.coachId, id);
  }
  return id;
}

/** True only on a device that is actually the coach's.
 *
 * A coach id is what grants access to the roster, and it only ever lands on a
 * device two ways: this device created one by opening the dashboard before
 * this gate existed, or it arrived in a coach link (see the Coach access card).
 * A client device is never one, whatever else it holds.
 *
 * Everyone else -- anyone who simply opens the app's address -- gets no coach
 * dashboard and no way to conjure one, rather than the blank dashboard of
 * their own they used to get. */
function isCoachDevice() {
  // A managed client's device is locked out of coach screens outright.
  if (isManagedClient()) return false;
  // Otherwise the coach id alone decides it. Deliberately not "and isn't a
  // client": the coach opening one of his own client links to test it would
  // otherwise lock himself out of his own dashboard, and a real client's
  // device never gets a coach id -- nothing creates one except opening the
  // dashboard (which they can't) or a coach link (which they never get).
  return !!localStorage.getItem(LOCAL_KEYS.coachId);
}

// ---------- optional PIN in front of the dashboard ----------

/** SHA-256 of the pin. Worth saying plainly: this stops someone who picks up
 * an unlocked phone, and nothing more -- a four-digit pin is brute-forceable
 * in an instant by anyone who opens devtools, and the hash sits right there in
 * the same storage. It is a privacy screen, not a security boundary. */
async function hashPin(pin) {
  const bytes = new TextEncoder().encode(`sf365:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function coachPinIsSet() {
  return !!localStorage.getItem(LOCAL_KEYS.coachPin);
}

/** Unlocks for a stretch rather than per-tap, so building a client's program
 * doesn't mean re-entering the pin on every screen. */
const PIN_GRACE_MS = 30 * 60 * 1000;
function coachPinSatisfied() {
  if (!coachPinIsSet()) return true;
  const until = parseInt(localStorage.getItem(LOCAL_KEYS.coachPinOkUntil) || "0", 10);
  return Date.now() < until;
}
function markCoachPinSatisfied() {
  localStorage.setItem(LOCAL_KEYS.coachPinOkUntil, String(Date.now() + PIN_GRACE_MS));
}

function coachAccessLink() {
  return `${window.location.origin}${window.location.pathname}?coach=${encodeURIComponent(getOrCreateCoachId())}`;
}

const app = document.getElementById("app");
const tabbar = document.getElementById("tabbar");

const state = {
  tab: "program",
  screen: "program", // program | import | review | day | exercise | history | settings
  params: {},
  pendingImport: null, // { days: [{ dayTitle, exercises }], source }
  toast: null,
  libraryFilter: { query: "", group: "All" },
  // Survives navigating into a recipe and back, so a filtered list isn't lost
  // every time someone opens one to look at it.
  recipeFilter: { tags: [], slot: "All", query: "" },
};

// One timer, cancelled and restarted on each toast. Without that, an earlier
// toast's timeout fires partway through a later one and wipes it -- so the
// message that actually matters (the one explaining why something failed)
// flashes and disappears, which is how a real error goes unread.
let toastTimer = null;
function toast(msg) {
  state.toast = msg;
  render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state.toast = null;
    toastTimer = null;
    render();
  }, 2800);
}

// Live Firestore listeners for the coach views, scoped to whichever coach
// screen is currently active (see navigate() below).
let coachRosterUnsub = null;
let coachRosterData = [];
let coachClientUnsub = null;
let coachClientListenedId = null;
let coachClientData = null;

function ensureCoachRosterListener() {
  if (coachRosterUnsub) return;
  try {
    coachRosterUnsub = listenRoster(getOrCreateCoachId(), (rows) => {
      coachRosterData = rows;
      if (state.screen === "coach") render();
    });
  } catch {
    toast("Coach sync isn't set up correctly — check the Firebase config");
  }
}
function teardownCoachRosterListener() {
  if (coachRosterUnsub) coachRosterUnsub();
  coachRosterUnsub = null;
  coachRosterData = [];
}
function ensureCoachClientListener(clientId) {
  if (coachClientListenedId === clientId && coachClientUnsub) return;
  teardownCoachClientListener();
  coachClientListenedId = clientId;
  try {
    coachClientUnsub = listenClient(clientId, (data) => {
      coachClientData = data;
      if (state.screen.startsWith("coach-client")) render();
    });
  } catch {
    toast("Coach sync isn't set up correctly — check the Firebase config");
  }
}
function teardownCoachClientListener() {
  if (coachClientUnsub) coachClientUnsub();
  coachClientUnsub = null;
  coachClientListenedId = null;
  coachClientData = null;
}

function navigate(screen, params = {}) {
  state.screen = screen;
  state.params = params;
  if (["program", "history", "nutrition", "settings"].includes(screen)) state.tab = screen;
  if (screen !== "nutrition-scan") stopBarcodeScan();

  if (screen === "coach") {
    teardownCoachClientListener();
    ensureCoachRosterListener();
  } else if (screen.startsWith("coach-client")) {
    teardownCoachRosterListener();
    ensureCoachClientListener(params.clientId);
  } else {
    teardownCoachRosterListener();
    teardownCoachClientListener();
  }

  window.scrollTo(0, 0);
  render();
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Firestore Timestamp objects (from serverTimestamp()) need .toDate(); plain ISO strings pass through. */
function firestoreTimeToIso(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate().toISOString();
  return ts;
}

/** Extract a YouTube video ID from watch/share/shorts/embed URL formats, or null if not recognized. */
function youtubeVideoId(url) {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// ---------- render root ----------

function render() {
  const isPaywallGate = state.screen === "paywall-signin" || state.screen === "paywall-payment";
  tabbar.style.display = isPaywallGate ? "none" : "";
  tabbar.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.route === state.tab && ["program", "history", "nutrition", "settings"].includes(state.screen));
  });

  let html = "";
  switch (state.screen) {
    case "paywall-signin": html = renderPaywallSignin(); break;
    case "paywall-payment": html = renderPaywallPayment(); break;
    case "program": html = renderProgram(); break;
    case "import": html = renderImport(); break;
    case "review": html = renderReview(); break;
    case "day": html = renderDay(); break;
    case "add-exercise": html = renderAddExercise(); break;
    case "exercise": html = renderExercise(); break;
    case "history": html = renderHistory(); break;
    case "settings": html = renderSettings(); break;
    case "templates": html = renderTemplates(); break;
    case "exercise-library": html = renderExerciseLibrary(); break;
    case "cardio": html = renderCardio(); break;
    case "cardio-day": html = renderCardioDay(); break;
    case "coach": html = renderCoach(); break;
    case "coach-pin": html = renderCoachPin(); break;
    case "coach-add-client": html = renderCoachAddClient(); break;
    case "coach-draft-day": html = renderCoachDraftDay(); break;
    case "coach-client-link": html = renderCoachClientLink(); break;
    case "coach-client": html = renderCoachClient(); break;
    case "coach-client-assign-program": html = renderCoachClientAssignProgram(); break;
    case "coach-client-day": html = renderCoachClientDay(); break;
    case "coach-client-exercise": html = renderCoachClientExercise(); break;
    case "nutrition": html = renderNutrition(); break;
    case "nutrition-add": html = renderNutritionAdd(); break;
    case "nutrition-search": html = renderNutritionSearch(); break;
    case "nutrition-scan": html = renderNutritionScan(); break;
    case "nutrition-review": html = renderNutritionReview(); break;
    case "nutrition-manual": html = renderNutritionManual(); break;
    case "nutrition-weight": html = renderNutritionWeight(); break;
    case "nutrition-goals": html = renderNutritionGoals(); break;
    case "nutrition-recipes": html = renderNutritionRecipes(); break;
    case "treadmill": html = renderTreadmill(); break;
    case "treadmill-run": html = renderTreadmillRun(); break;
    case "recipe-library": html = renderRecipeLibrary(); break;
    case "recipe-library-item": html = renderLibraryRecipe(); break;
    case "nutrition-recipe-new": html = renderNutritionRecipeNew(); break;
    default: html = renderProgram();
  }
  if (state.toast) html += `<div class="toast">${esc(state.toast)}</div>`;
  app.innerHTML = html;
  attachHandlers();
}

function topbar(title, opts = {}) {
  const backBtn = opts.back
    ? `<button class="btn ghost small" data-action="${opts.backAction || "back"}" style="width:auto;padding:6px 10px;">&larr; Back</button>`
    : `<div class="brand"><span class="logo-crop"><img src="icons/logo.jpg" alt="SemperFit365"/></span></div>`;
  const right = opts.right || `<div style="width:${opts.back ? "70px" : "0"}"></div>`;
  return `<div class="topbar">${backBtn}<h1 style="margin:0;font-size:17px;">${esc(title)}</h1>${right}</div>`;
}

// ---------- PAYWALL screens (email sign-in + payment gate for a priced client link) ----------

/** The name the coach gave this client, fetched once at boot (see boot()) so
 * the paywall screens can greet by name instead of opening cold. Empty
 * string if unavailable -- both render functions fall back gracefully. */
let paywallClientLabel = "";

function renderPaywallSignin() {
  const sent = state.params.signinSent;
  const greetName = paywallClientLabel ? `, ${esc(paywallClientLabel)}` : "";
  return `
    <div style="text-align:center;padding:24px 0 8px;">
      <span class="logo-crop" style="width:140px;height:58px;margin:0 auto;"><img src="icons/logo.jpg" alt="SemperFit365"/></span>
    </div>
    <div class="card">
      ${sent ? `
        <h2>Check your email</h2>
        <p>We sent a sign-in link to <strong>${esc(sent)}</strong>. Open it on this device to continue.</p>
        <div style="height:10px"></div>
        <button class="btn ghost" data-action="resend-signin-link" data-email="${esc(sent)}">Use a different email</button>
      ` : `
        <h2>Welcome${greetName}!</h2>
        <p>Your coach set you up with a program on SemperFit365. Before it unlocks, verify your email below -- enter it and we'll send you a link to continue.</p>
        <div style="height:10px"></div>
        <label for="signin-email">Email</label>
        <input type="email" id="signin-email" placeholder="you@example.com" />
        <div style="height:10px"></div>
        <button class="btn primary" data-action="send-signin-link">Send sign-in link</button>
      `}
    </div>
    <p class="hint" style="text-align:center;margin:14px 0 8px;">Stuck, or the link isn't working?</p>
    ${contactCoachButtons()}
  `;
}

async function handleSendSigninLink() {
  const input = document.getElementById("signin-email");
  const email = input.value.trim();
  if (!email || !email.includes("@")) {
    toast("Enter a valid email");
    return;
  }
  try {
    await sendClientSignInLink(email);
    state.params.signinSent = email;
    render();
  } catch {
    toast("Couldn't send that link — check your connection and try again");
  }
}

function renderPaywallPayment() {
  const priceCents = parseInt(localStorage.getItem(LOCAL_KEYS.clientPriceCents) || "0", 10);
  const amount = (priceCents / 100).toFixed(2);
  const greetName = paywallClientLabel ? `, ${esc(paywallClientLabel)}` : "";
  return `
    <div style="text-align:center;padding:24px 0 8px;">
      <span class="logo-crop" style="width:140px;height:58px;margin:0 auto;"><img src="icons/logo.jpg" alt="SemperFit365"/></span>
    </div>
    <div class="card">
      <h2>You're verified${greetName} -- almost there</h2>
      <p>Your program is ready — send <strong>$${amount}</strong> via Zelle to unlock it.</p>
      <div style="height:10px"></div>
      <div class="row">
        <span class="source-chip">Zelle: ${COACH_EMAIL}</span>
      </div>
      <div style="height:14px"></div>
      <p class="hint">Once your coach confirms the payment, this screen unlocks automatically — no need to reload or do anything else here.</p>
    </div>
    <p class="hint" style="text-align:center;margin:14px 0 8px;">Already paid, or have a question?</p>
    ${contactCoachButtons()}
  `;
}

function isWeekEmptyRow(w) {
  return w.values.every((v) => !v) && (w.reps || []).every((v) => !v) && !w.notes;
}

/**
 * A day's overall progress: which week is still open (the earliest week
 * number that at least one of the day's exercises hasn't logged yet) and
 * the day's longest week count. Null for a day with no exercises.
 */
function dayProgress(day) {
  const exercises = day.exercises;
  if (!exercises.length) return null;
  const totalWeeks = Math.max(...exercises.map((e) => e.weeks.length));
  let currentWeek = totalWeeks;
  for (let w = 1; w <= totalWeeks; w++) {
    const stillOpen = exercises.some((e) => {
      const row = e.weeks.find((wk) => wk.week === w);
      return row ? isWeekEmptyRow(row) : false;
    });
    if (stillOpen) { currentWeek = w; break; }
  }
  const complete = exercises.every((e) => e.weeks.every((wk) => !isWeekEmptyRow(wk)));
  return { currentWeek, totalWeeks, complete };
}

// ---------- PROGRAM screen (list of days) ----------

function programSwitcherTopbarOpts() {
  const programs = Store.listPrograms();
  // A managed client has exactly one program and may not reach another.
  const switcher = programs.length > 1 && !isManagedClient()
    ? `<select id="program-switcher" data-change-action="switch-program" aria-label="Switch program" style="width:auto;max-width:110px;padding:6px 8px;font-size:12px;background:var(--bg-elev-2);border:1px solid var(--border);border-radius:10px;color:var(--text);">${programs.map((p) => `<option value="${esc(p.id)}" ${p.active ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>`
    : "";
  const calendarBtn = `
    <button class="btn ghost small" data-action="go-cardio" aria-label="Cardio and steps calendar" style="width:auto;padding:6px 8px;">
      <svg viewBox="0 0 24 24" width="18" height="18" style="display:block;"><path fill="currentColor" d="M7 2v2H5a2 2 0 0 0-2 2v3h18V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zM3 10v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9H3z"/></svg>
    </button>`;
  return {
    right: `<div style="display:flex;align-items:center;gap:6px;">${calendarBtn}${switcher}</div>`,
  };
}

/** The one reminder that works with no server and no permission prompt: show
 * it when they open the app. A browser can only push to a closed phone with a
 * push service behind it (see README), so this is the reliable half -- and in
 * practice the half that gets the weigh-in done, because they are already
 * holding the phone and already in the app.
 *
 * Shows after 7 days (or never having checked in), once per day, and only
 * while the coach has reminders on for them. */
function renderCheckInPrompt() {
  if (remindersDisabled()) return "";
  const since = Nutrition.daysSinceLastCheckIn();
  const overdue = since === null || since >= 7;
  if (!overdue) return "";
  if (localStorage.getItem(LOCAL_KEYS.checkInPromptedOn) === Nutrition.todayStr()) return "";
  return `
    <div class="card" style="border-color:var(--accent);">
      <div class="row" style="align-items:flex-start;">
        <div style="min-width:0;">
          <h3 style="margin:0;">${since === null ? "Log your starting weight" : "Time to check in"}</h3>
          <p style="margin:4px 0 0;">${since === null
            ? "Your first weigh-in is what everything after it gets measured against — it takes ten seconds."
            : `It's been ${since} days. Weight, sleep and how you're feeling — ten seconds.`}</p>
        </div>
        <button class="btn ghost small" data-action="dismiss-check-in-prompt" style="width:auto;padding:4px 9px;flex:none;" aria-label="Not now">&#10005;</button>
      </div>
      <div style="height:10px"></div>
      <button class="btn primary" data-action="go-check-in">Check in now</button>
    </div>`;
}

/** The coach can switch a client's nudges off from their dashboard. */
function remindersDisabled() {
  return localStorage.getItem(LOCAL_KEYS.remindersOff) === "true";
}

function renderProgram() {
  const program = Store.getProgram();
  if (!program || program.days.length === 0) {
    return `
      ${topbar("", programSwitcherTopbarOpts())}
      <div class="empty">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M20.5 3.5 21 4a1 1 0 0 1 0 1.4L6.9 19.5l-4.4 1 1-4.4L17.6 2.1a1 1 0 0 1 1.4 0l1.5 1.4Z"/></svg>
        <h2>No workout days yet</h2>
        ${isManagedClient()
          ? `<p>Your coach hasn't finished setting up your program yet. Pull down to refresh, or tap below to check again.</p>
             <div style="height:16px"></div>
             <button class="btn primary" data-action="refresh-managed-program">Check for my program</button>`
          : `<p>Connect your Google Sheet, paste your workout data, or upload a CSV to get started.</p>
             <div style="height:16px"></div>
             <button class="btn primary" data-action="go-import">Import a workout day</button>`}
      </div>`;
  }

  const items = program.days.map((day) => {
    const exCount = day.exercises.length;
    const progress = dayProgress(day);
    const pct = progress ? Math.round(((progress.currentWeek - 1) / progress.totalWeeks) * 100) : 0;
    const weekLabel = progress ? (progress.complete ? "Complete" : `Week ${progress.currentWeek} of ${progress.totalWeeks}`) : "";
    return `
      <div class="card tappable" data-action="open-day" data-day="${esc(day.id)}">
        <div class="row">
          <div>
            <h3>${esc(day.name)}</h3>
            <p>${day.type === "treadmill"
              ? "Treadmill &middot; pick your level and time"
              : `${exCount} exercise${exCount === 1 ? "" : "s"}${weekLabel ? ` &middot; ${weekLabel}` : ""}`}</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${isManagedClient() ? "" : `<button class="btn ghost small" data-action="rename-day" data-day="${esc(day.id)}" style="width:auto;padding:4px 8px;font-size:15px;" aria-label="Rename day">&#9998;</button>`}
            <span class="pill">Open</span>
          </div>
        </div>
        ${day.type !== "treadmill" && progress ? `<div class="progress-track"><div class="progress-fill${progress.complete ? " complete" : ""}" style="width:${progress.complete ? 100 : pct}%"></div></div>` : ""}
      </div>`;
  }).join("");

  return `
    ${topbar("", programSwitcherTopbarOpts())}
    ${renderCheckInPrompt()}
    <div class="row" style="margin-bottom:14px;">
      <span class="source-chip">${program.days.length} workout day${program.days.length === 1 ? "" : "s"}</span>
      ${isManagedClient() ? "" : `<button class="btn ghost small" data-action="go-import">+ Add day</button>`}
    </div>
    ${items}
  `;
}

// ---------- TREADMILL screens ----------

// The client's choices, and a running session if one is in progress. In memory
// only: a half-finished run is not worth persisting, and a stale one resuming
// three days later would be worse than useless.
let treadmillPick = { level: 3, minutes: 30 };
let treadmillRun = null; // { session, timeline, elapsed, paused, tickId, dayId }

function zoneChip(zoneId) {
  const z = ZONES[zoneId];
  return `<span class="zone-chip" style="background:${z.colour};">${esc(z.short)}</span>`;
}

function fmtClock(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function renderTreadmill() {
  const day = Store.getDay(state.params.dayId);
  if (!day) { navigate("program"); return ""; }
  const session = buildSession(treadmillPick.level, treadmillPick.minutes);
  const zones = zoneBreakdown(session);
  const goals = Nutrition.getGoals();
  const kcal = estimateCalories(session, goals.weightGoal || Nutrition.getLatestWeight()?.weight);

  const levelChips = LEVELS.map((l) => `
    <button class="chip${treadmillPick.level === l.level ? " on" : ""}" data-action="set-treadmill-level" data-level="${l.level}">${l.level} &middot; ${esc(l.name)}</button>
  `).join("");
  const durationChips = DURATIONS.map((d) => `
    <button class="chip${treadmillPick.minutes === d ? " on" : ""}" data-action="set-treadmill-duration" data-minutes="${d}">${d} min</button>
  `).join("");

  const chosen = LEVELS.find((l) => l.level === treadmillPick.level);
  const rows = session.blocks.map((b) => `
    <div class="tm-row">
      ${zoneChip(b.zone)}
      <div style="flex:1;min-width:0;">
        <strong>${esc(b.label)}</strong>
        <p style="margin:1px 0 0;">${esc(ZONES[b.zone].feel)}</p>
      </div>
      <span class="tm-mins">${b.minutes} min</span>
    </div>`).join("");

  return `
    ${topbar(day.name, { back: true })}
    <div class="card">
      <label>How hard</label>
      <div class="chip-row">${levelChips}</div>
      <p class="hint" style="margin:8px 0 0;">${esc(chosen.blurb)}</p>
      <div style="height:14px"></div>
      <label>How long</label>
      <div class="chip-row">${durationChips}</div>
    </div>

    <div class="card">
      <div class="row" style="align-items:baseline;">
        <h3 style="margin:0;">Your session</h3>
        <span class="source-chip">~${kcal} cal</span>
      </div>
      <p class="hint" style="margin:6px 0 10px;">
        ${zones[1] ? `${zones[1]} min easy` : ""}${zones[2] ? ` &middot; ${zones[2]} min steady` : ""}${zones[3] ? ` &middot; ${zones[3]} min hard` : ""}
      </p>
      ${rows}
    </div>

    <button class="btn primary" data-action="start-treadmill" data-day="${esc(day.id)}">Start</button>
    <div style="height:10px"></div>
    <div class="card">
      <h3>The three zones</h3>
      ${[1, 2, 3].map((id) => `
        <div class="tm-row">
          ${zoneChip(id)}
          <div style="flex:1;min-width:0;">
            <strong>${esc(ZONES[id].name)} &middot; ${esc(ZONES[id].hr)} of max HR</strong>
            <p style="margin:1px 0 0;">${esc(ZONES[id].feel)} ${esc(ZONES[id].purpose)}</p>
          </div>
        </div>`).join("")}
      <p class="hint" style="margin:10px 0 0;">No heart rate monitor? Go by the talking test &mdash; it tracks the zones closely enough, and it works on any treadmill.</p>
    </div>
  `;
}

function startTreadmill(dayId) {
  const session = buildSession(treadmillPick.level, treadmillPick.minutes);
  treadmillRun = {
    dayId,
    session,
    timeline: sessionTimeline(session),
    total: totalSeconds(session),
    elapsed: 0,
    paused: false,
    tickId: null,
  };
  navigate("treadmill-run", { dayId });
  treadmillTick();
}

/** Drives the clock. Updates only the handful of elements that change rather
 * than re-rendering the screen every second, so the buttons stay tappable and
 * the page doesn't flicker. */
// Lets a test jump the clock forward rather than waiting out a real session.
// Harmless in production: it only touches a run that is already in progress.
window.__tmSkip = (seconds) => {
  if (treadmillRun) { treadmillRun.elapsed = Math.min(treadmillRun.total - 1, treadmillRun.elapsed + seconds); paintTreadmillRun(); }
};

function treadmillTick() {
  if (treadmillRun?.tickId) clearInterval(treadmillRun.tickId);
  if (!treadmillRun) return;
  treadmillRun.tickId = setInterval(() => {
    if (!treadmillRun || treadmillRun.paused) return;
    treadmillRun.elapsed += 1;
    if (treadmillRun.elapsed >= treadmillRun.total) {
      finishTreadmill(true);
      return;
    }
    paintTreadmillRun();
  }, 1000);
}

function currentTreadmillBlock() {
  if (!treadmillRun) return null;
  const t = treadmillRun.elapsed;
  return treadmillRun.timeline.find((b) => t >= b.startSec && t < b.endSec) || treadmillRun.timeline[treadmillRun.timeline.length - 1];
}

function paintTreadmillRun() {
  if (!treadmillRun) return;
  const block = currentTreadmillBlock();
  if (!block) return;
  const idx = treadmillRun.timeline.indexOf(block);
  const next = treadmillRun.timeline[idx + 1];
  const leftInBlock = block.endSec - treadmillRun.elapsed;
  const set = (id, value) => { const el = document.getElementById(id); if (el && el.textContent !== value) el.textContent = value; };

  set("tm-block-clock", fmtClock(leftInBlock));
  set("tm-block-label", block.label);
  set("tm-zone-name", `${ZONES[block.zone].name} — ${ZONES[block.zone].hr}`);
  set("tm-zone-feel", ZONES[block.zone].feel);
  set("tm-next", next ? `Next: ${next.label} · ${next.minutes} min` : "Last block — finish strong");
  set("tm-total", `${fmtClock(treadmillRun.elapsed)} / ${fmtClock(treadmillRun.total)}`);

  const stage = document.getElementById("tm-stage");
  if (stage) stage.style.background = ZONES[block.zone].colour;
  const bar = document.getElementById("tm-progress");
  if (bar) bar.style.width = `${Math.round((treadmillRun.elapsed / treadmillRun.total) * 100)}%`;

  // A short buzz on each change of zone, so they don't have to watch the screen.
  if (treadmillRun.lastZone !== undefined && treadmillRun.lastZone !== block.zone && navigator.vibrate) {
    navigator.vibrate(block.zone === 3 ? [120, 80, 120] : 120);
  }
  treadmillRun.lastZone = block.zone;
}

function renderTreadmillRun() {
  if (!treadmillRun) { navigate("program"); return ""; }
  const block = currentTreadmillBlock();
  const z = ZONES[block.zone];
  setTimeout(paintTreadmillRun, 0);
  return `
    ${topbar("", { back: true, backAction: "quit-treadmill" })}
    <div id="tm-stage" class="tm-stage" style="background:${z.colour};">
      <div class="tm-zone-name" id="tm-zone-name">${esc(z.name)} — ${esc(z.hr)}</div>
      <div class="tm-clock" id="tm-block-clock">${fmtClock(block.endSec - treadmillRun.elapsed)}</div>
      <div class="tm-block-label" id="tm-block-label">${esc(block.label)}</div>
      <div class="tm-feel" id="tm-zone-feel">${esc(z.feel)}</div>
    </div>
    <div class="tm-progress-track"><div class="tm-progress" id="tm-progress"></div></div>
    <p class="hint" style="text-align:center;margin:8px 0 2px;" id="tm-next"></p>
    <p class="hint" style="text-align:center;margin:0 0 14px;" id="tm-total"></p>
    <div class="btn-row">
      <button class="btn" data-action="toggle-treadmill-pause">${treadmillRun.paused ? "Resume" : "Pause"}</button>
      <button class="btn danger" data-action="quit-treadmill">End</button>
    </div>
  `;
}

/** Saves the session to the cardio calendar so it sits alongside everything
 * else they've logged, then clears the timer. */
function finishTreadmill(completed) {
  if (!treadmillRun) { navigate("program"); return; }
  clearInterval(treadmillRun.tickId);
  const minutesDone = Math.round(treadmillRun.elapsed / 60);
  const goals = Nutrition.getGoals();
  const done = completed
    ? treadmillRun.session
    : { ...treadmillRun.session, blocks: sessionTimeline(treadmillRun.session).filter((b) => b.startSec < treadmillRun.elapsed).map((b) => ({ ...b, minutes: Math.min(b.minutes, (Math.min(b.endSec, treadmillRun.elapsed) - b.startSec) / 60) })) };
  const kcal = estimateCalories(done, goals.weightGoal || Nutrition.getLatestWeight()?.weight);

  if (minutesDone >= 1) {
    const today = Nutrition.todayStr();
    const existing = Store.getCardioEntry(today) || {};
    Store.setCardioEntry(today, {
      ...existing,
      calories: String((parseInt(existing.calories, 10) || 0) + kcal),
      note: `${treadmillRun.session.level ? `Treadmill L${treadmillRun.session.level}` : "Treadmill"} · ${minutesDone} min${completed ? "" : " (ended early)"}`,
    });
  }
  const dayId = treadmillRun.dayId;
  treadmillRun = null;
  toast(minutesDone >= 1
    ? `${minutesDone} min logged${completed ? " — session complete" : ""}`
    : "Session ended");
  navigate(dayId ? "treadmill" : "program", { dayId });
}

// ---------- CARDIO & STEPS calendar ----------

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function pad2(n) { return String(n).padStart(2, "0"); }
function isoDate(year, monthIndex, day) { return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`; }

function renderCardioMonth(year, monthIndex, cardioLog, todayIso) {
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const numDays = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(`<div class="cardio-cell empty"></div>`);
  for (let d = 1; d <= numDays; d++) {
    const dateStr = isoDate(year, monthIndex, d);
    const entry = cardioLog[dateStr];
    cells.push(`
      <button class="cardio-cell${entry ? " logged" : ""}${dateStr === todayIso ? " today" : ""}" data-action="open-cardio-day" data-date="${dateStr}">
        <span class="cardio-daynum">${d}</span>
        ${entry ? '<span class="cardio-dot"></span>' : ""}
      </button>
    `);
  }
  return `
    <div class="card cardio-month">
      <h3>${MONTH_NAMES[monthIndex]} ${year}</h3>
      <div class="cardio-grid cardio-weekdays">${WEEKDAY_LABELS.map((w) => `<div>${w}</div>`).join("")}</div>
      <div class="cardio-grid">${cells.join("")}</div>
    </div>
  `;
}

function renderCardio() {
  const cardioLog = Store.getCardioLog();
  const now = new Date();
  const todayIso = isoDate(now.getFullYear(), now.getMonth(), now.getDate());
  const months = [];
  for (let i = 0; i < 36; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(renderCardioMonth(d.getFullYear(), d.getMonth(), cardioLog, todayIso));
  }
  return `
    ${topbar("Cardio & Steps", { back: true })}
    <div class="card">
      <p>Tap any day to log calories burned and steps. This calendar runs 3 years forward from this month.</p>
      <p class="hint">Steps and calories are entered by hand -- pull the numbers from your phone's Health/Fit app. A website can't read your step sensor live in the background.</p>
    </div>
    ${months.join("")}
  `;
}

function renderCardioDay() {
  const { date } = state.params;
  const entry = Store.getCardioEntry(date) || {};
  const d = new Date(`${date}T00:00:00`);
  const label = d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return `
    ${topbar("Log cardio", { back: true })}
    <div class="card">
      <h3>${esc(label)}</h3>
      <label for="cardio-calories">Calories burned</label>
      <input type="text" inputmode="numeric" id="cardio-calories" placeholder="e.g. 450" value="${esc(entry.calories || "")}" />
      <label for="cardio-steps">Steps</label>
      <input type="text" inputmode="numeric" id="cardio-steps" placeholder="e.g. 8200" value="${esc(entry.steps || "")}" />
      ${entry.note ? `<p class="hint" style="margin:10px 0 0;">${esc(entry.note)}</p>` : ""}
      <div style="height:10px"></div>
      <button class="btn primary" data-action="save-cardio-day" data-date="${esc(date)}">Save</button>
      ${(entry.calories || entry.steps || entry.note) ? `<div style="height:8px"></div><button class="btn danger" data-action="clear-cardio-day" data-date="${esc(date)}">Clear this day</button>` : ""}
    </div>
  `;
}

// ---------- IMPORT screen ----------

function renderImport() {
  const program = Store.getProgram();
  return `
    ${topbar("Import a workout day", { back: !!program && program.days.length > 0 })}
    <div class="card">
      <h3>From a Google Sheet</h3>
      <p>Share your sheet as "Anyone with the link can view", then paste the link to the tab (day) you want to import.</p>
      <label for="sheet-url">Google Sheet link</label>
      <input type="url" id="sheet-url" placeholder="https://docs.google.com/spreadsheets/d/..." />
      <div style="height:10px"></div>
      <button class="btn primary" data-action="import-sheet">Fetch from Google Sheets</button>
      <div id="import-error"></div>
    </div>

    <div class="divider">or</div>

    <div class="card">
      <h3>Paste from Google Sheets</h3>
      <p>Select the cells for one workout day in Google Sheets, copy (Ctrl/Cmd+C), and paste below.</p>
      <textarea id="csv-paste" placeholder="Paste your workout day here..."></textarea>
      <div style="height:10px"></div>
      <button class="btn" data-action="import-paste">Use pasted data</button>
    </div>

    <div class="divider">or</div>

    <div class="card">
      <h3>Upload a CSV file</h3>
      <input type="file" id="csv-file" accept=".csv,.tsv,text/csv,text/tab-separated-values" />
    </div>

    <div class="divider">or</div>

    <div class="card">
      <h3>Start with a blank day</h3>
      <p>Skip importing and build the day by hand, adding exercises one at a time.</p>
      <label for="blank-day-name">Day name</label>
      <input type="text" id="blank-day-name" placeholder="e.g. Tuesday (Legs)" />
      <div style="height:10px"></div>
      <button class="btn" data-action="create-blank-day">Create blank day</button>
    </div>
  `;
}

async function handleImportSheet() {
  const input = document.getElementById("sheet-url");
  const errBox = document.getElementById("import-error");
  const url = input.value.trim();
  errBox.innerHTML = "";
  if (!url) {
    errBox.innerHTML = `<div class="error">Paste a Google Sheets link first.</div>`;
    return;
  }
  if (!parseGoogleSheetUrl(url)) {
    errBox.innerHTML = `<div class="error">That doesn't look like a Google Sheets URL.</div>`;
    return;
  }
  errBox.innerHTML = `<div class="hint">Fetching...</div>`;
  try {
    const csvText = await fetchGoogleSheetCsv(url);
    beginImport(csvText, { type: "sheet", url });
  } catch (e) {
    errBox.innerHTML = `<div class="error">${esc(e.message)}</div>`;
  }
}

function handleImportPaste() {
  const text = document.getElementById("csv-paste").value;
  if (!text.trim()) {
    toast("Paste some data first");
    return;
  }
  beginImport(text, { type: "paste" });
}

function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = () => beginImport(String(reader.result), { type: "file", name: file.name });
  reader.onerror = () => toast("Couldn't read that file");
  reader.readAsText(file);
}

function handleCreateBlankDay() {
  const name = document.getElementById("blank-day-name").value.trim();
  if (!name) {
    toast("Give the day a name");
    return;
  }
  const dayId = Store.addDay({ name, source: null, exercises: [] });
  toast("Day added");
  navigate("day", { dayId });
}

function beginImport(text, source) {
  const days = parseWorkoutSheets(text);
  if (!days.length) {
    toast("Couldn't find any exercises in that data — check the format and try again");
    return;
  }
  state.pendingImport = { days, source };
  navigate("review");
}

// ---------- REVIEW screen (confirm parsed day(s) before saving) ----------

function renderReview() {
  const pending = state.pendingImport;
  if (!pending) {
    navigate("import");
    return "";
  }
  const multi = pending.days.length > 1;

  const dayBlocks = pending.days.map((day, di) => {
    const items = day.exercises.map((ex) => `
      <div class="row" style="align-items:flex-start;">
        <div>
          <h3 style="font-size:14px;">${esc(ex.name)}</h3>
          <p>${[ex.repGoal && `Reps: ${esc(ex.repGoal)}`, ex.restTime && `Rest: ${esc(ex.restTime)}`, `${ex.setLabels.length} set col${ex.setLabels.length === 1 ? "" : "s"}`, `${ex.weeks.length} weeks`].filter(Boolean).join(" &middot; ")}</p>
        </div>
      </div>
    `).join("");

    return `
      <div class="card">
        ${multi ? `
          <div class="row" style="margin-bottom:10px;">
            <label style="margin:0;display:flex;align-items:center;gap:8px;">
              <input type="checkbox" checked data-day-include="${di}" style="width:auto;" /> Include this day
            </label>
          </div>
        ` : ""}
        <label for="review-day-name-${di}">Day name</label>
        <input type="text" id="review-day-name-${di}" value="${esc(day.dayTitle || "")}" placeholder="e.g. Friday (Workout C)" />
        <p class="hint">Found ${day.exercises.length} exercise${day.exercises.length === 1 ? "" : "s"}.</p>
      </div>
      <div class="card">${items}</div>
    `;
  }).join("");

  return `
    ${topbar("Review import", { back: true })}
    ${multi ? `<div class="card"><p>Found ${pending.days.length} workout days in that data.</p></div>` : ""}
    ${dayBlocks}
    <button class="btn primary" data-action="confirm-review">Add ${multi ? `these ${pending.days.length} days` : "this day"} to my program</button>
  `;
}

function confirmReview() {
  const pending = state.pendingImport;
  let lastDayId = null;
  let addedCount = 0;
  pending.days.forEach((day, di) => {
    const checkbox = document.querySelector(`[data-day-include="${di}"]`);
    if (checkbox && !checkbox.checked) return;
    const nameInput = document.getElementById(`review-day-name-${di}`);
    const name = (nameInput.value || "").trim() || "Workout";
    lastDayId = Store.addDay({ name, source: pending.source, exercises: day.exercises });
    addedCount++;
  });
  state.pendingImport = null;
  if (addedCount === 0) {
    toast("No days selected");
    navigate("import");
    return;
  }
  toast(addedCount === 1 ? "Day added" : `${addedCount} days added`);
  navigate(addedCount === 1 ? "day" : "program", addedCount === 1 ? { dayId: lastDayId } : {});
}

// ---------- DAY screen (list of exercises) ----------

function renderDay() {
  const day = Store.getDay(state.params.dayId);
  if (!day) {
    navigate("program");
    return "";
  }
  const progress = dayProgress(day);
  const items = day.exercises.map((ex, idx) => {
    const filled = ex.weeks.filter((w) => w.updatedAt).length;
    const repText = ex.repGoal && (/rep/i.test(ex.repGoal) ? ex.repGoal : `${ex.repGoal} reps`);
    const target = [repText, ex.restTime && `rest ${ex.restTime}`].filter(Boolean).join(" &middot; ");
    const currentWeekRow = progress && !progress.complete && ex.weeks.find((w) => w.week === progress.currentWeek);
    const doneThisWeek = currentWeekRow && !isWeekEmptyRow(currentWeekRow);
    return `
      ${idx > 0 && ex.superset ? `<div class="superset-link"><span>Superset &mdash; straight into this, no rest</span></div>` : ""}
      <div class="card tappable${ex.superset ? " superset-card" : ""}" data-action="open-exercise" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}">
        <div class="row">
          <div>
            <h3>${doneThisWeek ? `<span class="done-check" aria-label="Logged this week">&#10003;</span> ` : ""}${esc(ex.name)}</h3>
            <p>${target || `${ex.weeks.length} weeks`}${filled ? ` &middot; ${filled} logged` : ""}</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${isManagedClient() ? "" : `
            <button class="btn ghost small" data-action="go-swap-exercise" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}" style="width:auto;padding:4px 8px;font-size:12px;" aria-label="Swap exercise">Swap</button>
            <div class="reorder-btns">
              <button data-action="move-exercise" data-dir="-1" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}" ${idx === 0 ? "disabled" : ""} aria-label="Move up">&#9650;</button>
              <button data-action="move-exercise" data-dir="1" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}" ${idx === day.exercises.length - 1 ? "disabled" : ""} aria-label="Move down">&#9660;</button>
            </div>`}
            <span class="pill">${ex.setLabels.length || 0} sets</span>
          </div>
        </div>
      </div>`;
  }).join("");

  return `
    ${topbar(day.name, { back: true })}
    ${progress ? `
      <div class="row" style="margin-bottom:14px;">
        <span class="source-chip">${progress.complete ? "Program complete" : `Week ${progress.currentWeek} of ${progress.totalWeeks}`}</span>
      </div>
    ` : ""}
    ${items || `<div class="empty"><p>No exercises in this day.</p></div>`}
    ${isManagedClient() ? "" : `
    <button class="btn" data-action="go-add-exercise" data-day="${esc(day.id)}">+ Add exercise</button>
    <div style="height:8px"></div>
    <div class="btn-row">
      <button class="btn" data-action="rename-day" data-day="${esc(day.id)}">Rename day</button>
      <button class="btn danger" data-action="delete-day" data-day="${esc(day.id)}">Delete day</button>
    </div>`}
  `;
}

// ---------- ADD EXERCISE screen (manually create a new exercise) ----------

// Local UI state for the "browse by muscle group" body-map picker -- not
// part of the persisted app state, just a transient overlay on top of the
// add/swap exercise form. Reset whenever that form is freshly opened.
let muscleBrowse = { open: false, view: "front", group: null, prefill: null };

function resetMuscleBrowse() {
  muscleBrowse = { open: false, view: "front", group: null, prefill: null };
}

/** A stylized clickable body silhouette. Each hotspot's data-group matches a MUSCLE_GROUPS entry. */
function bodySilhouetteSvg(view) {
  const isFront = view === "front";
  const torsoGroup = isFront ? "Chest" : "Back";
  const armGroup = isFront ? "Biceps" : "Triceps";
  // Abs only reads sensibly from the front; the back view keeps that same
  // area as plain (non-interactive) torso fill.
  const absBlock = isFront
    ? `<g class="muscle-hotspot" data-action="pick-muscle-group" data-group="Abs">
        <rect x="76" y="170" width="48" height="60" rx="10"/>
        <text x="100" y="204">Abs</text>
      </g>`
    : `<g class="body-base"><rect x="76" y="170" width="48" height="60" rx="10"/></g>`;
  return `
    <svg viewBox="0 0 200 440" role="img" aria-label="Body diagram, ${view} view">
      <g class="body-base">
        <circle cx="100" cy="28" r="20"/>
        <rect x="92" y="44" width="16" height="14"/>
        <ellipse cx="43" cy="215" rx="10" ry="8"/>
        <ellipse cx="157" cy="215" rx="10" ry="8"/>
        <rect x="70" y="225" width="60" height="25"/>
        <ellipse cx="83" cy="428" rx="14" ry="8"/>
        <ellipse cx="117" cy="428" rx="14" ry="8"/>
      </g>
      <g class="muscle-hotspot" data-action="pick-muscle-group" data-group="Shoulders">
        <ellipse cx="62" cy="72" rx="20" ry="16"/>
        <ellipse cx="138" cy="72" rx="20" ry="16"/>
        <text x="100" y="58">Shoulders</text>
      </g>
      <g class="muscle-hotspot" data-action="pick-muscle-group" data-group="${torsoGroup}">
        <rect x="68" y="82" width="64" height="50" rx="14"/>
        <text x="100" y="112">${torsoGroup}</text>
      </g>
      <g class="muscle-hotspot" data-action="pick-muscle-group" data-group="${armGroup}">
        <rect x="38" y="95" width="20" height="55" rx="10"/>
        <rect x="142" y="95" width="20" height="55" rx="10"/>
      </g>
      ${absBlock}
      <g class="muscle-hotspot" data-action="pick-muscle-group" data-group="Forearms">
        <rect x="34" y="150" width="18" height="60" rx="8"/>
        <rect x="148" y="150" width="18" height="60" rx="8"/>
      </g>
      <g class="muscle-hotspot" data-action="pick-muscle-group" data-group="Legs">
        <rect x="72" y="250" width="26" height="95" rx="12"/>
        <rect x="102" y="250" width="26" height="95" rx="12"/>
        <text x="100" y="300">Legs</text>
      </g>
      <g class="muscle-hotspot" data-action="pick-muscle-group" data-group="Calves">
        <rect x="74" y="350" width="22" height="75" rx="10"/>
        <rect x="104" y="350" width="22" height="75" rx="10"/>
        <text x="100" y="392">Calves</text>
      </g>
    </svg>
  `;
}

function renderMuscleBrowse(library) {
  if (muscleBrowse.group) {
    const group = muscleBrowse.group;
    const filtered = library.filter((e) => e.muscleGroup === group);
    const rows = filtered.map((e) => `
      <div class="card tappable" data-action="pick-muscle-exercise" data-name="${esc(e.name)}">
        <h3>${esc(e.name)}</h3>
        <p>${[e.equipment, e.repGoal && `${e.repGoal} reps`].filter(Boolean).join(" &middot; ") || "Tap to use"}</p>
      </div>
    `).join("");
    return `
      ${topbar(group, { back: true, backAction: "muscle-back-to-map" })}
      ${rows || `<div class="empty"><p>No ${esc(group)} exercises in your library yet.</p></div>`}
      <button class="btn ghost" data-action="pick-muscle-exercise-custom">Type a name instead</button>
    `;
  }
  return `
    ${topbar("Browse by muscle", { back: true, backAction: "close-muscle-browse" })}
    <div class="row" style="justify-content:center;gap:8px;margin-bottom:14px;">
      <button class="btn ${muscleBrowse.view === "front" ? "primary" : "ghost"} small" data-action="muscle-view" data-view="front" style="width:auto;">Front</button>
      <button class="btn ${muscleBrowse.view === "back" ? "primary" : "ghost"} small" data-action="muscle-view" data-view="back" style="width:auto;">Back</button>
    </div>
    <div class="body-map">${bodySilhouetteSvg(muscleBrowse.view)}</div>
    <p class="hint" style="text-align:center;margin-top:10px;">Tap a muscle group to see exercises</p>
  `;
}

function renderAddExercise() {
  const day = Store.getDay(state.params.dayId);
  if (!day) {
    navigate("program");
    return "";
  }
  const swapId = state.params.swapExerciseId;
  const isSwap = !!swapId;
  const library = Store.getExerciseLibrary();

  if (muscleBrowse.open) return renderMuscleBrowse(library);

  const prefill = muscleBrowse.prefill;
  muscleBrowse.prefill = null;

  return `
    ${topbar(isSwap ? "Swap exercise" : "Add exercise", { back: true })}
    <button class="btn ghost" data-action="open-muscle-browse" style="margin-bottom:12px;">Browse by muscle group</button>
    <div class="card">
      <label for="new-ex-name">Exercise name *</label>
      <input type="text" id="new-ex-name" list="exercise-library-list" placeholder="e.g. Barbell Squat" autocomplete="off" value="${esc(prefill?.name || "")}" />
      <datalist id="exercise-library-list">
        ${library.map((e) => `<option value="${esc(e.name)}"></option>`).join("")}
      </datalist>
      ${library.length ? `<p class="hint">Start typing to pick from ${library.length} exercise${library.length === 1 ? "" : "s"} you've used before -- it'll fill in reps, rest, and video automatically.</p>` : ""}

      <label for="new-ex-repgoal">Rep goal</label>
      <input type="text" id="new-ex-repgoal" placeholder="e.g. 8-10" value="${esc(prefill?.repGoal || "")}" />

      <label for="new-ex-resttime">Rest time</label>
      <input type="text" id="new-ex-resttime" placeholder="e.g. 90 sec" value="${esc(prefill?.restTime || "")}" />

      <label for="new-ex-sets">Set columns</label>
      <input type="text" id="new-ex-sets" value="Set 1, Set 2, Set 3" placeholder="comma-separated" />
      <p class="hint">These become the editable fields for each week, e.g. "Set 1, Set 2, Set 3" or "WU set, Set 1, Set 2".</p>

      <label for="new-ex-weeks">Number of weeks</label>
      <input type="number" id="new-ex-weeks" value="8" min="1" max="52" />

      <label for="new-ex-video">YouTube video (optional)</label>
      <input type="url" id="new-ex-video" placeholder="https://youtube.com/watch?v=..." value="${esc(prefill?.videoUrl || "")}" />
      <p class="hint">Shown as a how-to video on the exercise screen.</p>
    </div>
    <button class="btn primary" data-action="confirm-add-exercise" data-day="${esc(day.id)}" ${isSwap ? `data-swap="${esc(swapId)}"` : ""}>${isSwap ? "Swap exercise" : "Add exercise"}</button>
  `;
}

function confirmAddExercise(dayId, swapId) {
  const name = document.getElementById("new-ex-name").value.trim();
  if (!name) {
    toast("Give the exercise a name");
    return;
  }
  const repGoal = document.getElementById("new-ex-repgoal").value.trim();
  const restTime = document.getElementById("new-ex-resttime").value.trim();
  const setLabels = document.getElementById("new-ex-sets").value.split(",").map((s) => s.trim()).filter(Boolean);
  const weekCount = parseInt(document.getElementById("new-ex-weeks").value, 10) || 8;
  const videoUrl = document.getElementById("new-ex-video").value.trim();
  if (swapId) {
    const exerciseId = Store.replaceExercise(dayId, swapId, { name, repGoal, restTime, setLabels, weekCount, videoUrl });
    toast("Exercise swapped");
    navigate("exercise", { dayId, exerciseId });
    return;
  }
  const exerciseId = Store.addExercise(dayId, { name, repGoal, restTime, setLabels, weekCount, videoUrl });
  toast("Exercise added");
  navigate("exercise", { dayId, exerciseId });
}

// ---------- EXERCISE screen (week-by-week log) ----------

// Rest timer -- runs independently of render() (a full re-render every second
// would blow away whatever the user is mid-typing in the week/reps fields),
// so it owns a single interval and pokes two DOM nodes directly by id.
let restTimer = { intervalId: null, remaining: 0, total: 0, key: null };

/** "90 sec" -> 90, "2-3 min" -> 150 (average, rounded), "" / unparseable -> null. */
function parseRestSeconds(text) {
  if (!text) return null;
  const nums = (text.match(/[0-9]+(\.[0-9]+)?/g) || []).map(Number);
  if (!nums.length) return null;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  const seconds = /min/i.test(text) ? avg * 60 : avg;
  return Math.max(1, Math.round(seconds));
}

function formatMMSS(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function teardownRestTimer() {
  if (restTimer.intervalId) clearInterval(restTimer.intervalId);
  restTimer = { intervalId: null, remaining: 0, total: 0, key: null };
}

// The timer control repeats in every week card's header (so it's reachable
// without scrolling back up) -- all instances share this one interval/state
// and are updated together by class rather than a single unique id.
function allRestTimerNodes() {
  return {
    displays: document.querySelectorAll(".rest-timer-display"),
    cards: document.querySelectorAll(".rest-timer-card"),
    btns: document.querySelectorAll(".rest-timer-btn"),
  };
}

function restTimerTick() {
  restTimer.remaining -= 1;
  if (restTimer.remaining <= 0) {
    clearInterval(restTimer.intervalId);
    restTimer.intervalId = null;
    restTimer.remaining = 0;
    // leave restTimer.key/total set so render() (which toast() below triggers)
    // renders this as "just finished" (0:00, flash) rather than a fresh full-duration card
    if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
    toast("Rest's up!");
    return;
  }
  const { displays } = allRestTimerNodes();
  displays.forEach((el) => { el.textContent = formatMMSS(restTimer.remaining); });
}

function toggleRestTimer(key, seconds) {
  const { displays, cards, btns } = allRestTimerNodes();
  if (restTimer.intervalId && restTimer.key === key) {
    // already running for this exercise -- cancel
    teardownRestTimer();
    displays.forEach((el) => { el.textContent = formatMMSS(seconds); });
    btns.forEach((el) => { el.innerHTML = "&#9654;"; el.setAttribute("aria-label", "Start rest timer"); });
    cards.forEach((el) => el.classList.remove("rest-timer-done"));
    return;
  }
  teardownRestTimer();
  restTimer = { intervalId: null, remaining: seconds, total: seconds, key };
  cards.forEach((el) => el.classList.remove("rest-timer-done"));
  btns.forEach((el) => { el.innerHTML = "&#9632;"; el.setAttribute("aria-label", "Cancel rest timer"); });
  displays.forEach((el) => { el.textContent = formatMMSS(seconds); });
  restTimer.intervalId = setInterval(restTimerTick, 1000);
}

function renderExercise() {
  const { dayId, exerciseId } = state.params;
  const day = Store.getDay(dayId);
  const ex = day?.exercises.find((e) => e.id === exerciseId);
  if (!day || !ex) {
    navigate("program");
    return "";
  }
  const exIndex = day.exercises.findIndex((e) => e.id === exerciseId);
  const supersetPartner = ex.superset && exIndex > 0 ? day.exercises[exIndex - 1].name : "";
  const weeksSorted = [...ex.weeks].sort((a, b) => a.week - b.week);
  const isWeekEmpty = (w) => w.values.every((v) => !v) && (w.reps || []).every((v) => !v) && !w.notes;
  const currentWeek = weeksSorted.find((w) => !w.updatedAt && isWeekEmpty(w));

  const restKey = `${dayId}:${exerciseId}`;
  const restSeconds = parseRestSeconds(ex.restTime);
  const timerRunning = restTimer.intervalId && restTimer.key === restKey;
  const timerFinished = !restTimer.intervalId && restTimer.key === restKey && restTimer.total > 0 && restTimer.remaining === 0;
  const timerDisplaySeconds = timerRunning ? restTimer.remaining : (timerFinished ? 0 : (restSeconds || 0));
  const restTimerInline = restSeconds ? `
    <div class="rest-timer-inline rest-timer-card${timerFinished ? " rest-timer-done" : ""}">
      <span class="rest-timer-display">${formatMMSS(timerDisplaySeconds)}</span>
      <button class="rest-timer-btn" data-action="toggle-rest-timer" data-key="${esc(restKey)}" data-seconds="${restSeconds}" aria-label="${timerRunning ? "Cancel rest timer" : "Start rest timer"}">${timerRunning ? "&#9632;" : "&#9654;"}</button>
    </div>
  ` : "";

  // Nearest earlier week (by position, not just the row right before) that
  // actually has a value for this set column -- lets a skipped week fall
  // back further instead of just showing the blank "lb"/"reps" hint.
  const lastLoggedBefore = (idx, i, key) => {
    for (let j = idx - 1; j >= 0; j--) {
      const v = (weeksSorted[j][key] || [])[i];
      if (v) return v;
    }
    return "";
  };

  const weekCards = weeksSorted.map((w, idx) => {
    const isCurrent = currentWeek && w.week === currentWeek.week;
    const fields = ex.setLabels.map((label, i) => {
      const prevValue = lastLoggedBefore(idx, i, "values");
      const prevReps = lastLoggedBefore(idx, i, "reps");
      return `
      <div class="field">
        <label>${esc(label)}</label>
        <input type="text" inputmode="decimal" placeholder="${esc(prevValue || "lb")}" value="${esc(w.values[i] || "")}" data-week="${w.week}" data-idx="${i}" data-kind="value" />
        <input type="text" inputmode="numeric" placeholder="${esc(prevReps || "reps")}" value="${esc((w.reps || [])[i] || "")}" data-week="${w.week}" data-idx="${i}" data-kind="reps" />
      </div>
    `;
    }).join("");
    return `
      <div class="card${isCurrent ? " current-week" : ""}">
        <div class="row">
          <h3>Week ${w.week}${isCurrent ? ' <span class="pill">Next</span>' : ""}</h3>
          ${restTimerInline}
        </div>
        ${w.updatedAt ? `<p class="hint" style="margin:-6px 0 10px;">updated ${relativeTime(w.updatedAt)}</p>` : ""}
        <div class="week-fields">${fields}</div>
        <label>Notes</label>
        <input type="text" value="${esc(w.notes || "")}" data-week="${w.week}" data-kind="notes" />
      </div>
    `;
  }).join("");

  const findOnYoutube = `<a class="btn ghost small" href="${youtubeSearchUrl(ex.name)}" target="_blank" rel="noopener noreferrer" style="width:auto;padding:6px 10px;text-decoration:none;" aria-label="Find &quot;${esc(ex.name)}&quot; on YouTube">&#9654;</a>`;
  return `
    ${topbar(ex.name, { back: true, right: findOnYoutube })}
    <div class="row" style="margin-bottom:10px;flex-wrap:wrap;gap:8px;">
      ${ex.repGoal ? `<span class="source-chip">Reps: ${esc(ex.repGoal)}</span>` : ""}
      ${ex.restTime ? `<span class="source-chip">Rest: ${esc(ex.restTime)}</span>` : ""}
      ${ex.videoUrl ? `<a class="source-chip" href="${esc(ex.videoUrl)}" target="_blank" rel="noopener noreferrer">&#9654; Video</a>` : ""}
    </div>
    ${renderVideoEmbed(ex.videoUrl)}
    ${ex.superset && supersetPartner ? `<div class="card" style="border-color:var(--accent);"><h3 style="margin:0;font-size:15px;">Superset</h3><p style="margin:5px 0 0;">Straight into this from <strong>${esc(supersetPartner)}</strong> &mdash; no rest between the two. Rest after this one.</p></div>` : ""}
    ${ex.setupNote ? `<div class="card"><p>${esc(ex.setupNote)}</p></div>` : ""}
    <p class="hint" style="margin:2px 0 10px;">Grayed-out numbers show what you logged last time -- type over them to log this week.</p>
    ${weekCards}
    ${isManagedClient() ? "" : `
    <button class="btn" data-action="add-week" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}">+ Add week</button>
    <div style="height:8px"></div>
    <div class="btn-row">
      <button class="btn" data-action="rename-exercise" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}">Rename</button>
      <button class="btn" data-action="set-exercise-video" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}">${ex.videoUrl ? "Edit video" : "Add video"}</button>
      <button class="btn danger" data-action="delete-exercise" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}">Delete</button>
    </div>
    <div style="height:8px"></div>`}
    <a class="btn ghost" href="${youtubeSearchUrl(ex.name)}" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;text-decoration:none;">Find "${esc(ex.name)}" on YouTube</a>
  `;
}

function youtubeSearchUrl(query) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${query} exercise how to`)}`;
}

function renderVideoEmbed(videoUrl) {
  if (!videoUrl) return "";
  const videoId = youtubeVideoId(videoUrl);
  if (videoId) {
    return `
      <div class="video-embed">
        <iframe src="https://www.youtube.com/embed/${videoId}" title="Exercise how-to video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
      </div>
    `;
  }
  return `<div class="card"><a href="${esc(videoUrl)}" target="_blank" rel="noopener noreferrer">&#9654; Watch how-to video</a></div>`;
}

// ---------- HISTORY screen ----------

function renderHistory() {
  const entries = Store.getRecentEntries();
  if (!entries.length) {
    return `${topbar("History")}<div class="empty"><h2>Nothing logged yet</h2><p>Fill in a set weight on any exercise and it'll show up here.</p></div>`;
  }
  const items = entries.map((e) => {
    const summary = e.values.map((v, i) => {
      const reps = (e.reps || [])[i];
      if (!v && !reps) return null;
      return `${esc(e.setLabels[i])}: ${esc(v || "—")}${reps ? ` x ${esc(reps)}` : ""}`;
    }).filter(Boolean).join(", ");
    return `
      <div class="card tappable" data-action="open-exercise" data-day="${esc(e.dayId)}" data-exercise="${esc(e.exerciseId)}">
        <div class="log-head"><span>${esc(e.exerciseName)} &middot; Week ${e.week}</span><span>${relativeTime(e.updatedAt)}</span></div>
        <div class="log-ex">${summary || (e.notes ? esc(e.notes) : "No values")}</div>
        <p>${esc(e.dayName)}</p>
      </div>
    `;
  }).join("");
  return `${topbar("History")}${items}`;
}

// ---------- SETTINGS screen ----------

function renderSettings() {
  const settings = Store.getSettings();
  const program = Store.getProgram();
  const days = program?.days || [];
  const programs = Store.listPrograms();
  const isCoachDevice = !getLocalClientId();
  const canPublish = isCoachDevice && isSyncConfigured();
  const programRows = programs.map((p) => `
    <div class="row">
      <div>
        <h3 style="font-size:14px;">${esc(p.name)}${p.active ? ' <span class="pill">Active</span>' : ""}</h3>
        <p>${p.dayCount} day${p.dayCount === 1 ? "" : "s"}${p.importedAt ? ` &middot; Updated ${relativeTime(p.importedAt)}` : ""}${p.publishedId ? " &middot; Published for clients" : ""}</p>
      </div>
      <div class="btn-row" style="width:auto;gap:6px;flex-wrap:wrap;">
        ${p.active ? "" : `<button class="btn small" data-action="switch-program-btn" data-program="${esc(p.id)}">Switch to</button>`}
        <button class="btn small" data-action="rename-program" data-program="${esc(p.id)}">Rename</button>
        ${canPublish ? (
          p.publishedId
            ? `<button class="btn small primary" data-action="publish-program" data-program="${esc(p.id)}">Update for clients</button>
               <button class="btn small" data-action="unpublish-program" data-program="${esc(p.id)}" data-published="${esc(p.publishedId)}">Unpublish</button>`
            : `<button class="btn small" data-action="publish-program" data-program="${esc(p.id)}">Publish for clients</button>`
        ) : ""}
        ${programs.length > 1 ? `<button class="btn small danger" data-action="delete-program" data-program="${esc(p.id)}">Delete</button>` : ""}
      </div>
    </div>
  `).join("");
  const dayRows = days.map((d) => `
    <div class="row">
      <div>
        <h3 style="font-size:14px;">${esc(d.name)}</h3>
        <p>${d.exercises.length} exercises${d.source?.type === "sheet" ? " &middot; from Google Sheet" : ""}</p>
      </div>
      <div class="btn-row" style="width:auto;gap:6px;">
        <button class="btn small" data-action="rename-day" data-day="${esc(d.id)}">Rename</button>
        ${d.source?.type === "sheet" ? `<button class="btn small" data-action="refresh-day" data-day="${esc(d.id)}">Refresh</button>` : ""}
        <button class="btn small danger" data-action="delete-day" data-day="${esc(d.id)}">Delete</button>
      </div>
    </div>
  `).join("");

  return `
    ${topbar("Settings")}
    <div class="card">
      <h3>Units</h3>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn ${settings.units === "lb" ? "primary" : ""}" data-action="set-units" data-units="lb">lb</button>
        <button class="btn ${settings.units === "kg" ? "primary" : ""}" data-action="set-units" data-units="kg">kg</button>
      </div>
    </div>
    <div class="card">
      <h3>Appearance</h3>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn ${getTheme() === "auto" ? "primary" : ""}" data-action="set-theme" data-theme="auto">Auto</button>
        <button class="btn ${getTheme() === "light" ? "primary" : ""}" data-action="set-theme" data-theme="light">Light</button>
        <button class="btn ${getTheme() === "dark" ? "primary" : ""}" data-action="set-theme" data-theme="dark">Dark</button>
      </div>
      <p class="hint" style="margin-top:8px;">"Auto" follows your phone's system setting -- handy in bright gym lighting.</p>
    </div>
    ${isManagedClient() ? `
    <div class="card">
      <h3>Your program</h3>
      <p>${esc(programs.find((p) => p.active)?.name || "Your program")} &mdash; built for you by your coach.</p>
      <p class="hint">If they change it, tap below to pull the new version down. Everything you've already logged stays exactly where it is.</p>
      <div style="height:10px"></div>
      <button class="btn" data-action="refresh-managed-program">Refresh my program</button>
    </div>` : `
    <div class="card">
      <h3>Saved programs</h3>
      ${programs.length > 1 ? `<p class="hint">Switch between these any time, or tap Delete to remove one you no longer need (never the last one).</p>` : ""}
      ${programRows || "<p>None yet.</p>"}
    </div>`}
    ${isManagedClient() ? "" : `
    <div class="card">
      <h3>Workout days</h3>
      <p class="hint">Days in the currently active program (${esc(programs.find((p) => p.active)?.name || "My Program")}).</p>
      ${dayRows || "<p>None imported yet.</p>"}
      <div style="height:10px"></div>
      <button class="btn" data-action="go-import">Import another day</button>
    </div>
    <div class="card">
      <h3>Program templates</h3>
      <p>Swap this device's whole program for a different prebuilt one (e.g. give a client a leg-focused plan instead of the default).</p>
      <div style="height:10px"></div>
      <button class="btn" data-action="go-templates">Browse templates</button>
    </div>`}
    <div class="card">
      <h3>Exercise library</h3>
      <p>Search or browse by body part (chest, back, legs, calves, biceps, triceps, shoulders, abs, forearms) -- ${Store.getExerciseLibrary().length} exercises so far. Used to autofill the Add/Swap exercise form.</p>
      <div style="height:10px"></div>
      <button class="btn" data-action="go-exercise-library">Browse library</button>
    </div>
    ${renderSyncSettingsCard()}
    <div class="card">
      <h3>Reset</h3>
      <p>Clears every saved program, every logged value, and your cardio &amp; steps calendar from this device.${isManagedClient() ? " Your coach's program will download again next time you open the app, but the numbers you logged against it are gone for good." : ""}</p>
      <div style="height:10px"></div>
      <button class="btn danger" data-action="reset-all">Erase all data</button>
    </div>
  `;
}

function renderSyncSettingsCard() {
  if (!isSyncConfigured()) {
    return `
      <div class="card">
        <h3>Coach sync</h3>
        <p>Not set up yet.</p>
      </div>
    `;
  }
  const clientId = getLocalClientId();
  const clientCards = clientId ? `
      <div class="card">
        <h3>Coach sync</h3>
        <p>This device is sharing its logged workouts with a coach.</p>
        <label for="client-name">Your name (shown to your coach)</label>
        <input type="text" id="client-name" value="${esc(getClientName())}" placeholder="e.g. Alex" />
        <div style="height:10px"></div>
        <button class="btn small" data-action="save-client-name">Save name</button>
      </div>
      <div class="card">
        <h3>Contact your coach</h3>
        <p>Question about your program, or a payment? Reach out directly.</p>
        <div style="height:10px"></div>
        ${contactCoachButtons()}
      </div>` : "";
  // Nothing at all for a device that is neither -- no dashboard and no hint
  // that one exists.
  const coachCard = isCoachDevice() ? `
    <div class="card">
      <h3>Coach dashboard</h3>
      <p>Generate links for clients and watch their logged workouts live.</p>
      ${clientId ? `<p class="hint">This device is also opened on a client link. That's fine — the dashboard is still yours.</p>` : ""}
      <div style="height:10px"></div>
      <button class="btn" data-action="go-coach">Open coach dashboard</button>
    </div>` : "";
  return clientCards + coachCard;
}

// ---------- PIN gate in front of the dashboard ----------

function renderCoachPin() {
  return `
    ${topbar("Locked", { back: true })}
    <div class="card">
      <h3>Enter your PIN</h3>
      <p class="hint" style="margin-top:2px;">Keeps the dashboard shut if someone picks up your phone.</p>
      <div style="height:10px"></div>
      <label for="coach-pin-input">PIN</label>
      <input type="password" id="coach-pin-input" inputmode="numeric" autocomplete="off" placeholder="••••" />
      <div style="height:10px"></div>
      <button class="btn primary" data-action="submit-coach-pin">Unlock</button>
    </div>
  `;
}

async function submitCoachPin() {
  const value = document.getElementById("coach-pin-input").value.trim();
  if (!value) { toast("Enter your PIN"); return; }
  const hash = await hashPin(value);
  if (hash !== localStorage.getItem(LOCAL_KEYS.coachPin)) {
    toast("That PIN doesn't match");
    return;
  }
  markCoachPinSatisfied();
  navigate("coach");
}

async function setCoachPin() {
  const value = (prompt("Choose a PIN (4-8 digits). Leave blank to cancel.") || "").trim();
  if (!value) return;
  if (!/^\d{4,8}$/.test(value)) { toast("Use 4 to 8 digits"); return; }
  const again = (prompt("Enter it once more") || "").trim();
  if (again !== value) { toast("Those didn't match — nothing changed"); return; }
  localStorage.setItem(LOCAL_KEYS.coachPin, await hashPin(value));
  markCoachPinSatisfied();
  toast("PIN set");
  render();
}

function clearCoachPin() {
  if (!confirm("Remove the PIN? The dashboard will open without one on this device.")) return;
  localStorage.removeItem(LOCAL_KEYS.coachPin);
  localStorage.removeItem(LOCAL_KEYS.coachPinOkUntil);
  toast("PIN removed");
  render();
}

/** Shown inside the dashboard: the link that grants coach access on another
 * device, and the PIN controls. The link doubles as the only backup of the
 * coach id -- without it, clearing this browser loses the roster for good. */
function renderCoachAccessCard() {
  const link = coachAccessLink();
  return `
    <div class="card">
      <h3>Coach access</h3>
      <p>This link is what makes a device yours. Open it on a new phone or laptop and the dashboard appears there; anyone without it just sees the normal app.</p>
      <p class="hint"><strong>Save it somewhere you won't lose it.</strong> Your client roster lives against this link — if you clear this browser and don't have it, the roster can't be recovered. Never send it to a client.</p>
      <div style="height:10px"></div>
      <input type="text" id="coach-access-link" value="${esc(link)}" readonly onclick="this.select()" />
      <div style="height:10px"></div>
      <button class="btn primary" data-action="copy-coach-access-link" data-link="${esc(link)}">Copy my coach link</button>
      <div style="height:14px"></div>
      <h3 style="font-size:15px;">PIN</h3>
      <p class="hint" style="margin-top:2px;">${coachPinIsSet()
        ? "A PIN is set. You'll be asked for it when you open the dashboard."
        : "No PIN. Anyone holding this unlocked phone can open the dashboard."}</p>
      <div style="height:10px"></div>
      <div class="btn-row">
        <button class="btn small" data-action="set-coach-pin">${coachPinIsSet() ? "Change PIN" : "Set a PIN"}</button>
        ${coachPinIsSet() ? `<button class="btn small danger" data-action="clear-coach-pin">Remove PIN</button>` : ""}
      </div>
      <div style="height:14px"></div>
      <h3 style="font-size:15px;">Connection check</h3>
      <p class="hint" style="margin-top:2px;">If generating a link fails, run this. It writes a throwaway record to each place a new client needs one and says exactly which step is unhappy.</p>
      <div style="height:10px"></div>
      <button class="btn small" data-action="run-sync-diagnostics">Run connection check</button>
      <div id="diag-output"></div>
    </div>
  `;
}

async function runDiagnostics() {
  const out = document.getElementById("diag-output");
  if (out) out.innerHTML = `<p class="hint" style="margin-top:10px;">Checking…</p>`;
  const results = await runSyncDiagnostics(getOrCreateCoachId());
  const rows = results.map((r) => `
    <div class="row" style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px;">
      <div style="min-width:0;">
        <h3 style="font-size:14px;margin:0;">${r.ok ? "&#10003;" : "&#10005;"} ${esc(r.step)}</h3>
        <p style="margin:2px 0 0;${r.ok ? "" : "color:var(--danger);"}">${esc(r.detail)}</p>
      </div>
    </div>`).join("");
  const firstFail = results.find((r) => !r.ok);
  const verdict = firstFail
    ? `<p style="margin-top:10px;color:var(--danger);"><strong>${esc(firstFail.step)}</strong> is the problem. Send this screen to whoever set the app up.</p>`
    : `<p class="hint" style="margin-top:10px;">Everything passed — Firebase is reachable and accepting writes.</p>`;
  if (out) out.innerHTML = rows + verdict;
}

// ---------- TEMPLATES screen (load a whole prebuilt program) ----------

function renderTemplates() {
  const canPublish = !getLocalClientId() && isSyncConfigured();
  const rows = PROGRAM_TEMPLATES.map((t) => `
    <div class="card">
      <h3>${esc(t.name)}</h3>
      <p>${esc(t.description)}</p>
      <div style="height:10px"></div>
      <div class="btn-row">
        <button class="btn primary" data-action="add-template" data-template="${esc(t.id)}">Save as new program</button>
        <button class="btn ghost" data-action="load-template" data-template="${esc(t.id)}">Replace current</button>
      </div>
      <div style="height:8px"></div>
      <div class="btn-row">
        ${canPublish ? `<button class="btn small" data-action="copy-template-for-client" data-template="${esc(t.id)}">Copy, rename &amp; assign to a client</button>` : ""}
        <button class="btn small" data-action="copy-template-link" data-template="${esc(t.id)}">Copy link for a new client</button>
      </div>
    </div>
  `).join("");

  return `
    ${topbar("Program templates", { back: true })}
    <div class="card">
      <h3>Build one from scratch</h3>
      <p>Start a brand-new, empty program and build it day by day, picking exercises from the library (search or the body-part diagram) as you go.</p>
      <div style="height:10px"></div>
      <button class="btn primary" data-action="create-blank-program">+ Create new program</button>
    </div>
    <div class="card">
      <p><strong>Save as new program</strong> saves this template as a separate program on this device and switches to it. Nothing on the old program is touched — switch back to it any time from the dropdown at the top of the Program tab (once you have more than one saved).</p>
      <p><strong>Replace current</strong> erases the currently active program and every logged week in it, then loads the template in its place. Any other saved programs on this device are untouched.</p>
      ${canPublish ? `<p><strong>Copy, rename &amp; assign to a client</strong> makes your own editable copy under whatever name you give it, publishes it privately (not as a public template), and takes you straight to Add Client with it pre-selected.</p>` : ""}
      <p><strong>Copy link for a new client</strong> gives you a link that seeds this template automatically the first time someone opens it — only useful for a device that hasn't opened the app before.</p>
    </div>
    ${rows}
  `;
}

function createBlankProgram() {
  const name = prompt("Name your new program", "New Program");
  if (!name || !name.trim()) return;
  Store.createProgram(name.trim(), []);
  toast(`"${name.trim()}" created — add your first day`);
  navigate("import");
}

function addTemplate(id) {
  const template = PROGRAM_TEMPLATES.find((t) => t.id === id);
  if (!template) return;
  const days = parseWorkoutSheets(template.sheetText);
  Store.createProgram(template.name, days);
  toast(`Saved "${template.name}" as a new program — switch between programs from the Program tab`);
  navigate("program");
}

function loadTemplate(id) {
  const template = PROGRAM_TEMPLATES.find((t) => t.id === id);
  if (!template) return;
  if (!confirm(`Replace this device's current program with "${template.name}"? This erases the current program and any logged weeks here — it can't be undone.`)) {
    return;
  }
  const days = parseWorkoutSheets(template.sheetText);
  Store.clearProgram();
  days.forEach((day) => Store.addDay({ name: day.dayTitle || "Workout", source: null, exercises: day.exercises }));
  toast(`Loaded "${template.name}"`);
  navigate("program");
}

/** Copies a built-in template into a new saved program under a name the
 * coach picks on the spot, then publishes it so it's immediately assignable
 * to a client. Used both from the Program templates screen and inline from
 * Add Client. Returns { localId, publishedId, name }, or null if the coach
 * canceled the rename prompt (no side effects in that case) or the
 * template's id didn't match anything. publishedId is null if the copy was
 * made but publishing failed/timed out -- the caller decides what to do.
 */
async function copyTemplateAndPublish(templateId, onPending) {
  const template = PROGRAM_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return null;
  const name = prompt("Name this program", template.name);
  if (!name || !name.trim()) return null;
  const trimmedName = name.trim();
  const days = parseWorkoutSheets(template.sheetText);
  const localId = Store.createProgram(trimmedName, days);
  const publishedId = newId();
  // toast() forces a full re-render, which would blow away an in-progress
  // form the caller might be mid-filling-out (see confirmAddCoachClient) --
  // let the caller decide how to show "working on it" instead of assuming.
  if (onPending) onPending();
  else toast("Publishing…");
  try {
    await Promise.race([
      publishCustomProgram(getOrCreateCoachId(), publishedId, trimmedName, blankDaysForPublish(Store.getProgramDaysById(localId))),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
    ]);
    Store.setProgramPublishedId(localId, publishedId);
    return { localId, publishedId, name: trimmedName };
  } catch (e) {
    toast(e?.message === "timeout" ? "Taking a while — check your connection and try again" : "Couldn't publish — check your connection and try again");
    return { localId, publishedId: null, name: trimmedName };
  }
}

async function copyTemplateForClient(id) {
  const result = await copyTemplateAndPublish(id);
  if (!result) return;
  if (!result.publishedId) return; // couldn't publish -- stay put so they can retry from Settings
  toast(`"${result.name}" is ready — pick your client`);
  navigate("coach-add-client", { preselectProgram: `custom:${result.publishedId}` });
}

function copyTemplateLink(id) {
  const template = PROGRAM_TEMPLATES.find((t) => t.id === id);
  if (!template) return;
  const params = new URLSearchParams();
  if (id !== "default") params.set("template", id);
  const qs = params.toString();
  const link = `${window.location.origin}${window.location.pathname}${qs ? `?${qs}` : ""}`;
  navigator.clipboard.writeText(link)
    .then(() => toast("Link copied"))
    .catch(() => toast(`Couldn't copy — copy manually: ${link}`));
}

// ---------- EXERCISE LIBRARY screen (search + browse by body part) ----------

function filterLibraryEntries(all, query, group) {
  const q = query.trim().toLowerCase();
  return all.filter((e) => {
    if (q && !e.name.toLowerCase().includes(q)) return false;
    if (group === "All") return true;
    if (group === "Other") return !e.muscleGroup;
    return e.muscleGroup === group;
  });
}

function renderLibraryRows(filtered) {
  return filtered.map((e) => `
    <div class="card">
      <div class="row" style="align-items:flex-start;">
        <div>
          <h3 style="font-size:15px;">${esc(e.name)}</h3>
          <p>${[e.muscleGroup, e.equipment].filter(Boolean).join(" &middot; ") || "From your program"}${e.repGoal ? ` &middot; ${esc(e.repGoal)} reps` : ""}${e.restTime ? ` &middot; rest ${esc(e.restTime)}` : ""}</p>
        </div>
        <a class="btn ghost small" href="${youtubeSearchUrl(e.name)}" target="_blank" rel="noopener noreferrer" style="width:auto;text-decoration:none;white-space:nowrap;">Video</a>
      </div>
    </div>
  `).join("") || `<div class="empty"><p>No matches.</p></div>`;
}

function renderExerciseLibrary() {
  const { query, group } = state.libraryFilter;
  const all = Store.getExerciseLibrary();
  const filtered = filterLibraryEntries(all, query, group);

  const groupChips = ["All", ...MUSCLE_GROUPS, "Other"].map((g) => `
    <button class="btn ${group === g ? "primary" : "ghost"} small" data-action="filter-library-group" data-group="${esc(g)}" style="width:auto;">${esc(g)}</button>
  `).join("");

  return `
    ${topbar("Exercise Library", { back: true })}
    <div class="card">
      <label for="library-search">Search</label>
      <input type="text" id="library-search" value="${esc(query)}" placeholder="e.g. squat, curl, press..." />
    </div>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:14px;">${groupChips}</div>
    <p class="hint" id="library-count" style="margin-bottom:10px;">${filtered.length} exercise${filtered.length === 1 ? "" : "s"}${group !== "All" ? ` in ${esc(group)}` : ""}</p>
    <div id="library-results">${renderLibraryRows(filtered)}</div>
  `;
}

// ---------- COACH screens (view clients' synced data, read-only) ----------

function renderCoach() {
  const rows = coachRosterData.map((c) => {
    const priced = c.priceCents > 0;
    const paid = c.paid;
    return `
    <div class="card">
      <div class="row tappable" data-action="open-coach-client" data-client="${esc(c.id)}" data-label="${esc(c.label)}">
        <div>
          <h3>${esc(c.label)}</h3>
          <p>${c.addedAt ? `Added ${relativeTime(firestoreTimeToIso(c.addedAt))}` : "Just added"}${priced ? ` &middot; $${(c.priceCents / 100).toFixed(2)}` : ""}</p>
        </div>
        ${priced ? `<span class="pill" style="${paid ? "" : "color:var(--warn);border-color:var(--warn);background:color-mix(in srgb, var(--warn) 12%, transparent);"}">${paid ? "Paid" : "Awaiting payment"}</span>` : ""}
      </div>
      <div class="btn-row" style="margin-top:10px;">
        ${priced && !paid ? `<button class="btn small primary" data-action="mark-client-paid" data-client="${esc(c.id)}" data-label="${esc(c.label)}">Mark as paid</button>` : ""}
        <button class="btn ghost small" data-action="copy-existing-client-link" data-client="${esc(c.id)}" data-price="${c.priceCents || 0}">Copy link</button>
        <button class="btn ghost small" data-action="remove-coach-client" data-client="${esc(c.id)}" data-label="${esc(c.label)}">Remove</button>
      </div>
    </div>
  `;
  }).join("");

  return `
    ${topbar("Coach dashboard", { back: true })}
    <button class="btn primary" data-action="go-coach-add-client">+ Add client</button>
    <div style="height:10px"></div>
    <button class="btn" data-action="relink-client">Re-add a client from their link</button>
    <div style="height:14px"></div>
    ${renderCoachAccessCard()}
    <div style="height:12px"></div>
    ${rows || `<div class="empty"><p>No clients yet. Add one to get a link you can send them.</p></div>`}
  `;
}

/** Strips logged data from a copy of a saved program's days before publishing
 * it -- a new client should start with a blank slate, not the coach's own
 * test weights/notes. Structure (exercises, rep goals, set columns, week
 * count) is kept as-is. */
/** The coach's program as published for clients: the structure, with every
 * logged number stripped out. Ids are carried through deliberately -- a
 * managed client merges an update onto their own copy by id (see
 * Store.syncManagedProgram), so without them a coach renaming a day would
 * orphan everything the client had logged under it. */
function blankDaysForPublish(days) {
  return days.map((day) => ({
    id: day.id,
    name: day.name,
    type: day.type || "strength",
    exercises: day.exercises.map((ex) => ({
      id: ex.id,
      name: ex.name,
      repGoal: ex.repGoal,
      restTime: ex.restTime,
      setupNote: ex.setupNote,
      videoUrl: ex.videoUrl,
      superset: !!ex.superset,
      setLabels: ex.setLabels,
      weeks: ex.weeks.map((w) => ({ week: w.week, values: ex.setLabels.map(() => ""), reps: ex.setLabels.map(() => ""), notes: "" })),
    })),
  }));
}

async function publishSavedProgram(programId) {
  const days = Store.getProgramDaysById(programId);
  const meta = Store.listPrograms().find((p) => p.id === programId);
  if (!days || !meta) return;
  const publishedId = meta.publishedId || newId();
  toast("Publishing…");
  try {
    // Firestore writes queue locally and don't reject on a dead network --
    // they can hang indefinitely instead of failing (learned the hard way
    // building the sync-status indicator). A timeout here means a flaky
    // connection gives up with a clear message instead of a silent hang;
    // the write is safe to retry since it's a plain overwrite (same id).
    await Promise.race([
      publishCustomProgram(getOrCreateCoachId(), publishedId, meta.name, blankDaysForPublish(days)),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
    ]);
    Store.setProgramPublishedId(programId, publishedId);
    toast(`"${meta.name}" is now available when adding a client`);
    render();
  } catch (e) {
    toast(firebaseWriteMessage(e, "publish that program"));
  }
}

async function unpublishSavedProgram(programId, publishedId) {
  try {
    await unpublishCustomProgram(publishedId);
  } catch {
    // even if the delete fails (e.g. offline), still forget it locally --
    // worst case a stale doc lingers in Firestore, unreachable without its id
  }
  Store.setProgramPublishedId(programId, null);
  toast("Unpublished");
  render();
}

/** Shared <optgroup> markup for a "which program" <select>: built-in
 * templates, the coach's own published programs, and (if sync is set up) a
 * "copy & customize" option per template. Used by both Add Client and
 * Assign Program (existing client). */
function programPickerOptgroups(preselect, copyLabel, includeCopy = true) {
  const builtInOptions = PROGRAM_TEMPLATES.map((t) => `<option value="${esc(t.id)}" ${preselect === t.id ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  const myPrograms = Store.listPrograms().filter((p) => p.publishedId);
  const myOptions = myPrograms.map((p) => `<option value="custom:${esc(p.publishedId)}" ${preselect === `custom:${p.publishedId}` ? "selected" : ""}>${esc(p.name)}</option>`).join("");
  const copyOptions = includeCopy && isSyncConfigured() ? PROGRAM_TEMPLATES.map((t) => `<option value="copy:${esc(t.id)}">Copy "${esc(t.name)}"...</option>`).join("") : "";
  return `
    ${myOptions ? `<optgroup label="My programs">${myOptions}</optgroup>` : ""}
    <optgroup label="Built-in templates">${builtInOptions}</optgroup>
    ${copyOptions ? `<optgroup label="${esc(copyLabel || "Copy & customize")}">${copyOptions}</optgroup>` : ""}
  `;
}

/** Resolves a program-picker <select>'s value into { templateId, customProgramId, programName },
 * or null if the coach canceled a "copy:" rename prompt, or { failed: true, name } if the
 * copy was made but couldn't be published. `onPending` lets the caller show its own
 * non-rendering "working on it" feedback for the copy case (see copyTemplateAndPublish). */
async function resolveProgramSelection(selected, onPending) {
  if (selected.startsWith("copy:")) {
    const result = await copyTemplateAndPublish(selected.slice("copy:".length), onPending);
    if (!result) return null; // canceled the rename prompt
    if (!result.publishedId) return { failed: true, name: result.name };
    return { templateId: null, customProgramId: result.publishedId, programName: result.name };
  }
  if (selected.startsWith("custom:")) {
    const customProgramId = selected.slice("custom:".length);
    const programName = Store.listPrograms().find((p) => p.publishedId === customProgramId)?.name;
    return { templateId: null, customProgramId, programName };
  }
  return { templateId: selected, customProgramId: null, programName: PROGRAM_TEMPLATES.find((t) => t.id === selected)?.name };
}

// ---------- Inline "build their program" draft (Add Client screen) ----------

// Held in memory only: a program the coach is assembling for one specific
// client, before the client even exists. It becomes a published custom
// program the moment they generate the link, and is thrown away if they
// navigate off without doing so.
let clientProgramDraft = null;
// Which day currently has its "add exercise" form open, so the form doesn't
// have to be repeated under every day at once.
let draftAddingToDayId = null;

function draftUid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function resetClientProgramDraft() {
  clientProgramDraft = { label: "", price: "", programName: "", weeks: 8, days: [] };
  draftAddingToDayId = null;
}

function ensureClientProgramDraft() {
  if (!clientProgramDraft) resetClientProgramDraft();
  return clientProgramDraft;
}

/** The draft as real program days: week rows expanded to the chosen count,
 * blank, and one set label per set. Shape matches blankDaysForPublish's. */
function draftToDays() {
  const draft = ensureClientProgramDraft();
  const weekCount = Math.max(1, Math.min(52, parseInt(draft.weeks, 10) || 8));
  return draft.days.map((day) => ({
    id: day.id,
    name: day.name.trim() || "Workout",
    type: day.type || "strength",
    exercises: day.exercises.map((ex) => {
      const sets = Math.max(1, Math.min(12, parseInt(ex.sets, 10) || 3));
      const setLabels = Array.from({ length: sets }, (_, i) => `Set ${i + 1}`);
      return {
        id: ex.id,
        name: ex.name.trim(),
        repGoal: ex.repGoal.trim(),
        restTime: ex.restTime.trim(),
        setupNote: "",
        videoUrl: "",
        superset: !!ex.superset,
        setLabels,
        weeks: Array.from({ length: weekCount }, (_, i) => ({
          week: i + 1,
          values: setLabels.map(() => ""),
          reps: setLabels.map(() => ""),
          notes: "",
        })),
      };
    }),
  }));
}

/** Turns a real program's days into the draft's lighter shape, so a coach can
 * start from one of their programs and edit it rather than retyping it. The
 * per-exercise week rows collapse into one week count for the whole program,
 * which is how a coach thinks about it anyway. */
function draftFromProgramDays(days) {
  let weeks = 0;
  const draftDays = (days || []).map((day) => ({
    id: draftUid(),
    name: day.dayTitle || day.name || "Workout",
    exercises: (day.exercises || []).map((ex) => {
      weeks = Math.max(weeks, (ex.weeks || []).length);
      return {
        id: draftUid(),
        name: ex.name || "",
        sets: String((ex.setLabels || []).length || 3),
        repGoal: ex.repGoal || "",
        restTime: ex.restTime || "",
      };
    }),
  }));
  return { days: draftDays, weeks: weeks || 8 };
}

/** The picker's current value as real program days, or null. */
function startingProgramDays(selected) {
  if (!selected) return null;
  if (selected.startsWith("custom:")) {
    const publishedId = selected.slice("custom:".length);
    const local = Store.listPrograms().find((p) => p.publishedId === publishedId);
    return local ? Store.getProgramDaysById(local.id) : null;
  }
  const template = PROGRAM_TEMPLATES.find((t) => t.id === selected);
  return template ? parseWorkoutSheets(template.sheetText) : null;
}

function customizeStartingProgram() {
  const select = document.getElementById("coach-client-template");
  if (!select) return;
  const days = startingProgramDays(select.value);
  if (!days || !days.length) {
    toast("Couldn't load that program");
    return;
  }
  const draft = ensureClientProgramDraft();
  if (draft.days.length && !confirm("Replace what you've built so far with this program?")) return;
  const loaded = draftFromProgramDays(days);
  draft.days = loaded.days;
  draft.weeks = loaded.weeks;
  draft.startedFrom = select.options[select.selectedIndex]?.text || "";
  render();
}

function draftExerciseCount() {
  return ensureClientProgramDraft().days.reduce((n, d) => n + d.exercises.length, 0);
}

function renderDraftBuilder() {
  const draft = ensureClientProgramDraft();
  if (!draft.days.length) return "";

  const dayCards = draft.days.map((day, i) => `
    <div class="card tappable" data-action="open-draft-day" data-day="${esc(day.id)}">
      <div class="row">
        <div style="min-width:0;">
          <h3 style="font-size:15px;margin:0;">${esc(day.name.trim() || `Day ${i + 1}`)}</h3>
          <p style="margin:3px 0 0;">${day.type === "treadmill"
            ? "Treadmill &mdash; they pick the level and the time"
            : `${day.exercises.length} exercise${day.exercises.length === 1 ? "" : "s"}${day.exercises.length ? ` &middot; ${esc(day.exercises.slice(0, 3).map((e) => e.name).join(", "))}${day.exercises.length > 3 ? "…" : ""}` : ""}`}</p>
        </div>
        <span class="pill" style="flex:none;">${day.type === "treadmill" ? "Rename" : "Edit"}</span>
      </div>
    </div>
  `).join("");

  // The name goes to the client (it's what their program is called in their
  // app) and to Settings > Saved programs, where the coach has to pick it out
  // of a list later to push an update. Worth naming properly.
  const defaultName = `${(draft.label || "").trim() || "Client"}'s Program`;
  return `
    <div class="card">
      <label for="draft-program-name">Name this program</label>
      <input type="text" id="draft-program-name" value="${esc(draft.programName || "")}" placeholder="${esc(defaultName)}" />
      <p class="hint" style="margin:4px 0 0;">What they'll see it called. Leave blank for &ldquo;${esc(defaultName)}&rdquo;.</p>
    </div>
    <div class="card">
      <div class="row" style="align-items:baseline;">
        <h3 style="margin:0;">Their program</h3>
        <span class="source-chip">${draft.days.length} day${draft.days.length === 1 ? "" : "s"} &middot; ${draftExerciseCount()} exercise${draftExerciseCount() === 1 ? "" : "s"}</span>
      </div>
      <p class="hint" style="margin:6px 0 0;">Tap a day to change it. This becomes the only program on their app &mdash; they log against it but can't edit it or see anything else.</p>
      <div style="height:10px"></div>
      <label for="draft-weeks">How many weeks</label>
      <input type="text" id="draft-weeks" inputmode="numeric" value="${esc(String(draft.weeks))}" style="max-width:110px;" />
    </div>
    ${dayCards}
    <div class="btn-row">
      <button class="btn" data-action="draft-add-day">+ Add day</button>
      <button class="btn" data-action="draft-add-treadmill-day">+ Treadmill day</button>
    </div>
    <div style="height:8px"></div>
    <button class="btn ghost danger" data-action="clear-draft">Start over</button>
    <div style="height:14px"></div>
  `;
}

// ---------- One day of the draft, on its own screen ----------

function renderCoachDraftDay() {
  const day = draftFindDay(state.params.draftDayId);
  if (!day) return `${topbar("Day", { back: true })}<div class="empty"><p>That day is gone.</p></div>`;
  const libraryOptions = Store.getExerciseLibrary()
    .slice(0, 400)
    .map((e) => `<option value="${esc(e.name)}"></option>`)
    .join("");

  const exRows = day.exercises.map((ex, i) => `
    ${i === 0 ? "" : `
    <div class="superset-toggle">
      <button class="chip${ex.superset ? " on" : ""}" data-action="toggle-draft-superset" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}" aria-pressed="${ex.superset ? "true" : "false"}">
        ${ex.superset ? "&#9679; Superset with above" : "Superset with above"}
      </button>
    </div>`}
    <div class="card"${ex.superset ? ' style="border-color:var(--accent);"' : ""}>
      <div class="row" style="margin-bottom:8px;">
        <input type="text" data-draft-ex-name="${esc(ex.id)}" data-day="${esc(day.id)}" value="${esc(ex.name)}" aria-label="Exercise name" style="flex:1;margin:0;font-weight:600;" />
        <div style="display:flex;align-items:center;gap:6px;margin-left:8px;">
          <div class="reorder-btns">
            <button data-action="draft-move-exercise" data-dir="-1" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}" ${i === 0 ? "disabled" : ""} aria-label="Move up">&#9650;</button>
            <button data-action="draft-move-exercise" data-dir="1" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}" ${i === day.exercises.length - 1 ? "disabled" : ""} aria-label="Move down">&#9660;</button>
          </div>
          <button class="btn ghost small danger" data-action="draft-remove-exercise" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}" style="width:auto;padding:5px 10px;" aria-label="Remove ${esc(ex.name)}">&times;</button>
        </div>
      </div>
      <div class="row" style="gap:8px;">
        <div style="flex:1;"><label>Sets</label><input type="text" inputmode="numeric" data-draft-ex-sets="${esc(ex.id)}" data-day="${esc(day.id)}" value="${esc(ex.sets)}" /></div>
        <div style="flex:1;"><label>Reps</label><input type="text" data-draft-ex-reps="${esc(ex.id)}" data-day="${esc(day.id)}" value="${esc(ex.repGoal)}" placeholder="8-10" /></div>
        <div style="flex:1;"><label>Rest</label><input type="text" data-draft-ex-rest="${esc(ex.id)}" data-day="${esc(day.id)}" value="${esc(ex.restTime)}" placeholder="90s" /></div>
      </div>
    </div>
  `).join("");

  const addForm = draftAddingToDayId === day.id ? `
    <div class="card">
      <label for="draft-ex-name">New exercise</label>
      <input type="text" id="draft-ex-name" list="draft-ex-library" placeholder="Start typing, or pick from your library" autocomplete="off" />
      <div class="row" style="gap:8px;margin-top:8px;">
        <div style="flex:1;"><label for="draft-ex-sets">Sets</label><input type="text" id="draft-ex-sets" inputmode="numeric" value="3" /></div>
        <div style="flex:1;"><label for="draft-ex-reps">Reps</label><input type="text" id="draft-ex-reps" placeholder="8-10" /></div>
        <div style="flex:1;"><label for="draft-ex-rest">Rest</label><input type="text" id="draft-ex-rest" placeholder="90s" /></div>
      </div>
      <div style="height:10px"></div>
      <div class="btn-row">
        <button class="btn primary small" data-action="draft-add-exercise" data-day="${esc(day.id)}">Add</button>
        <button class="btn ghost small" data-action="draft-cancel-add-exercise">Cancel</button>
      </div>
    </div>` : `<button class="btn" data-action="draft-open-add-exercise" data-day="${esc(day.id)}">+ Add exercise</button>`;

  return `
    ${topbar("Edit day", { back: true })}
    <datalist id="draft-ex-library">${libraryOptions}</datalist>
    <div class="card">
      <label for="draft-day-name">Day name</label>
      <input type="text" id="draft-day-name" data-draft-day-name="${esc(day.id)}" value="${esc(day.name)}" placeholder="e.g. Push" />
    </div>
    ${exRows || `<div class="empty"><p>No exercises in this day yet.</p></div>`}
    ${addForm}
    <div style="height:10px"></div>
    <button class="btn primary" data-action="save-draft-day">Save day</button>
    <div style="height:8px"></div>
    <button class="btn danger" data-action="draft-remove-day" data-day="${esc(day.id)}">Delete this day</button>
  `;
}

function draftFindDay(dayId) {
  return ensureClientProgramDraft().days.find((d) => d.id === dayId);
}

function draftAddDay(type) {
  const draft = ensureClientProgramDraft();
  const treadmill = type === "treadmill";
  const day = {
    id: draftUid(),
    name: treadmill ? "Treadmill" : `Day ${draft.days.length + 1}`,
    type: treadmill ? "treadmill" : "strength",
    exercises: [],
  };
  draft.days.push(day);
  // A treadmill day has nothing to fill in -- the client picks the level and
  // the time -- so there is no point opening an editor for it.
  if (treadmill) { toast("Treadmill day added"); render(); return; }
  navigate("coach-draft-day", { draftDayId: day.id });
}

function draftRemoveDay(dayId) {
  const draft = ensureClientProgramDraft();
  draft.days = draft.days.filter((d) => d.id !== dayId);
  if (draftAddingToDayId === dayId) draftAddingToDayId = null;
  if (state.screen === "coach-draft-day") navigate("coach-add-client");
  else render();
}

function draftAddExercise(dayId) {
  const day = draftFindDay(dayId);
  if (!day) return;
  const name = document.getElementById("draft-ex-name").value.trim();
  if (!name) {
    toast("Give the exercise a name");
    return;
  }
  day.exercises.push({
    id: draftUid(),
    name,
    sets: document.getElementById("draft-ex-sets").value.trim() || "3",
    repGoal: document.getElementById("draft-ex-reps").value.trim(),
    restTime: document.getElementById("draft-ex-rest").value.trim(),
  });
  // Stay open so a whole day can be typed in without re-tapping Add exercise.
  render();
  const next = document.getElementById("draft-ex-name");
  if (next) next.focus();
}

/** "Superset with the one above" is meaningless on the first exercise, so
 * anything that can leave a flagged exercise at the top has to clear it --
 * otherwise a client sees a superset marker pointing at nothing. */
function normaliseSupersets(day) {
  if (day.exercises.length) day.exercises[0].superset = false;
}

function draftRemoveExercise(dayId, exerciseId) {
  const day = draftFindDay(dayId);
  if (!day) return;
  day.exercises = day.exercises.filter((e) => e.id !== exerciseId);
  normaliseSupersets(day);
  render();
}

function draftMoveExercise(dayId, exerciseId, direction) {
  const day = draftFindDay(dayId);
  if (!day) return;
  const i = day.exercises.findIndex((e) => e.id === exerciseId);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= day.exercises.length) return;
  [day.exercises[i], day.exercises[j]] = [day.exercises[j], day.exercises[i]];
  normaliseSupersets(day);
  render();
}

function renderCoachAddClient() {
  ensureClientProgramDraft();
  const preselect = state.params.preselectProgram || "";
  const draft = clientProgramDraft;
  return `
    ${topbar("Add client", { back: true })}
    <div class="card">
      <label for="coach-client-label">Client name</label>
      <input type="text" id="coach-client-label" value="${esc(draft.label || "")}" placeholder="e.g. Jordan" />

      <label for="coach-client-template">Starting program</label>
      <select id="coach-client-template">${programPickerOptgroups(preselect, "", false)}</select>
      <div style="height:10px"></div>
      <div class="btn-row">
        <button class="btn" data-action="customize-starting-program">${draft.days.length ? "Load a different program" : "Customize this program"}</button>
        ${draft.days.length ? "" : `<button class="btn ghost" data-action="draft-add-day">Build from scratch</button>`}
      </div>
      <p class="hint" style="margin-top:8px;">${draft.days.length
        ? "Loading another program replaces what's below."
        : "<strong>Customize</strong> pulls this program in so you can edit it day by day before you send the link. <strong>Build from scratch</strong> starts empty. Do neither and they get the program as-is, which they can then edit themselves."}</p>
    </div>

    ${renderDraftBuilder()}

    <div class="card">
      <label for="coach-client-price">Price (optional)</label>
      <input type="text" id="coach-client-price" inputmode="decimal" value="${esc(draft.price || "")}" placeholder="e.g. 50" />
      <p class="hint">Leave blank for free, instant access. Set a price and they'll have to verify their email and pay before the program unlocks -- you confirm payment yourself and their access unlocks automatically the moment you do.</p>
    </div>
    <button class="btn primary" data-action="confirm-add-coach-client">Generate client link</button>
  `;
}

/** Firestore does not fail the way the old "check your connection" message
 * assumed. An offline write is *queued*, not rejected -- it just never
 * settles. So a rejection here almost never means the network, and saying it
 * does sends you off checking wifi while the real cause (a rules rejection, a
 * half-loaded SDK) goes unnamed.
 *
 * This races the write against a timeout so a hang is distinguishable from a
 * failure, and reports whichever actually happened, with the code. */
async function firestoreStep(label, promise, ms = 10000) {
  let timer;
  try {
    await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("__timeout__")), ms); }),
    ]);
  } catch (err) {
    const code = err && (err.code || err.message);
    console.error(`[${label}] failed:`, code, err);
    const e = new Error(code === "__timeout__"
      ? `${label} is hanging — the write never reached Firebase. Usually a blocked connection or a paused Firestore database.`
      : `${label} was refused: ${code || "unknown error"}`);
    e.step = label;
    e.code = code;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function confirmAddCoachClient() {
  const label = document.getElementById("coach-client-label").value.trim();
  let selected = document.getElementById("coach-client-template").value;
  const priceRaw = document.getElementById("coach-client-price").value.trim();
  if (!label) {
    toast("Give the client a name");
    return;
  }
  const priceDollars = priceRaw ? parseFloat(priceRaw) : 0;
  if (priceRaw && (isNaN(priceDollars) || priceDollars < 0)) {
    toast("Enter a valid price, or leave it blank");
    return;
  }
  const submitBtn = document.querySelector('[data-action="confirm-add-coach-client"]');
  const priceCents = Math.round(priceDollars * 100);

  // A program built right here takes precedence over the picker, and is what
  // makes this a *managed* client: it becomes the only program on their
  // device and they can't edit it or reach any other.
  const built = draftToDays();
  if (built.length) {
    const emptyDay = built.find((d) => d.type !== "treadmill" && !d.exercises.length);
    if (emptyDay) {
      toast(`"${emptyDay.name}" has no exercises yet`);
      return;
    }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Publishing their program…"; }
    const result = await publishDraftForClient(label, built);
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Generate client link"; }
    if (!result) return;
    const clientId = newId();
    try {
      await firestoreStep("Saving to your roster", addClientToRoster(getOrCreateCoachId(), clientId, label, priceCents));
      await firestoreStep("Linking their program", setClientManagedProgram(clientId, { customProgramId: result.publishedId, name: result.name }));
      resetClientProgramDraft();
      navigate("coach-client-link", {
        clientId, label, priceCents, managed: true,
        customProgramId: result.publishedId, programName: result.name,
        templateId: null,
      });
    } catch (err) {
      toast(err.message || "Couldn't create the client link");
    }
    return;
  }

  const resolved = await resolveProgramSelection(selected, () => {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Publishing your copy…"; }
  });
  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Generate client link"; }
  if (!resolved) return; // canceled the rename prompt
  if (resolved.failed) {
    toast(`Couldn't publish "${resolved.name}" yet — it's saved under Settings → Saved programs, retry publishing from there once you're back online`);
    return;
  }
  const { templateId, customProgramId, programName } = resolved;
  const clientId = newId();
  try {
    await firestoreStep("Saving to your roster", addClientToRoster(getOrCreateCoachId(), clientId, label, priceCents));
    navigate("coach-client-link", { clientId, label, templateId, customProgramId, programName, priceCents });
  } catch (err) {
    toast(err.message || "Couldn't create the client link");
  }
}

/** Publishes a freshly-built draft and keeps the coach a local, editable copy
 * of it (not switched to -- the coach stays on whatever they had open), so
 * they can change this client's program later from Settings > Saved programs
 * and push the edit out with "Update for clients". */
/** Firestore rejects a write for exactly two interesting reasons, and they
 * need different things from the reader. permission-denied means the security
 * rules in the Firebase console are behind the ones in this repo -- no amount
 * of checking wifi fixes it -- so name the collection and the fix. */
function firebaseWriteMessage(err, what) {
  const code = err && (err.code || err.message);
  if (code === "permission-denied") {
    return `Firebase refused to ${what}: its security rules are out of date. Coach dashboard > Run connection check to see which collection, then publish firestore.rules in the Firebase console.`;
  }
  if (code === "timeout") return `Taking a while to ${what} — check your connection and try again.`;
  return `Couldn't ${what}${code ? ` (${code})` : ""}.`;
}

async function publishDraftForClient(clientLabel, days) {
  const typed = ((clientProgramDraft && clientProgramDraft.programName) || "").trim();
  const name = typed || `${clientLabel}'s Program`;
  const publishedId = newId();
  try {
    await Promise.race([
      publishCustomProgram(getOrCreateCoachId(), publishedId, name, days),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
    ]);
  } catch (e) {
    toast(firebaseWriteMessage(e, "publish their program"));
    return null;
  }
  const previousActiveId = Store.listPrograms().find((p) => p.active)?.id || null;
  const localId = Store.createProgram(name, days);
  Store.setProgramPublishedId(localId, publishedId);
  if (previousActiveId) Store.switchProgram(previousActiveId);
  return { publishedId, name };
}

function renderCoachClientLink() {
  const { clientId, label, templateId, customProgramId, programName, priceCents } = state.params;
  const linkParams = new URLSearchParams({ client: clientId });
  if (customProgramId) linkParams.set("cp", customProgramId);
  else if (templateId && templateId !== "default") linkParams.set("template", templateId);
  if (priceCents > 0) linkParams.set("price", String(priceCents));
  if (state.params.managed) linkParams.set("m", "1");
  const link = `${window.location.origin}${window.location.pathname}?${linkParams.toString()}`;
  return `
    ${topbar("Client link ready", { back: true })}
    <div class="card">
      <h3>${esc(label)}</h3>
      <p>Send this link to your client.${priceCents > 0
        ? ` They'll be asked to verify their email and pay $${(priceCents / 100).toFixed(2)} before the program unlocks. Once you confirm the payment yourself (Settings &gt; Coach dashboard &gt; Mark as paid), their access unlocks automatically.`
        : " The moment they open it, their logged workouts start syncing to you — no account needed on their end."
      }${programName && (customProgramId || templateId !== "default") ? ` They'll start with the "${esc(programName)}" program.` : ""}</p>
      ${state.params.managed ? `<p class="hint">You built this program, so it's the only one they'll see — they can log their numbers but can't add days, swap exercises or browse other programs. To change it later, edit "${esc(programName || "their program")}" under Settings &gt; Saved programs and tap <strong>Update for clients</strong>; they pick the change up next time they open the app, with everything they've already logged left alone.</p>` : ""}
      <div style="height:10px"></div>
      <input type="text" id="coach-link-output" value="${esc(link)}" readonly onclick="this.select()" />
      <div style="height:10px"></div>
      <button class="btn primary" data-action="copy-coach-link" data-link="${esc(link)}">Copy link</button>
    </div>
    <button class="btn" data-action="go-coach">Done</button>
  `;
}

function renderCoachClient() {
  const { clientId, clientLabel } = state.params;
  const assignBtn = `<button class="btn" data-action="go-assign-program" data-client="${esc(clientId)}" data-label="${esc(clientLabel || "")}" style="margin-bottom:14px;">Assign new program</button>`;
  if (!coachClientData) {
    return `${topbar(clientLabel || "Client", { back: true })}${assignBtn}<div class="empty"><p>Waiting for this client to open their link and sync for the first time...</p></div>`;
  }
  const days = coachClientData.program?.days || [];
  const items = days.map((day) => {
    const exCount = day.exercises.length;
    const filled = day.exercises.reduce((n, ex) => n + ex.weeks.filter((w) => w.updatedAt).length, 0);
    return `
      <div class="card tappable" data-action="open-coach-client-day" data-client="${esc(clientId)}" data-label="${esc(clientLabel || "")}" data-day="${esc(day.id)}">
        <div class="row">
          <div>
            <h3>${esc(day.name)}</h3>
            <p>${exCount} exercise${exCount === 1 ? "" : "s"}${filled ? ` &middot; ${filled} week${filled === 1 ? "" : "s"} logged` : ""}</p>
          </div>
          <span class="pill">Live</span>
        </div>
      </div>`;
  }).join("");

  return `
    ${topbar(coachClientData.displayName || clientLabel || "Client", { back: true })}
    <p style="margin-bottom:12px;">Last synced ${coachClientData.updatedAt ? relativeTime(firestoreTimeToIso(coachClientData.updatedAt)) : "never"}</p>
    ${renderCoachCheckIns(coachClientData.checkIns || [])}
    ${renderCoachReminders(clientId, clientLabel, coachClientData.reminders)}
    ${assignBtn}
    ${items || `<div class="empty"><p>No workout days yet.</p></div>`}
  `;
}

/** The client's own words and numbers, newest first. The week-to-week change
 * is the thing a coach actually scans for, so it leads. */
function renderCoachCheckIns(checkIns) {
  if (!checkIns.length) {
    return `<div class="card"><h3>Check-ins</h3><p class="hint">Nothing yet. They check in from Nutrition &gt; Check in.</p></div>`;
  }
  const sorted = checkIns.slice().sort((a, b) => b.date.localeCompare(a.date));
  const first = sorted[sorted.length - 1];
  const latest = sorted[0];
  const total = Math.round((latest.weight - first.weight) * 10) / 10;
  const rows = sorted.slice(0, 8).map((w, i) => {
    const previous = sorted[i + 1];
    const delta = previous ? Math.round((w.weight - previous.weight) * 10) / 10 : null;
    const summary = checkInSummaryLine(w);
    const flags = [];
    if (w.sleepHours !== null && w.sleepHours !== undefined && w.sleepHours < 6) flags.push("low sleep");
    if (w.energy && w.energy <= 2) flags.push("low energy");
    if (w.hunger && w.hunger <= 2) flags.push("very hungry");
    return `
      <div class="row" style="border-top:1px solid var(--border);padding-top:9px;margin-top:9px;">
        <div style="min-width:0;">
          <h3 style="font-size:14px;margin:0;">${w.weight}${delta !== null && delta !== 0 ? ` <span class="hint" style="font-weight:400;">${delta > 0 ? "+" : ""}${delta}</span>` : ""}</h3>
          <p style="margin:2px 0 0;">${esc(w.date)}</p>
          ${summary ? `<p style="margin:2px 0 0;">${summary}</p>` : ""}
          ${w.note ? `<p style="margin:3px 0 0;">&ldquo;${esc(w.note)}&rdquo;</p>` : ""}
        </div>
        ${flags.length ? `<span class="pill" style="flex:none;">${esc(flags[0])}</span>` : ""}
      </div>`;
  }).join("");
  return `
    <div class="card">
      <div class="row" style="align-items:baseline;">
        <h3 style="margin:0;">Check-ins</h3>
        ${sorted.length > 1 ? `<span class="source-chip">${total > 0 ? "+" : ""}${total} overall</span>` : ""}
      </div>
      ${rows}
      ${sorted.length > 8 ? `<p class="hint" style="margin-top:9px;">Showing the last 8 of ${sorted.length}.</p>` : ""}
    </div>`;
}

/** Days since this client's most recent check-in, or null if they've never
 * made one and we can't tell. Read from the live client doc the coach screen
 * is already subscribed to. */
function daysSinceClientCheckIn() {
  const checkIns = (coachClientData && coachClientData.checkIns) || [];
  const dates = checkIns.map((c) => c.date).filter(Boolean).sort();
  if (!dates.length) return null;
  const last = new Date(`${dates[dates.length - 1]}T00:00:00`);
  const now = new Date(`${Nutrition.todayStr()}T00:00:00`);
  return Math.round((now - last) / 86400000);
}

/** Reminder settings for one client. The in-app nudge works today; the
 * contact fields are stored ready for whichever sending channel gets wired
 * up (see README -- it needs a server, not just an app change). */
function renderCoachReminders(clientId, clientLabel, reminders) {
  const r = reminders || {};
  const on = r.enabled !== false; // default on for a new client
  const silent = daysSinceClientCheckIn();
  // Mirrors GIVE_UP_DAYS in functions/reminders.js: past this the automated
  // emails stop on purpose, so the dashboard has to say so or the coach will
  // assume the system is still chasing them.
  const givenUp = silent !== null && silent > 32;
  return `
    <div class="card">
      <h3>Check-in reminders</h3>
      ${givenUp ? `<p style="color:var(--danger);margin-top:2px;"><strong>${esc(clientLabel || "This client")} has been quiet for ${silent} days.</strong> Automated reminders have stopped &mdash; past a month it's a phone call, not another email.</p>` : ""}
      <p class="hint" style="margin-top:2px;">When this is on, their app nudges them to check in once a week, and &mdash; once the reminder function is deployed &mdash; emails them if they go quiet. At most one email every six days, and none at all after a month of silence.</p>
      <div style="height:10px"></div>
      <div class="btn-row">
        <button class="btn ${on ? "primary" : ""}" data-action="set-client-reminders" data-client="${esc(clientId)}" data-label="${esc(clientLabel || "")}" data-enabled="true">On</button>
        <button class="btn ${on ? "" : "primary"}" data-action="set-client-reminders" data-client="${esc(clientId)}" data-label="${esc(clientLabel || "")}" data-enabled="false">Off</button>
      </div>
      <div style="height:12px"></div>
      <label for="reminder-phone">Their mobile (optional)</label>
      <input type="tel" id="reminder-phone" value="${esc(r.phone || "")}" placeholder="e.g. 914 555 0134" />
      <label for="reminder-email">Their email (optional)</label>
      <input type="email" id="reminder-email" value="${esc(r.email || "")}" placeholder="e.g. jordan@example.com" />
      <div style="height:10px"></div>
      <button class="btn small" data-action="save-client-reminder-contact" data-client="${esc(clientId)}" data-label="${esc(clientLabel || "")}">Save contact details</button>
      <p class="hint" style="margin-top:8px;">Email reminders go out once the Cloud Function is deployed (see the README). Texts still need a sending service &mdash; the number is stored ready for it.</p>
    </div>`;
}

/** Merges a change into this client's reminder settings (the buttons send one
 * field, the contact form sends two) and writes it in both places. */
/** Puts a client back on the roster from a link you already sent them.
 *
 * Adding a client does several things in order -- publish their program, save
 * them to the roster, point their device at it -- and if one step fails the
 * ones after it never run. The client can end up holding a working link while
 * the coach's dashboard shows nothing, which is the worst version of this to
 * be in. Pasting the link back in re-attaches them without changing anything
 * on their phone or touching a number they have logged. */
async function relinkClient() {
  const pasted = (prompt("Paste the client link you sent them (or just their client id)") || "").trim();
  if (!pasted) return;

  let clientId = "";
  let priceCents = 0;
  try {
    const url = new URL(pasted);
    clientId = url.searchParams.get("client") || "";
    priceCents = parseInt(url.searchParams.get("price") || "0", 10) || 0;
  } catch {
    // Not a URL -- treat it as a bare id, which is what the coach sees on
    // their own client screen.
    clientId = pasted.replace(/\s/g, "");
  }
  if (!clientId) {
    toast("That link has no client id in it — make sure it's the link you sent them");
    return;
  }

  const label = (prompt("What's their name?") || "").trim();
  if (!label) return;

  try {
    await firestoreStep("Saving to your roster", addClientToRoster(getOrCreateCoachId(), clientId, label, priceCents));
    toast(`${label} is back on your roster`);
    render();
  } catch (err) {
    toast(err.message || "Couldn't re-add them");
  }
}

async function saveClientReminders(clientId, clientLabel, patch) {
  const current = (coachClientData && coachClientData.reminders) || {};
  const next = { enabled: current.enabled !== false, phone: current.phone || "", email: current.email || "", ...patch };
  try {
    await setClientReminders(getOrCreateCoachId(), clientId, next);
    // The live client listener echoes this back, but updating locally first
    // keeps the buttons from lagging a round-trip behind the tap.
    if (coachClientData) coachClientData.reminders = next;
    toast(patch.enabled === undefined ? "Contact details saved" : patch.enabled ? "Reminders on" : "Reminders off");
    render();
  } catch {
    toast("Couldn't save that — check your connection");
  }
}

function renderCoachClientAssignProgram() {
  const { clientId, clientLabel } = state.params;
  return `
    ${topbar("Assign program", { back: true })}
    <div class="card">
      <h3>${esc(clientLabel || "Client")}</h3>
      <label for="assign-program-select">Program</label>
      <select id="assign-program-select">${programPickerOptgroups("", "Copy & customize for this client")}</select>
      <p class="hint">This adds it as a new program on their device, alongside whatever they already have -- nothing they've logged is touched or deleted. It applies automatically the next time their app syncs (they don't need to do anything, though telling them to reopen the app speeds it up).</p>
    </div>
    <button class="btn primary" data-action="confirm-assign-program" data-client="${esc(clientId)}" data-label="${esc(clientLabel || "")}">Assign</button>
  `;
}

async function confirmAssignProgram(clientId, clientLabel) {
  const selected = document.getElementById("assign-program-select").value;
  const submitBtn = document.querySelector('[data-action="confirm-assign-program"]');
  const resolved = await resolveProgramSelection(selected, () => {
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Publishing your copy…"; }
  });
  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Assign"; }
  if (!resolved) return; // canceled the rename prompt
  if (resolved.failed) {
    toast(`Couldn't publish "${resolved.name}" yet — it's saved under Settings → Saved programs, retry publishing from there once you're back online`);
    return;
  }
  const { templateId, customProgramId, programName } = resolved;
  const assignment = customProgramId ? { kind: "custom", customProgramId, name: programName } : { kind: "template", templateId, name: programName };
  try {
    await assignProgramToClient(clientId, assignment);
    toast(`"${programName}" assigned to ${clientLabel || "client"} — it'll apply next time their app syncs`);
    navigate("coach-client", { clientId, clientLabel });
  } catch {
    toast("Couldn't assign — check your connection and try again");
  }
}

function renderCoachClientDay() {
  const { clientId, clientLabel, dayId } = state.params;
  const day = coachClientData?.program?.days.find((d) => d.id === dayId);
  if (!day) {
    return `${topbar("Day", { back: true })}<div class="empty"><p>Not available.</p></div>`;
  }
  const items = day.exercises.map((ex) => {
    const filled = ex.weeks.filter((w) => w.updatedAt).length;
    const repText = ex.repGoal && (/rep/i.test(ex.repGoal) ? ex.repGoal : `${ex.repGoal} reps`);
    const target = [repText, ex.restTime && `rest ${ex.restTime}`].filter(Boolean).join(" &middot; ");
    return `
      <div class="card tappable" data-action="open-coach-client-exercise" data-client="${esc(clientId)}" data-label="${esc(clientLabel || "")}" data-day="${esc(dayId)}" data-exercise="${esc(ex.id)}">
        <div class="row">
          <div>
            <h3>${esc(ex.name)}</h3>
            <p>${target || `${ex.weeks.length} weeks`}${filled ? ` &middot; ${filled} logged` : ""}</p>
          </div>
          <span class="pill">${ex.setLabels.length || 0} sets</span>
        </div>
      </div>`;
  }).join("");
  return `${topbar(day.name, { back: true })}${items || `<div class="empty"><p>No exercises in this day.</p></div>`}`;
}

function renderCoachClientExercise() {
  const { dayId, exerciseId } = state.params;
  const day = coachClientData?.program?.days.find((d) => d.id === dayId);
  const ex = day?.exercises.find((e) => e.id === exerciseId);
  if (!ex) {
    return `${topbar("Exercise", { back: true })}<div class="empty"><p>Not available.</p></div>`;
  }
  const weeksSorted = [...ex.weeks].sort((a, b) => a.week - b.week);
  const weekCards = weeksSorted.map((w) => {
    const fields = ex.setLabels.map((label, i) => `
      <div class="field">
        <label>${esc(label)}</label>
        <div class="readonly-value">${esc(w.values[i]) || "&mdash;"}</div>
        <div class="readonly-value">${esc((w.reps || [])[i]) || "&mdash;"}</div>
      </div>
    `).join("");
    return `
      <div class="card">
        <div class="row">
          <h3>Week ${w.week}</h3>
          ${w.updatedAt ? `<span class="hint">updated ${relativeTime(w.updatedAt)}</span>` : ""}
        </div>
        <div class="week-fields">${fields}</div>
        ${w.notes ? `<p>${esc(w.notes)}</p>` : ""}
      </div>
    `;
  }).join("");

  const findOnYoutube = `<a class="btn ghost small" href="${youtubeSearchUrl(ex.name)}" target="_blank" rel="noopener noreferrer" style="width:auto;padding:6px 10px;text-decoration:none;" aria-label="Find &quot;${esc(ex.name)}&quot; on YouTube">&#9654;</a>`;
  return `
    ${topbar(ex.name, { back: true, right: findOnYoutube })}
    <div class="row" style="margin-bottom:10px;flex-wrap:wrap;gap:8px;">
      ${ex.repGoal ? `<span class="source-chip">Reps: ${esc(ex.repGoal)}</span>` : ""}
      ${ex.restTime ? `<span class="source-chip">Rest: ${esc(ex.restTime)}</span>` : ""}
      ${ex.videoUrl ? `<a class="source-chip" href="${esc(ex.videoUrl)}" target="_blank" rel="noopener noreferrer">&#9654; Video</a>` : ""}
    </div>
    ${renderVideoEmbed(ex.videoUrl)}
    ${ex.setupNote ? `<div class="card"><p>${esc(ex.setupNote)}</p></div>` : ""}
    ${weekCards}
  `;
}

async function refreshDay(dayId) {
  const day = Store.getDay(dayId);
  if (!day?.source?.url) return;
  toast("Refreshing...");
  try {
    const csvText = await fetchGoogleSheetCsv(day.source.url);
    const fresh = parseWorkoutSheet(csvText);
    if (!fresh.exercises.length) {
      toast("No exercises found in the refreshed sheet");
      return;
    }
    const merged = fresh.exercises.map((newEx) => {
      const oldEx = day.exercises.find((e) => e.name.trim().toLowerCase() === newEx.name.trim().toLowerCase());
      return {
        name: newEx.name,
        repGoal: newEx.repGoal,
        restTime: newEx.restTime,
        setupNote: newEx.setupNote,
        superset: !!newEx.superset,
        setLabels: newEx.setLabels,
        weeks: newEx.weeks.map((w) => {
          const oldWeek = oldEx?.weeks.find((ow) => ow.week === w.week);
          if (oldWeek && (oldWeek.updatedAt || oldWeek.values.some((v) => v) || (oldWeek.reps || []).some((v) => v) || oldWeek.notes)) return oldWeek;
          return { week: w.week, values: w.values, reps: newEx.setLabels.map(() => ""), notes: w.notes, updatedAt: null };
        }),
      };
    });
    const program = Store.getProgram();
    const target = program.days.find((d) => d.id === dayId);
    target.exercises = merged.map((ex) => ({
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      ...ex,
    }));
    Store.setProgram(program);
    toast("Day refreshed");
    render();
  } catch (e) {
    toast(e.message);
  }
}

// ---------- event delegation ----------

function attachHandlers() {
  app.addEventListener("click", onClick);
  app.addEventListener("input", onInput);
  app.addEventListener("change", onChange);
}

// Everything a managed client must not be able to do. The buttons are already
// gone from the markup; this is the second lock, so an action fired any other
// way (a stale screen still in the DOM, the console, a bookmarklet) is refused
// too. Logging weights, reps and notes is deliberately absent -- that is the
// one thing they are meant to do.
const COACH_ONLY_ACTIONS = new Set([
  "go-import", "import-sheet", "import-paste", "import-csv", "confirm-import",
  "go-add-exercise", "confirm-add-exercise", "go-swap-exercise", "confirm-swap-exercise",
  "add-week", "rename-day", "delete-day", "rename-exercise", "delete-exercise",
  "move-exercise", "set-exercise-video", "refresh-day",
  "go-templates", "add-template", "load-template", "create-blank-program",
  "copy-template-for-client", "copy-template-link",
  "switch-program", "switch-program-btn", "rename-program", "delete-program",
  "publish-program", "unpublish-program",
  "go-coach", "go-coach-add-client", "confirm-add-coach-client",
]);

function onClick(e) {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;

  if (isManagedClient() && COACH_ONLY_ACTIONS.has(action)) {
    toast("Your coach manages this program — message them to change it");
    return;
  }

  switch (action) {
    case "send-signin-link": handleSendSigninLink(); break;
    case "resend-signin-link": {
      state.params.signinSent = null;
      render();
      break;
    }
    case "go-import": navigate("import"); break;
    case "back": {
      if (state.screen === "review") navigate("import");
      else if (state.screen === "import") navigate("program");
      else if (state.screen === "exercise") navigate("day", { dayId: state.params.dayId });
      else if (state.screen === "add-exercise") navigate("day", { dayId: state.params.dayId });
      else if (state.screen === "day") navigate("program");
      else if (state.screen === "coach") navigate("settings");
      else if (state.screen === "templates") navigate("settings");
      else if (state.screen === "exercise-library") navigate("settings");
      else if (state.screen === "cardio-day") navigate("cardio");
      else if (state.screen === "cardio") navigate("program");
      else if (state.screen === "coach-pin") navigate("settings");
      else if (state.screen === "coach-add-client") navigate("coach");
      else if (state.screen === "treadmill") navigate("program");
      else if (state.screen === "coach-draft-day") navigate("coach-add-client");
      else if (state.screen === "coach-client-link") navigate("coach");
      else if (state.screen === "coach-client") navigate("coach");
      else if (state.screen === "coach-client-assign-program") navigate("coach-client", { clientId: state.params.clientId, clientLabel: state.params.clientLabel });
      else if (state.screen === "coach-client-day") navigate("coach-client", { clientId: state.params.clientId, clientLabel: state.params.clientLabel });
      else if (state.screen === "coach-client-exercise") navigate("coach-client-day", { clientId: state.params.clientId, clientLabel: state.params.clientLabel, dayId: state.params.dayId });
      else if (state.screen === "nutrition-add") navigate("nutrition", { dateStr: state.params.dateStr });
      else if (["nutrition-manual", "nutrition-search", "nutrition-review"].includes(state.screen)) {
        if (recipeDraft) navigate("nutrition-recipe-new");
        else navigate("nutrition-add", { dateStr: state.params.dateStr, mealType: state.params.mealType });
      }
      else if (state.screen === "nutrition-scan") {
        stopBarcodeScan();
        navigate("nutrition-add", { dateStr: state.params.dateStr, mealType: state.params.mealType });
      }
      else if (["nutrition-weight", "nutrition-goals", "nutrition-recipes", "recipe-library"].includes(state.screen)) navigate("nutrition");
      else if (state.screen === "recipe-library-item") navigate("recipe-library");
      else if (state.screen === "nutrition-recipe-new") navigate("nutrition-recipes");
      else if (state.screen === "nutrition") navigate("program");
      else navigate("program");
      break;
    }
    case "import-sheet": handleImportSheet(); break;
    case "import-paste": handleImportPaste(); break;
    case "create-blank-day": handleCreateBlankDay(); break;
    case "create-blank-program": createBlankProgram(); break;
    case "confirm-review": confirmReview(); break;
    case "open-day": {
      const d = Store.getDay(el.dataset.day);
      navigate(d && d.type === "treadmill" ? "treadmill" : "day", { dayId: el.dataset.day });
      break;
    }
    case "set-treadmill-level": treadmillPick.level = Number(el.dataset.level); render(); break;
    case "set-treadmill-duration": treadmillPick.minutes = Number(el.dataset.minutes); render(); break;
    case "start-treadmill": startTreadmill(el.dataset.day); break;
    case "toggle-treadmill-pause": {
      if (treadmillRun) { treadmillRun.paused = !treadmillRun.paused; render(); }
      break;
    }
    case "quit-treadmill": finishTreadmill(false); break;
    case "draft-add-treadmill-day": draftAddDay("treadmill"); break;
    case "open-exercise": navigate("exercise", { dayId: el.dataset.day, exerciseId: el.dataset.exercise }); break;
    case "go-add-exercise": resetMuscleBrowse(); navigate("add-exercise", { dayId: el.dataset.day }); break;
    case "go-swap-exercise": resetMuscleBrowse(); navigate("add-exercise", { dayId: el.dataset.day, swapExerciseId: el.dataset.exercise }); break;
    case "confirm-add-exercise": confirmAddExercise(el.dataset.day, el.dataset.swap); break;
    case "open-muscle-browse": muscleBrowse.open = true; muscleBrowse.group = null; render(); break;
    case "close-muscle-browse": muscleBrowse.open = false; render(); break;
    case "muscle-view": muscleBrowse.view = el.dataset.view; render(); break;
    case "pick-muscle-group": muscleBrowse.group = el.dataset.group; render(); break;
    case "muscle-back-to-map": muscleBrowse.group = null; render(); break;
    case "pick-muscle-exercise": {
      const match = Store.getExerciseLibrary().find((e) => e.name === el.dataset.name);
      muscleBrowse.open = false;
      muscleBrowse.group = null;
      muscleBrowse.prefill = match
        ? { name: match.name, repGoal: match.repGoal || "", restTime: match.restTime || "", videoUrl: match.videoUrl || "" }
        : { name: el.dataset.name, repGoal: "", restTime: "", videoUrl: "" };
      render();
      break;
    }
    case "pick-muscle-exercise-custom": muscleBrowse.open = false; muscleBrowse.group = null; muscleBrowse.prefill = null; render(); break;
    case "add-week": {
      Store.addWeekToExercise(el.dataset.day, el.dataset.exercise);
      render();
      break;
    }
    case "toggle-rest-timer": {
      toggleRestTimer(el.dataset.key, Number(el.dataset.seconds));
      break;
    }
    case "delete-day": {
      if (confirm("Delete this workout day and everything logged in it?")) {
        Store.removeDay(el.dataset.day);
        toast("Day deleted");
        navigate("program");
      }
      break;
    }
    case "rename-day": {
      const day = Store.getDay(el.dataset.day);
      const name = prompt("Rename day", day?.name || "");
      if (name && name.trim()) {
        Store.renameDay(el.dataset.day, name.trim());
        render();
      }
      break;
    }
    case "delete-exercise": {
      if (confirm("Delete this exercise and everything logged for it?")) {
        const dayId = el.dataset.day;
        Store.removeExercise(dayId, el.dataset.exercise);
        toast("Exercise deleted");
        navigate("day", { dayId });
      }
      break;
    }
    case "rename-exercise": {
      const ex = Store.getExercise(el.dataset.day, el.dataset.exercise);
      const name = prompt("Rename exercise", ex?.name || "");
      if (name && name.trim()) {
        Store.renameExercise(el.dataset.day, el.dataset.exercise, name.trim());
        render();
      }
      break;
    }
    case "set-exercise-video": {
      const ex = Store.getExercise(el.dataset.day, el.dataset.exercise);
      const url = prompt("YouTube video link (leave blank to remove)", ex?.videoUrl || "");
      if (url !== null) {
        Store.setExerciseVideo(el.dataset.day, el.dataset.exercise, url.trim());
        render();
      }
      break;
    }
    case "move-exercise": {
      Store.moveExercise(el.dataset.day, el.dataset.exercise, parseInt(el.dataset.dir, 10));
      render();
      break;
    }
    case "refresh-day": refreshDay(el.dataset.day); break;
    case "set-units": {
      const settings = Store.getSettings();
      settings.units = el.dataset.units;
      Store.setSettings(settings);
      render();
      break;
    }
    case "set-theme": {
      setTheme(el.dataset.theme);
      render();
      break;
    }
    case "reset-all": {
      if (confirm("Erase every imported day and logged value? This can't be undone.")) {
        Store.clearAll();
        toast("All data erased");
        navigate("program");
      }
      break;
    }
    case "save-client-name": {
      const name = document.getElementById("client-name").value.trim();
      setClientName(name);
      const program = Store.getProgram();
      if (program) pushClientProgram(getLocalClientId(), name, program);
      toast("Saved");
      break;
    }
    case "refresh-managed-program": refreshManagedProgram(); break;
    case "set-checkin-scale": {
      const draft = ensureCheckInDraft();
      const field = el.dataset.field;
      const value = Number(el.dataset.value);
      draft[field] = draft[field] === value ? null : value; // tap again to clear
      render();
      break;
    }
    case "go-check-in": navigate("nutrition-weight"); break;
    case "dismiss-check-in-prompt": {
      localStorage.setItem(LOCAL_KEYS.checkInPromptedOn, Nutrition.todayStr());
      render();
      break;
    }
    case "go-templates": navigate("templates"); break;
    case "go-exercise-library": navigate("exercise-library"); break;
    case "filter-library-group": {
      state.libraryFilter.group = el.dataset.group;
      render();
      break;
    }
    case "go-cardio": navigate("cardio"); break;
    case "open-cardio-day": navigate("cardio-day", { date: el.dataset.date }); break;
    case "save-cardio-day": {
      const calories = document.getElementById("cardio-calories").value.trim();
      const steps = document.getElementById("cardio-steps").value.trim();
      // Keep whatever a treadmill session wrote -- editing the numbers by hand
      // shouldn't erase the note saying where they came from.
      const existing = Store.getCardioEntry(el.dataset.date) || {};
      Store.setCardioEntry(el.dataset.date, { calories, steps, note: existing.note || "" });
      toast("Saved");
      navigate("cardio");
      break;
    }
    case "clear-cardio-day": {
      if (confirm("Clear the logged calories and steps for this day?")) {
        Store.setCardioEntry(el.dataset.date, { calories: "", steps: "" });
        toast("Cleared");
        navigate("cardio");
      }
      break;
    }
    case "add-template": addTemplate(el.dataset.template); break;
    case "load-template": loadTemplate(el.dataset.template); break;
    case "copy-template-for-client": copyTemplateForClient(el.dataset.template); break;
    case "copy-template-link": copyTemplateLink(el.dataset.template); break;
    case "switch-program-btn": {
      Store.switchProgram(el.dataset.program);
      render();
      break;
    }
    case "rename-program": {
      const programs = Store.listPrograms();
      const p = programs.find((p) => p.id === el.dataset.program);
      const name = prompt("Rename program", p?.name || "");
      if (name && name.trim()) {
        Store.renameProgram(el.dataset.program, name.trim());
        render();
      }
      break;
    }
    case "delete-program": {
      if (confirm("Delete this saved program and everything logged in it? This can't be undone. (Your other saved programs are unaffected.)")) {
        const ok = Store.deleteProgram(el.dataset.program);
        if (ok) toast("Program deleted");
        render();
      }
      break;
    }
    case "publish-program": {
      publishSavedProgram(el.dataset.program);
      break;
    }
    case "unpublish-program": {
      if (confirm("Unpublish this program? It'll no longer show up as an option when adding a new client. Clients who already started with it are unaffected.")) {
        unpublishSavedProgram(el.dataset.program, el.dataset.published);
      }
      break;
    }
    case "go-coach": {
      if (!isCoachDevice()) { toast("This device isn't set up as the coach"); break; }
      navigate(coachPinSatisfied() ? "coach" : "coach-pin");
      break;
    }
    case "submit-coach-pin": submitCoachPin(); break;
    case "set-coach-pin": setCoachPin(); break;
    case "clear-coach-pin": clearCoachPin(); break;
    case "run-sync-diagnostics": runDiagnostics(); break;
    case "relink-client": relinkClient(); break;
    case "copy-coach-access-link": {
      navigator.clipboard.writeText(el.dataset.link)
        .then(() => toast("Coach link copied — store it somewhere safe"))
        .catch(() => toast("Couldn't copy — select the link and copy manually"));
      break;
    }
    case "go-coach-add-client": resetClientProgramDraft(); navigate("coach-add-client"); break;
    case "go-coach-add-client-keep": navigate("coach-add-client"); break;
    case "customize-starting-program": customizeStartingProgram(); break;
    case "open-draft-day": navigate("coach-draft-day", { draftDayId: el.dataset.day }); break;
    case "save-draft-day": {
      draftAddingToDayId = null;
      toast("Day saved");
      navigate("coach-add-client");
      break;
    }
    case "clear-draft": {
      if (confirm("Clear the program you've built for this client?")) {
        const keep = { label: clientProgramDraft.label, price: clientProgramDraft.price };
        resetClientProgramDraft();
        clientProgramDraft.label = keep.label;
        clientProgramDraft.price = keep.price;
        render();
      }
      break;
    }
    case "draft-add-day": draftAddDay(); break;
    case "draft-remove-day": draftRemoveDay(el.dataset.day); break;
    case "draft-open-add-exercise": draftAddingToDayId = el.dataset.day; render(); break;
    case "draft-cancel-add-exercise": draftAddingToDayId = null; render(); break;
    case "draft-add-exercise": draftAddExercise(el.dataset.day); break;
    case "draft-remove-exercise": draftRemoveExercise(el.dataset.day, el.dataset.exercise); break;
    case "draft-move-exercise": draftMoveExercise(el.dataset.day, el.dataset.exercise, Number(el.dataset.dir)); break;
    case "toggle-draft-superset": {
      const day = draftFindDay(el.dataset.day);
      const ex = day && day.exercises.find((e) => e.id === el.dataset.exercise);
      if (ex) { ex.superset = !ex.superset; render(); }
      break;
    }
    case "confirm-add-coach-client": confirmAddCoachClient(); break;
    case "copy-coach-link": {
      navigator.clipboard.writeText(el.dataset.link)
        .then(() => toast("Link copied"))
        .catch(() => toast("Couldn't copy — select the link and copy manually"));
      break;
    }
    case "open-coach-client": navigate("coach-client", { clientId: el.dataset.client, clientLabel: el.dataset.label }); break;
    case "copy-existing-client-link": {
      const linkParams = new URLSearchParams({ client: el.dataset.client });
      const priceCents = Number(el.dataset.price) || 0;
      if (priceCents > 0) linkParams.set("price", String(priceCents));
      const link = `${window.location.origin}${window.location.pathname}?${linkParams.toString()}`;
      navigator.clipboard.writeText(link)
        .then(() => toast("Link copied"))
        .catch(() => toast("Couldn't copy — try again"));
      break;
    }
    case "mark-client-paid": {
      if (confirm(`Confirm you've received ${el.dataset.label}'s payment? Their app will unlock automatically.`)) {
        markClientPaid(getOrCreateCoachId(), el.dataset.client).catch(() => toast("Couldn't update — check your connection"));
      }
      break;
    }
    case "remove-coach-client": {
      if (confirm(`Remove ${el.dataset.label} and stop their workouts from syncing to you? Their own logged data stays on their device -- they'll just no longer have a coach connection.`)) {
        removeClientFromRoster(getOrCreateCoachId(), el.dataset.client).catch(() => toast("Couldn't remove — check your connection"));
      }
      break;
    }
    case "open-coach-client-day": navigate("coach-client-day", { clientId: el.dataset.client, clientLabel: el.dataset.label, dayId: el.dataset.day }); break;
    case "set-client-reminders": saveClientReminders(el.dataset.client, el.dataset.label, { enabled: el.dataset.enabled === "true" }); break;
    case "save-client-reminder-contact": saveClientReminders(el.dataset.client, el.dataset.label, {
      phone: document.getElementById("reminder-phone").value.trim(),
      email: document.getElementById("reminder-email").value.trim(),
    }); break;
    case "go-assign-program": navigate("coach-client-assign-program", { clientId: el.dataset.client, clientLabel: el.dataset.label }); break;
    case "confirm-assign-program": confirmAssignProgram(el.dataset.client, el.dataset.label); break;
    case "open-coach-client-exercise": navigate("coach-client-exercise", { clientId: el.dataset.client, clientLabel: el.dataset.label, dayId: el.dataset.day, exerciseId: el.dataset.exercise }); break;

    // ---- Nutrition ----
    case "nutrition-date-shift": navigate("nutrition", { dateStr: shiftDateStr(el.dataset.date, Number(el.dataset.delta)) }); break;
    case "go-nutrition-add": navigate("nutrition-add", { dateStr: el.dataset.date, mealType: el.dataset.meal }); break;
    case "go-nutrition-manual": navigate("nutrition-manual", { dateStr: el.dataset.date, mealType: el.dataset.meal }); break;
    case "go-nutrition-search": navigate("nutrition-search", { dateStr: el.dataset.date, mealType: el.dataset.meal }); break;
    case "go-nutrition-scan": navigate("nutrition-scan", { dateStr: el.dataset.date, mealType: el.dataset.meal }); break;
    case "retry-barcode-scan": startBarcodeScan(el.dataset.date, el.dataset.meal); break;
    case "go-nutrition-weight": navigate("nutrition-weight"); break;
    case "go-nutrition-goals": navigate("nutrition-goals"); break;
    case "go-nutrition-recipes": navigate("nutrition-recipes"); break;
    case "go-recipe-library": navigate("recipe-library"); break;
    case "open-library-recipe": navigate("recipe-library-item", { recipeId: el.dataset.recipe }); break;
    case "toggle-recipe-tag": {
      const tag = el.dataset.tag;
      const tags = state.recipeFilter.tags;
      state.recipeFilter.tags = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
      render();
      break;
    }
    case "set-recipe-slot": {
      state.recipeFilter.slot = el.dataset.slot;
      render();
      break;
    }
    case "clear-recipe-filters": {
      state.recipeFilter = { tags: [], slot: "All", query: "" };
      render();
      break;
    }
    case "log-library-recipe": logLibraryRecipe(el.dataset.recipe); break;
    case "save-library-recipe": saveLibraryRecipe(el.dataset.recipe); break;
    case "confirm-manual-food": confirmManualFood(el.dataset.date); break;
    case "do-food-search": doFoodSearch(el.dataset.date, el.dataset.meal); break;
    case "pick-search-food": {
      const food = (state.params.searchResults || [])[Number(el.dataset.index)];
      if (food) navigate("nutrition-review", { dateStr: state.params.dateStr, mealType: state.params.mealType, food });
      break;
    }
    case "pick-recent-food": {
      const food = Nutrition.getRecentFoods()[Number(el.dataset.index)];
      if (food) navigate("nutrition-review", { dateStr: state.params.dateStr, mealType: state.params.mealType, food });
      break;
    }
    case "confirm-review-food": confirmReviewFood(el.dataset.date); break;
    case "delete-diary-entry": {
      Nutrition.deleteDiaryEntry(el.dataset.date, el.dataset.entry);
      render();
      break;
    }
    case "confirm-log-weight": confirmLogWeight(); break;
    case "delete-weight-entry": {
      if (confirm("Delete this weigh-in?")) {
        Nutrition.deleteWeightEntry(el.dataset.id);
        render();
      }
      break;
    }
    case "set-weight-unit": {
      const g = Nutrition.getGoals();
      g.weightUnit = el.dataset.unit;
      Nutrition.setGoals(g);
      render();
      break;
    }
    case "confirm-save-goals": confirmSaveGoals(); break;
    case "new-recipe": recipeDraft = { name: "", servings: "1", ingredients: [] }; navigate("nutrition-recipe-new"); break;
    case "cancel-recipe-draft": {
      if (confirm("Discard this recipe? Any ingredients you've added will be lost.")) {
        recipeDraft = null;
        navigate("nutrition-recipes");
      }
      break;
    }
    case "remove-recipe-ingredient": {
      recipeDraft.ingredients.splice(Number(el.dataset.index), 1);
      render();
      break;
    }
    case "confirm-save-recipe": confirmSaveRecipe(); break;
    case "log-recipe": logRecipeToDiary(el.dataset.recipe); break;
    case "delete-recipe": {
      if (confirm("Delete this recipe?")) {
        Nutrition.deleteRecipe(el.dataset.recipe);
        render();
      }
      break;
    }
  }
}

function onInput(e) {
  const el = e.target;
  if (el.id === "rev-qty" && state.screen === "nutrition-review") {
    recomputeReviewPreview();
    return;
  }
  if (el.id === "recipe-name" && state.screen === "nutrition-recipe-new" && recipeDraft) {
    recipeDraft.name = el.value;
    return;
  }
  if (el.id === "recipe-servings" && state.screen === "nutrition-recipe-new" && recipeDraft) {
    recipeDraft.servings = el.value;
    return;
  }
  // Draft program builder on Add Client: these live in memory, not the Store,
  // so they need writing back on every keystroke or a re-render loses them.
  if (state.screen === "coach-draft-day" && clientProgramDraft) {
    const d = el.dataset;
    const dayId = d.day;
    const exId = d.draftExName || d.draftExSets || d.draftExReps || d.draftExRest;
    if (exId && dayId) {
      const day = draftFindDay(dayId);
      const ex = day && day.exercises.find((e) => e.id === exId);
      if (ex) {
        if (d.draftExName !== undefined) ex.name = el.value;
        else if (d.draftExSets !== undefined) ex.sets = el.value;
        else if (d.draftExReps !== undefined) ex.repGoal = el.value;
        else if (d.draftExRest !== undefined) ex.restTime = el.value;
      }
      return;
    }
    const draftDayId = d.draftDayName;
    if (draftDayId) {
      const day = draftFindDay(draftDayId);
      if (day) day.name = el.value;
      return;
    }
  }
  if (state.screen === "coach-add-client") {
    if (el.id === "draft-weeks" && clientProgramDraft) {
      clientProgramDraft.weeks = el.value;
      return;
    }
    if (el.id === "coach-client-label" && clientProgramDraft) {
      clientProgramDraft.label = el.value;
      return;
    }
    if (el.id === "coach-client-price" && clientProgramDraft) {
      clientProgramDraft.price = el.value;
      return;
    }
    if (el.id === "draft-program-name" && clientProgramDraft) {
      clientProgramDraft.programName = el.value;
      return;
    }
    const draftDayId = el.dataset.draftDayName;
    if (draftDayId) {
      const day = draftFindDay(draftDayId);
      if (day) day.name = el.value;
      return;
    }
  }
  if (state.screen === "nutrition-weight" && checkInDraft) {
    if (el.id === "weight-input") { checkInDraft.weight = el.value; return; }
    if (el.id === "checkin-sleep") { checkInDraft.sleep = el.value; return; }
    if (el.id === "weight-note") { checkInDraft.note = el.value; return; }
  }
  if (el.id === "recipe-lib-search" && state.screen === "recipe-library") {
    state.recipeFilter.query = el.value;
    const matches = filterRecipes(RECIPE_LIBRARY, state.recipeFilter);
    document.getElementById("recipe-lib-count").textContent = `${matches.length} recipe${matches.length === 1 ? "" : "s"}`;
    document.getElementById("recipe-lib-results").innerHTML = matches.map((r) => `
      <div class="card tappable" data-action="open-library-recipe" data-recipe="${esc(r.id)}">
        <div class="row">
          <div style="min-width:0;">
            <h3 style="font-size:15px;margin:0;">${esc(r.name)}</h3>
            <p style="margin:3px 0 0;">${r.calories} cal &middot; P${r.protein} C${r.carbs} F${r.fat} &middot; ${r.minutes} min</p>
            <p style="margin:3px 0 0;">${r.tags.map((t) => esc(t)).join(" &middot; ")}</p>
          </div>
          <span class="pill" style="flex:none;">Open</span>
        </div>
      </div>`).join("") || `<div class="empty"><p>Nothing matches all of those at once. Try removing a filter.</p></div>`;
    return;
  }
  if (el.id === "library-search" && state.screen === "exercise-library") {
    state.libraryFilter.query = el.value;
    const filtered = filterLibraryEntries(Store.getExerciseLibrary(), state.libraryFilter.query, state.libraryFilter.group);
    document.getElementById("library-results").innerHTML = renderLibraryRows(filtered);
    document.getElementById("library-count").textContent = `${filtered.length} exercise${filtered.length === 1 ? "" : "s"}${state.libraryFilter.group !== "All" ? ` in ${state.libraryFilter.group}` : ""}`;
    return;
  }
  if (el.id === "new-ex-name" && state.screen === "add-exercise") {
    const match = Store.getExerciseLibrary().find((entry) => entry.name.toLowerCase() === el.value.trim().toLowerCase());
    if (match) {
      const repEl = document.getElementById("new-ex-repgoal");
      const restEl = document.getElementById("new-ex-resttime");
      const videoEl = document.getElementById("new-ex-video");
      if (repEl && !repEl.value) repEl.value = match.repGoal || "";
      if (restEl && !restEl.value) restEl.value = match.restTime || "";
      if (videoEl && !videoEl.value) videoEl.value = match.videoUrl || "";
    }
    return;
  }
  if (!el.dataset.kind || state.screen !== "exercise") return;
  const { dayId, exerciseId } = state.params;
  const week = parseInt(el.dataset.week, 10);
  if (el.dataset.kind === "notes") {
    Store.updateExerciseWeek(dayId, exerciseId, week, { notes: el.value });
  } else if (el.dataset.kind === "reps") {
    const ex = Store.getExercise(dayId, exerciseId);
    const weekRow = ex.weeks.find((w) => w.week === week);
    const reps = [...(weekRow.reps || ex.setLabels.map(() => ""))];
    reps[+el.dataset.idx] = el.value;
    Store.updateExerciseWeek(dayId, exerciseId, week, { reps });
  } else {
    const ex = Store.getExercise(dayId, exerciseId);
    const weekRow = ex.weeks.find((w) => w.week === week);
    const values = [...weekRow.values];
    values[+el.dataset.idx] = el.value;
    Store.updateExerciseWeek(dayId, exerciseId, week, { values });
  }
}

function onChange(e) {
  const el = e.target;
  if (isManagedClient()) return; // the change-driven paths are all coach-only
  if (el.id === "csv-file" && el.files[0]) {
    handleImportFile(el.files[0]);
  }
  if (el.dataset.changeAction === "switch-program") {
    Store.switchProgram(el.value);
    render();
  }
}

tabbar.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  navigate(btn.dataset.route);
});

// ---------- NUTRITION (local-only: calories/macros, weight, diary, recipes) ----------

// A recipe being built, held here (not in state.params) because it's
// accumulated across several round trips through the manual-entry and
// search screens (each "+ Add ingredient" tap navigates away and back).
// Non-null only while actively building a new recipe.
let recipeDraft = null;

function macroRow(totals, goals) {
  const stat = (label, value, goal, unit) => {
    const g = Number(goal) || 0;
    const v = Number(value) || 0;
    const pct = g > 0 ? Math.min(100, Math.round((v / g) * 100)) : 0;
    return `
      <div class="macro-stat">
        <p class="macro-stat-label">${esc(label)}</p>
        <h3>${Math.round(v)}${g > 0 ? `<span class="macro-stat-goal">/${Math.round(g)}${unit}</span>` : unit}</h3>
        ${g > 0 ? `<div class="progress-track"><div class="progress-fill${pct >= 100 ? " complete" : ""}" style="width:${pct}%"></div></div>` : ""}
      </div>
    `;
  };
  return `
    <div class="macro-row">
      ${stat("Calories", totals.calories, goals.calorieGoal, "")}
      ${stat("Protein", totals.protein, goals.proteinGoal, "g")}
      ${stat("Carbs", totals.carbs, goals.carbGoal, "g")}
      ${stat("Fat", totals.fat, goals.fatGoal, "g")}
    </div>
  `;
}

function shiftDateStr(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function formatDiaryDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const todayStr = Nutrition.todayStr();
  if (dateStr === todayStr) return "Today";
  if (dateStr === shiftDateStr(todayStr, -1)) return "Yesterday";
  if (dateStr === shiftDateStr(todayStr, 1)) return "Tomorrow";
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function renderNutrition() {
  const dateStr = state.params.dateStr || Nutrition.todayStr();
  const day = Nutrition.getDiaryDay(dateStr);
  const totals = Nutrition.getDayTotals(dateStr);
  const goals = Nutrition.getGoals();
  const hasGoals = goals.calorieGoal || goals.proteinGoal || goals.carbGoal || goals.fatGoal;

  const mealSections = Nutrition.MEAL_TYPES.map((meal) => {
    const entries = day.entries.filter((e) => e.mealType === meal);
    const mealTotal = entries.reduce((n, e) => n + (e.calories || 0), 0);
    const rows = entries.map((e) => `
      <div class="row food-entry-row">
        <div>
          <h3 style="font-size:14px;">${esc(e.name)}${e.brand ? ` <span class="hint">(${esc(e.brand)})</span>` : ""}</h3>
          <p>${esc(e.qty)} ${esc(e.unit)} &middot; ${Math.round(e.calories)} cal &middot; P${Math.round(e.protein)} C${Math.round(e.carbs)} F${Math.round(e.fat)}</p>
        </div>
        <button class="btn ghost small" data-action="delete-diary-entry" data-date="${dateStr}" data-entry="${esc(e.id)}" aria-label="Delete">&#10005;</button>
      </div>
    `).join("");
    return `
      <div class="card">
        <div class="row">
          <h3>${esc(meal)}</h3>
          <span class="hint">${entries.length ? `${Math.round(mealTotal)} cal` : ""}</span>
        </div>
        ${rows}
        <button class="btn ghost small" style="margin-top:8px;width:auto;" data-action="go-nutrition-add" data-date="${dateStr}" data-meal="${esc(meal)}">+ Add to ${esc(meal.toLowerCase())}</button>
      </div>
    `;
  }).join("");

  return `
    ${topbar("Nutrition")}
    <div class="row" style="margin-bottom:12px;">
      <button class="btn ghost small" style="width:auto;" data-action="nutrition-date-shift" data-date="${dateStr}" data-delta="-1" aria-label="Previous day">&larr;</button>
      <span class="source-chip" style="flex:1;text-align:center;">${formatDiaryDate(dateStr)}</span>
      <button class="btn ghost small" style="width:auto;" data-action="nutrition-date-shift" data-date="${dateStr}" data-delta="1" aria-label="Next day">&rarr;</button>
    </div>
    <div class="card">
      ${macroRow(totals, goals)}
      ${hasGoals ? "" : `<p class="hint" style="margin-top:10px;">No goals set yet. <a href="#" data-action="go-nutrition-goals">Set calorie &amp; macro goals</a> to track progress here.</p>`}
    </div>
    ${mealSections}
    <button class="btn primary" data-action="go-recipe-library">Meal ideas</button>
    <div style="height:8px"></div>
    <div class="btn-row">
      <button class="btn" data-action="go-nutrition-weight">Check in</button>
      <button class="btn" data-action="go-nutrition-recipes">My recipes</button>
      <button class="btn" data-action="go-nutrition-goals">Goals</button>
    </div>
  `;
}

function renderNutritionAdd() {
  const { dateStr, mealType } = state.params;
  const recent = Nutrition.getRecentFoods().slice(0, 8);
  const recentRows = recent.map((f, i) => `
    <div class="card tappable" data-action="pick-recent-food" data-index="${i}">
      <h3 style="font-size:14px;">${esc(f.name)}${f.brand ? ` <span class="hint">(${esc(f.brand)})</span>` : ""}</h3>
      <p>${esc(f.qty)} ${esc(f.unit)} &middot; ${Math.round(f.calories)} cal</p>
    </div>
  `).join("");
  return `
    ${topbar(`Add to ${esc(mealType || "diary")}`, { back: true })}
    <div class="btn-row">
      <button class="btn primary" data-action="go-nutrition-scan" data-date="${esc(dateStr)}" data-meal="${esc(mealType)}">Scan barcode</button>
      <button class="btn" data-action="go-nutrition-search" data-date="${esc(dateStr)}" data-meal="${esc(mealType)}">Search by name</button>
    </div>
    <div style="height:8px"></div>
    <button class="btn" data-action="go-nutrition-manual" data-date="${esc(dateStr)}" data-meal="${esc(mealType)}">Enter manually</button>
    ${recentRows ? `<div style="height:14px"></div><p class="hint" style="margin-bottom:8px;">Recently logged</p>${recentRows}` : ""}
  `;
}

function renderNutritionManual() {
  const { dateStr, mealType } = state.params;
  return `
    ${topbar("Enter manually", { back: true })}
    <div class="card">
      <label for="man-name">Food name *</label>
      <input type="text" id="man-name" placeholder="e.g. Grilled chicken breast" />
      <label for="man-brand">Brand (optional)</label>
      <input type="text" id="man-brand" placeholder="e.g. Trader Joe's" />
      <div class="row">
        <div style="flex:1;">
          <label for="man-qty">Quantity</label>
          <input type="text" id="man-qty" value="1" inputmode="decimal" />
        </div>
        <div style="flex:1;">
          <label for="man-unit">Unit</label>
          <input type="text" id="man-unit" value="serving" />
        </div>
      </div>
      <label for="man-calories">Calories</label>
      <input type="text" id="man-calories" inputmode="decimal" placeholder="0" />
      <div class="row">
        <div style="flex:1;">
          <label for="man-protein">Protein (g)</label>
          <input type="text" id="man-protein" inputmode="decimal" placeholder="0" />
        </div>
        <div style="flex:1;">
          <label for="man-carbs">Carbs (g)</label>
          <input type="text" id="man-carbs" inputmode="decimal" placeholder="0" />
        </div>
        <div style="flex:1;">
          <label for="man-fat">Fat (g)</label>
          <input type="text" id="man-fat" inputmode="decimal" placeholder="0" />
        </div>
      </div>
      <label for="man-meal">Meal</label>
      <select id="man-meal">${Nutrition.MEAL_TYPES.map((m) => `<option value="${esc(m)}" ${m === mealType ? "selected" : ""}>${esc(m)}</option>`).join("")}</select>
    </div>
    <button class="btn primary" data-action="confirm-manual-food" data-date="${esc(dateStr)}">${recipeDraft ? "Add to recipe" : "Log it"}</button>
  `;
}

function confirmManualFood(dateStr) {
  const name = document.getElementById("man-name").value.trim();
  if (!name) { toast("Give it a name"); return; }
  const entry = {
    name,
    brand: document.getElementById("man-brand").value.trim(),
    qty: document.getElementById("man-qty").value.trim() || "1",
    unit: document.getElementById("man-unit").value.trim() || "serving",
    calories: parseFloat(document.getElementById("man-calories").value) || 0,
    protein: parseFloat(document.getElementById("man-protein").value) || 0,
    carbs: parseFloat(document.getElementById("man-carbs").value) || 0,
    fat: parseFloat(document.getElementById("man-fat").value) || 0,
    mealType: document.getElementById("man-meal").value,
    source: "manual",
  };
  if (recipeDraft) {
    recipeDraft.ingredients.push(entry);
    toast(`"${name}" added to recipe`);
    navigate("nutrition-recipe-new");
    return;
  }
  Nutrition.addDiaryEntry(dateStr, entry);
  toast(`"${name}" logged`);
  navigate("nutrition", { dateStr });
}

function renderNutritionSearch() {
  const { dateStr, mealType, searchResults, searchQuery, searching } = state.params;
  const results = (searchResults || []).map((f, i) => `
    <div class="card tappable" data-action="pick-search-food" data-index="${i}">
      <h3 style="font-size:14px;">${esc(f.name)}${f.brand ? ` <span class="hint">(${esc(f.brand)})</span>` : ""}</h3>
      <p>${f.per100g.calories !== null ? `${Math.round(f.per100g.calories)} cal / 100g` : "Nutrition info incomplete"}</p>
    </div>
  `).join("");
  return `
    ${topbar("Search food", { back: true })}
    <div class="card">
      <label for="food-search-input">Food name</label>
      <input type="text" id="food-search-input" placeholder="e.g. greek yogurt" value="${esc(searchQuery || "")}" />
      <div style="height:10px"></div>
      <button class="btn primary" data-action="do-food-search" data-date="${esc(dateStr)}" data-meal="${esc(mealType)}">Search</button>
    </div>
    ${searching ? `<p class="hint" style="text-align:center;">Searching...</p>` : ""}
    ${results || (searchResults ? `<div class="empty"><p>No results. Try a simpler search term, or enter it manually.</p></div>` : "")}
  `;
}

async function doFoodSearch(dateStr, mealType) {
  const query = document.getElementById("food-search-input").value.trim();
  if (!query) { toast("Type something to search for"); return; }
  navigate("nutrition-search", { dateStr, mealType, searchQuery: query, searching: true });
  const results = await searchFoodByName(query);
  if (state.screen !== "nutrition-search") return; // navigated away while waiting
  navigate("nutrition-search", { dateStr, mealType, searchQuery: query, searchResults: results, searching: false });
}

let zxingReader = null;
function ensureZXingLoaded() {
  return new Promise((resolve, reject) => {
    if (window.ZXing) return resolve();
    const script = document.createElement("script");
    script.src = "vendor/zxing/zxing-library.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("load failed"));
    document.head.appendChild(script);
  });
}

function stopBarcodeScan() {
  if (zxingReader) {
    try { zxingReader.reset(); } catch { /* already stopped */ }
    zxingReader = null;
  }
}

// getUserMedia rejects with a handful of named errors, and each one needs a
// different thing from the person holding the phone.
function cameraErrorMessage(err) {
  const name = (err && err.name) || "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera permission was blocked. Tap the lock or ⋮ icon next to the web address, allow Camera, then reload and try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") {
    return "No camera found on this device. Use search or manual entry instead.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Another app is using the camera. Close it (or your camera app) and try again.";
  }
  return `Couldn't start the camera${name ? ` (${name})` : ""}. Try again, or use search / manual entry instead.`;
}

async function startBarcodeScan(dateStr, mealType) {
  const statusEl = document.getElementById("scan-status");
  const retryEl = document.getElementById("scan-retry");
  const say = (msg, canRetry) => {
    if (statusEl) statusEl.textContent = msg;
    if (retryEl) retryEl.hidden = !canRetry;
  };

  stopBarcodeScan();
  say("Starting the camera…", false);

  // The camera API is only exposed on https (or localhost). Served over plain
  // http it isn't merely blocked — navigator.mediaDevices is undefined.
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    say("The camera needs a secure (https) connection. Open the app at https://trainsemperfit365.com/app/ and try again, or use search / manual entry.", false);
    return;
  }

  try {
    await ensureZXingLoaded();
  } catch {
    say("Couldn't load the scanner. Check your connection and try again, or use search / manual entry.", true);
    return;
  }

  // Open the camera ourselves rather than letting the reader pick a device by
  // name: until permission has actually been granted the device list comes back
  // unlabelled, so "find the one called back" matches nothing and we end up
  // guessing — usually at the selfie camera, sometimes at no camera at all.
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
  } catch (err) {
    say(cameraErrorMessage(err), true);
    return;
  }

  try {
    zxingReader = new window.ZXing.BrowserMultiFormatReader();
    await zxingReader.decodeFromStream(stream, "scan-video", (result) => {
      if (result) handleBarcodeDetected(result.getText(), dateStr, mealType);
    });
    say("Point the camera at a barcode.", false);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    stopBarcodeScan();
    say(cameraErrorMessage(err), true);
  }
}

async function handleBarcodeDetected(barcode, dateStr, mealType) {
  stopBarcodeScan();
  toast("Looking up barcode…");
  const food = await lookupBarcode(barcode);
  if (!food) {
    toast("Couldn't find that product — try search or manual entry");
    navigate("nutrition-add", { dateStr, mealType });
    return;
  }
  navigate("nutrition-review", { dateStr, mealType, food });
}

function renderNutritionScan() {
  const { dateStr, mealType } = state.params;
  // Kicked off after render (the <video> element must exist in the DOM first).
  setTimeout(() => startBarcodeScan(dateStr, mealType), 0);
  return `
    ${topbar("Scan barcode", { back: true })}
    <div class="scan-video-wrap">
      <video id="scan-video" autoplay muted playsinline></video>
    </div>
    <p id="scan-status" class="hint" style="text-align:center;margin-top:10px;">Starting the camera…</p>
    <button class="btn" id="scan-retry" data-action="retry-barcode-scan" data-date="${esc(dateStr)}" data-meal="${esc(mealType)}" hidden>Try the camera again</button>
    <button class="btn" data-action="go-nutrition-manual" data-date="${esc(dateStr)}" data-meal="${esc(mealType)}">Enter manually instead</button>
  `;
}

function renderNutritionReview() {
  const { dateStr, mealType, food } = state.params;
  const usingServing = !!food.perServing;
  const baseQty = food.qty !== undefined ? Number(food.qty) : (usingServing ? 1 : 100);
  const baseUnit = food.unit || (usingServing ? "serving" : "g");
  const per = food.calories !== undefined
    ? { calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat } // recent-food shape, already for baseQty
    : (usingServing ? food.perServing : food.per100g);
  const perBaseQty = usingServing || food.calories !== undefined ? baseQty : 100;
  return `
    ${topbar("Review", { back: true })}
    <div class="card">
      <h3>${esc(food.name)}</h3>
      ${food.brand ? `<p class="hint">${esc(food.brand)}</p>` : ""}
      <div class="row">
        <div style="flex:1;">
          <label for="rev-qty">Quantity</label>
          <input type="text" id="rev-qty" inputmode="decimal" value="${esc(String(baseQty))}" data-per-base-qty="${perBaseQty}" data-per-cal="${per.calories || 0}" data-per-protein="${per.protein || 0}" data-per-carbs="${per.carbs || 0}" data-per-fat="${per.fat || 0}" />
        </div>
        <div style="flex:1;">
          <label for="rev-unit">Unit</label>
          <input type="text" id="rev-unit" value="${esc(baseUnit)}" />
        </div>
      </div>
      <div id="rev-macro-preview">${macroRow({ calories: per.calories, protein: per.protein, carbs: per.carbs, fat: per.fat }, {})}</div>
      <label for="rev-meal">Meal</label>
      <select id="rev-meal">${Nutrition.MEAL_TYPES.map((m) => `<option value="${esc(m)}" ${m === mealType ? "selected" : ""}>${esc(m)}</option>`).join("")}</select>
    </div>
    <button class="btn primary" data-action="confirm-review-food" data-date="${esc(dateStr)}">${recipeDraft ? "Add to recipe" : "Log it"}</button>
  `;
}

function recomputeReviewPreview() {
  const qtyEl = document.getElementById("rev-qty");
  if (!qtyEl) return;
  const qty = parseFloat(qtyEl.value) || 0;
  const baseQty = parseFloat(qtyEl.dataset.perBaseQty) || 1;
  const scale = baseQty > 0 ? qty / baseQty : 0;
  const totals = {
    calories: (parseFloat(qtyEl.dataset.perCal) || 0) * scale,
    protein: (parseFloat(qtyEl.dataset.perProtein) || 0) * scale,
    carbs: (parseFloat(qtyEl.dataset.perCarbs) || 0) * scale,
    fat: (parseFloat(qtyEl.dataset.perFat) || 0) * scale,
  };
  const preview = document.getElementById("rev-macro-preview");
  if (preview) preview.innerHTML = macroRow(totals, {});
}

function confirmReviewFood(dateStr) {
  const { food } = state.params;
  const qtyEl = document.getElementById("rev-qty");
  const qty = parseFloat(qtyEl.value) || 0;
  const baseQty = parseFloat(qtyEl.dataset.perBaseQty) || 1;
  const scale = baseQty > 0 ? qty / baseQty : 0;
  const entry = {
    name: food.name,
    brand: food.brand || "",
    qty: qtyEl.value.trim() || "1",
    unit: document.getElementById("rev-unit").value.trim() || "serving",
    calories: (parseFloat(qtyEl.dataset.perCal) || 0) * scale,
    protein: (parseFloat(qtyEl.dataset.perProtein) || 0) * scale,
    carbs: (parseFloat(qtyEl.dataset.perCarbs) || 0) * scale,
    fat: (parseFloat(qtyEl.dataset.perFat) || 0) * scale,
    mealType: document.getElementById("rev-meal").value,
    source: food.barcode ? "barcode" : "search",
  };
  if (recipeDraft) {
    recipeDraft.ingredients.push(entry);
    toast(`"${entry.name}" added to recipe`);
    navigate("nutrition-recipe-new");
    return;
  }
  Nutrition.addDiaryEntry(dateStr, entry);
  toast(`"${entry.name}" logged`);
  navigate("nutrition", { dateStr });
}

// The four things that explain a scale that isn't moving. Kept deliberately
// short and tap-only (bar the weight itself): a check-in nobody fills in is
// worth nothing, and every extra field costs completion.
const ENERGY_SCALE = [
  { v: 1, label: "Drained" },
  { v: 2, label: "Low" },
  { v: 3, label: "OK" },
  { v: 4, label: "Good" },
  { v: 5, label: "Great" },
];
const HUNGER_SCALE = [
  { v: 1, label: "Starving" },
  { v: 2, label: "Hungry" },
  { v: 3, label: "Fine" },
  { v: 4, label: "Satisfied" },
  { v: 5, label: "Stuffed" },
];

// Tapping a chip re-renders the whole screen, so every field has to live here
// and be written back as a value -- otherwise picking an energy level silently
// clears the weight they just typed.
let checkInDraft = null;
function ensureCheckInDraft() {
  if (!checkInDraft) checkInDraft = { weight: "", sleep: "", note: "", energy: null, hunger: null };
  return checkInDraft;
}

function scaleChips(name, scale, selected) {
  return `<div class="chip-row">${scale.map((s) => `
    <button class="chip${selected === s.v ? " on" : ""}" data-action="set-checkin-scale" data-field="${esc(name)}" data-value="${s.v}">${esc(s.label)}</button>
  `).join("")}</div>`;
}

function checkInSummaryLine(w) {
  const bits = [];
  if (w.sleepHours) bits.push(`${esc(String(w.sleepHours))}h sleep`);
  const e = ENERGY_SCALE.find((s) => s.v === w.energy);
  if (e) bits.push(`energy ${esc(e.label.toLowerCase())}`);
  const h = HUNGER_SCALE.find((s) => s.v === w.hunger);
  if (h) bits.push(`hunger ${esc(h.label.toLowerCase())}`);
  return bits.join(" &middot; ");
}

function renderNutritionWeight() {
  const log = Nutrition.getWeightLog();
  const goals = Nutrition.getGoals();
  const unit = goals.weightUnit || "lb";
  const draft = ensureCheckInDraft();
  const rows = log.slice().reverse().map((w, i, arr) => {
    const previous = arr[i + 1];
    const delta = previous ? Math.round((w.weight - previous.weight) * 10) / 10 : null;
    const summary = checkInSummaryLine(w);
    return `
    <div class="row">
      <div style="min-width:0;">
        <h3 style="font-size:14px;">${w.weight} ${esc(unit)}${delta !== null && delta !== 0 ? ` <span class="hint" style="font-weight:400;">${delta > 0 ? "+" : ""}${delta}</span>` : ""}</h3>
        <p>${esc(w.date)}</p>
        ${summary ? `<p>${summary}</p>` : ""}
        ${w.note ? `<p>&ldquo;${esc(w.note)}&rdquo;</p>` : ""}
      </div>
      <button class="btn ghost small" data-action="delete-weight-entry" data-id="${esc(w.id)}" aria-label="Delete">&#10005;</button>
    </div>`;
  }).join("");
  const latest = log.length ? log[log.length - 1] : null;
  const since = Nutrition.daysSinceLastCheckIn();
  return `
    ${topbar("Check in", { back: true })}
    <div class="card">
      ${latest ? `<p>Last check-in: <strong>${latest.weight} ${esc(unit)}</strong> &middot; ${since === 0 ? "today" : since === 1 ? "yesterday" : `${since} days ago`}</p>` : `<p class="hint">No check-ins yet &mdash; this is the one that everything else gets measured against.</p>`}
      ${goals.weightGoal ? `<p>Goal: <strong>${esc(goals.weightGoal)} ${esc(unit)}</strong></p>` : `<p class="hint">No weight goal set -- <a href="#" data-action="go-nutrition-goals">set one</a>.</p>`}
    </div>
    <div class="card">
      <label for="weight-date">Date</label>
      <input type="date" id="weight-date" value="${Nutrition.todayStr()}" />
      <label for="weight-input">Weight (${esc(unit)})</label>
      <input type="text" id="weight-input" inputmode="decimal" value="${esc(draft.weight || "")}" placeholder="e.g. 165" />

      <label for="checkin-sleep">Hours of sleep last night</label>
      <input type="text" id="checkin-sleep" inputmode="decimal" value="${esc(draft.sleep || "")}" placeholder="e.g. 7" />
      <p class="hint" style="margin:4px 0 0;">Short sleep drives hunger up and training quality down &mdash; it is usually the first thing to look at when the scale stalls.</p>

      <div style="height:12px"></div>
      <label>Energy this week</label>
      ${scaleChips("energy", ENERGY_SCALE, draft.energy)}

      <div style="height:6px"></div>
      <label>Hunger this week</label>
      ${scaleChips("hunger", HUNGER_SCALE, draft.hunger)}

      <div style="height:6px"></div>
      <label for="weight-note">Anything your coach should know (optional)</label>
      <input type="text" id="weight-note" value="${esc(draft.note || "")}" placeholder="e.g. travelled all week, knee felt off" />
      <div style="height:10px"></div>
      <button class="btn primary" data-action="confirm-log-weight">Save check-in</button>
    </div>
    ${rows || ""}
  `;
}

function confirmLogWeight() {
  const dateStr = document.getElementById("weight-date").value || Nutrition.todayStr();
  const weight = parseFloat(document.getElementById("weight-input").value);
  if (!weight || weight <= 0) { toast("Enter a valid weight"); return; }
  const note = document.getElementById("weight-note").value.trim();
  const sleepRaw = document.getElementById("checkin-sleep").value.trim();
  const sleepHours = sleepRaw ? parseFloat(sleepRaw) : null;
  const draft = ensureCheckInDraft();
  Nutrition.logWeight(dateStr, weight, note, {
    sleepHours: sleepHours && sleepHours > 0 && sleepHours <= 24 ? Math.round(sleepHours * 10) / 10 : null,
    energy: draft.energy,
    hunger: draft.hunger,
  });
  checkInDraft = null;
  localStorage.setItem(LOCAL_KEYS.checkInPromptedOn, Nutrition.todayStr());
  pushCheckInsToCoach();
  toast("Check-in saved");
  render();
}

function renderNutritionGoals() {
  const g = Nutrition.getGoals();
  return `
    ${topbar("Nutrition goals", { back: true })}
    <div class="card">
      <h3>Daily targets</h3>
      <label for="goal-calories">Calorie goal</label>
      <input type="text" id="goal-calories" inputmode="decimal" value="${esc(g.calorieGoal)}" placeholder="e.g. 2200" />
      <div class="row">
        <div style="flex:1;">
          <label for="goal-protein">Protein (g)</label>
          <input type="text" id="goal-protein" inputmode="decimal" value="${esc(g.proteinGoal)}" placeholder="e.g. 160" />
        </div>
        <div style="flex:1;">
          <label for="goal-carbs">Carbs (g)</label>
          <input type="text" id="goal-carbs" inputmode="decimal" value="${esc(g.carbGoal)}" placeholder="e.g. 220" />
        </div>
        <div style="flex:1;">
          <label for="goal-fat">Fat (g)</label>
          <input type="text" id="goal-fat" inputmode="decimal" value="${esc(g.fatGoal)}" placeholder="e.g. 70" />
        </div>
      </div>
    </div>
    <div class="card">
      <h3>Weight</h3>
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn ${g.weightUnit !== "kg" ? "primary" : ""}" data-action="set-weight-unit" data-unit="lb">lb</button>
        <button class="btn ${g.weightUnit === "kg" ? "primary" : ""}" data-action="set-weight-unit" data-unit="kg">kg</button>
      </div>
      <label for="goal-start-weight">Starting weight</label>
      <input type="text" id="goal-start-weight" inputmode="decimal" value="${esc(g.startWeight)}" />
      <label for="goal-weight">Goal weight</label>
      <input type="text" id="goal-weight" inputmode="decimal" value="${esc(g.weightGoal)}" />
    </div>
    <button class="btn primary" data-action="confirm-save-goals">Save goals</button>
  `;
}

function confirmSaveGoals() {
  const g = Nutrition.getGoals();
  Nutrition.setGoals({
    calorieGoal: document.getElementById("goal-calories").value.trim(),
    proteinGoal: document.getElementById("goal-protein").value.trim(),
    carbGoal: document.getElementById("goal-carbs").value.trim(),
    fatGoal: document.getElementById("goal-fat").value.trim(),
    weightUnit: g.weightUnit || "lb",
    startWeight: document.getElementById("goal-start-weight").value.trim(),
    weightGoal: document.getElementById("goal-weight").value.trim(),
  });
  toast("Goals saved");
  navigate("nutrition");
}

// ---------- RECIPE LIBRARY (bundled meal ideas, filterable by how you eat) ----------

function renderRecipeLibrary() {
  const f = state.recipeFilter;
  const matches = filterRecipes(RECIPE_LIBRARY, f);

  const tagChips = DIET_TAGS.map((t) => `
    <button class="chip${f.tags.includes(t) ? " on" : ""}" data-action="toggle-recipe-tag" data-tag="${esc(t)}">${esc(t)}</button>
  `).join("");

  const slotChips = ["All", ...MEAL_SLOTS].map((sl) => `
    <button class="chip${f.slot === sl ? " on" : ""}" data-action="set-recipe-slot" data-slot="${esc(sl)}">${esc(sl)}</button>
  `).join("");

  const rows = matches.map((r) => `
    <div class="card tappable" data-action="open-library-recipe" data-recipe="${esc(r.id)}">
      <div class="row">
        <div style="min-width:0;">
          <h3 style="font-size:15px;margin:0;">${esc(r.name)}</h3>
          <p style="margin:3px 0 0;">${r.calories} cal &middot; P${r.protein} C${r.carbs} F${r.fat} &middot; ${r.minutes} min</p>
          <p style="margin:3px 0 0;">${r.tags.map((t) => esc(t)).join(" &middot; ")}</p>
        </div>
        <span class="pill" style="flex:none;">Open</span>
      </div>
    </div>
  `).join("");

  return `
    ${topbar("Meal ideas", { back: true })}
    <div class="card">
      <input type="text" id="recipe-lib-search" value="${esc(f.query)}" placeholder="Search by name or ingredient" autocomplete="off" />
      <div style="height:10px"></div>
      <label>Meal</label>
      <div class="chip-row">${slotChips}</div>
      <div style="height:10px"></div>
      <label>How you eat</label>
      <div class="chip-row">${tagChips}</div>
      ${f.tags.length || f.slot !== "All" || f.query ? `<div style="height:10px"></div><button class="btn ghost small" data-action="clear-recipe-filters">Clear filters</button>` : ""}
    </div>
    <p class="hint" id="recipe-lib-count" style="margin:0 0 10px 2px;">${matches.length} recipe${matches.length === 1 ? "" : "s"}</p>
    <div id="recipe-lib-results">${rows || `<div class="empty"><p>Nothing matches all of those at once. Try removing a filter.</p></div>`}</div>
  `;
}

function renderLibraryRecipe() {
  const recipe = RECIPE_LIBRARY.find((r) => r.id === state.params.recipeId);
  if (!recipe) return `${topbar("Recipe", { back: true })}<div class="empty"><p>Recipe not found.</p></div>`;
  return `
    ${topbar(recipe.name, { back: true })}
    <div class="card">
      <div class="row" style="align-items:baseline;">
        <h3 style="margin:0;">${esc(recipe.name)}</h3>
        <span class="source-chip">${recipe.minutes} min</span>
      </div>
      <p style="margin:6px 0 0;">${recipe.tags.map((t) => esc(t)).join(" &middot; ")}</p>
      <div style="height:10px"></div>
      ${macroRow({ calories: recipe.calories, protein: recipe.protein, carbs: recipe.carbs, fat: recipe.fat }, {})}
      <p class="hint" style="margin:8px 0 0;">Per serving &middot; makes ${recipe.servings}. Estimated from standard portions &mdash; weigh your own and adjust if you're tracking tightly.</p>
    </div>
    <div class="card">
      <h3>Ingredients</h3>
      <ul style="margin:8px 0 0;padding-left:20px;line-height:1.7;">
        ${recipe.ingredients.map((i) => `<li>${esc(i)}</li>`).join("")}
      </ul>
    </div>
    <div class="card">
      <h3>Method</h3>
      <ol style="margin:8px 0 0;padding-left:20px;line-height:1.7;">
        ${recipe.steps.map((st) => `<li>${esc(st)}</li>`).join("")}
      </ol>
    </div>
    ${recipe.tip ? `<div class="card"><h3>Coach's note</h3><p style="margin:6px 0 0;">${esc(recipe.tip)}</p></div>` : ""}
    <div class="card">
      <label for="lib-recipe-meal">Log one serving to</label>
      <select id="lib-recipe-meal">${Nutrition.MEAL_TYPES.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("")}</select>
      <div style="height:10px"></div>
      <button class="btn primary" data-action="log-library-recipe" data-recipe="${esc(recipe.id)}">Log it</button>
      <div style="height:8px"></div>
      <button class="btn" data-action="save-library-recipe" data-recipe="${esc(recipe.id)}">Save to my recipes</button>
    </div>
  `;
}

function logLibraryRecipe(recipeId) {
  const recipe = RECIPE_LIBRARY.find((r) => r.id === recipeId);
  if (!recipe) return;
  const mealType = document.getElementById("lib-recipe-meal").value;
  Nutrition.addDiaryEntry(Nutrition.todayStr(), {
    mealType,
    name: recipe.name,
    brand: "",
    qty: "1",
    unit: "serving",
    calories: recipe.calories,
    protein: recipe.protein,
    carbs: recipe.carbs,
    fat: recipe.fat,
    source: "library",
  });
  toast(`Logged to ${mealType}`);
  navigate("nutrition", { dateStr: Nutrition.todayStr() });
}

/** Copies a library recipe into the client's own saved recipes as a single
 * combined ingredient, so it shows up beside the ones they built themselves
 * and can be quick-logged the same way. */
function saveLibraryRecipe(recipeId) {
  const recipe = RECIPE_LIBRARY.find((r) => r.id === recipeId);
  if (!recipe) return;
  Nutrition.saveRecipe(recipe.name, String(recipe.servings), [{
    name: `${recipe.name} (whole batch)`,
    calories: recipe.calories * recipe.servings,
    protein: recipe.protein * recipe.servings,
    carbs: recipe.carbs * recipe.servings,
    fat: recipe.fat * recipe.servings,
  }]);
  toast(`"${recipe.name}" saved to your recipes`);
}

function renderNutritionRecipes() {
  if (recipeDraft) return renderNutritionRecipeNew();
  const recipes = Nutrition.getRecipes();
  const rows = recipes.map((r) => {
    const per = Nutrition.perServing(r);
    return `
      <div class="card tappable" data-action="log-recipe" data-recipe="${esc(r.id)}">
        <div class="row">
          <div>
            <h3 style="font-size:14px;">${esc(r.name)}</h3>
            <p>${r.servings} serving${r.servings === 1 ? "" : "s"} &middot; ${Math.round(per.calories)} cal/serving &middot; P${Math.round(per.protein)} C${Math.round(per.carbs)} F${Math.round(per.fat)}</p>
          </div>
          <button class="btn ghost small" data-action="delete-recipe" data-recipe="${esc(r.id)}" aria-label="Delete">&#10005;</button>
        </div>
      </div>
    `;
  }).join("");
  return `
    ${topbar("Recipes", { back: true })}
    <button class="btn primary" data-action="new-recipe">+ New recipe</button>
    <div style="height:12px"></div>
    ${rows || `<div class="empty"><p>No recipes saved yet. Build one from ingredients with their macros, then quick-log a serving any time.</p></div>`}
  `;
}

function renderNutritionRecipeNew() {
  if (!recipeDraft) recipeDraft = { name: "", servings: "1", ingredients: [] };
  const ingredientRows = recipeDraft.ingredients.map((ing, i) => `
    <div class="row">
      <div>
        <h3 style="font-size:14px;">${esc(ing.name)}</h3>
        <p>${Math.round(ing.calories)} cal &middot; P${Math.round(ing.protein)} C${Math.round(ing.carbs)} F${Math.round(ing.fat)}</p>
      </div>
      <button class="btn ghost small" data-action="remove-recipe-ingredient" data-index="${i}" aria-label="Remove">&#10005;</button>
    </div>
  `).join("");
  const totals = recipeDraft.ingredients.reduce((t, i) => ({
    calories: t.calories + (i.calories || 0),
    protein: t.protein + (i.protein || 0),
    carbs: t.carbs + (i.carbs || 0),
    fat: t.fat + (i.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  return `
    ${topbar("New recipe", { back: true })}
    <div class="card">
      <label for="recipe-name">Recipe name</label>
      <input type="text" id="recipe-name" value="${esc(recipeDraft.name)}" placeholder="e.g. Protein overnight oats" />
      <label for="recipe-servings">Servings</label>
      <input type="text" id="recipe-servings" inputmode="numeric" value="${esc(recipeDraft.servings)}" />
    </div>
    <div class="card">
      <h3>Ingredients</h3>
      ${ingredientRows || `<p class="hint">None added yet.</p>`}
      <div class="btn-row" style="margin-top:10px;">
        <button class="btn" data-action="go-nutrition-manual" data-date="" data-meal="">+ Add ingredient (manual)</button>
        <button class="btn" data-action="go-nutrition-search" data-date="" data-meal="">+ Add ingredient (search)</button>
      </div>
      ${recipeDraft.ingredients.length ? `<p class="hint" style="margin-top:10px;">Total: ${Math.round(totals.calories)} cal &middot; P${Math.round(totals.protein)} C${Math.round(totals.carbs)} F${Math.round(totals.fat)}</p>` : ""}
    </div>
    <button class="btn primary" data-action="confirm-save-recipe" ${recipeDraft.ingredients.length ? "" : "disabled"}>Save recipe</button>
    <div style="height:8px"></div>
    <button class="btn ghost" data-action="cancel-recipe-draft">Cancel</button>
  `;
}

function confirmSaveRecipe() {
  const name = document.getElementById("recipe-name").value.trim();
  if (!name) { toast("Give the recipe a name"); return; }
  const servings = document.getElementById("recipe-servings").value.trim() || "1";
  if (!recipeDraft.ingredients.length) { toast("Add at least one ingredient"); return; }
  Nutrition.saveRecipe(name, servings, recipeDraft.ingredients);
  recipeDraft = null;
  navigate("nutrition-recipes");
  toast(`"${name}" saved`);
}

function logRecipeToDiary(recipeId) {
  const recipe = Nutrition.getRecipe(recipeId);
  if (!recipe) return;
  const per = Nutrition.perServing(recipe);
  Nutrition.addDiaryEntry(Nutrition.todayStr(), {
    name: recipe.name,
    qty: "1",
    unit: "serving",
    calories: per.calories,
    protein: per.protein,
    carbs: per.carbs,
    fat: per.fat,
    mealType: "Snacks",
    source: "recipe",
  });
  toast(`"${recipe.name}" logged to today`);
  navigate("nutrition");
}

// ---------- boot ----------

function seedIfEmpty() {
  const urlParams = new URLSearchParams(window.location.search);
  const templateId = urlParams.get("template");
  if (templateId) {
    urlParams.delete("template");
    const rest = urlParams.toString();
    history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
  }
  if (Store.getProgram()) return; // never overwrite a visitor's own data
  try {
    const template = PROGRAM_TEMPLATES.find((t) => t.id === templateId);
    const sheetText = template ? template.sheetText : SEED_SHEET_TEXT;
    const days = parseWorkoutSheets(sheetText);
    days.forEach((day) => Store.addDay({ name: day.dayTitle || "Workout", source: null, exercises: day.exercises }));
  } catch {
    // if the bundled seed ever fails to parse, just fall back to the normal empty state
  }
}

/** A brand-new visitor's link can carry ?cp=<id> pointing at one of their
 * coach's own published programs (see publishSavedProgram) instead of a
 * built-in template. Best-effort and timeout-guarded so a slow/offline
 * network never holds up boot -- falls through to seedIfEmpty()'s normal
 * default seed if the fetch doesn't come back in time. */
async function seedFromCustomProgramIfPresent() {
  const urlParams = new URLSearchParams(window.location.search);
  const cpId = urlParams.get("cp");
  if (!cpId) return;
  urlParams.delete("cp");
  const rest = urlParams.toString();
  history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
  if (!isSyncConfigured()) return;
  // A managed client's first open goes through the same merge path as every
  // later refresh, so the local program is tracked from the start and the
  // coach's edits land on it instead of piling up as extra programs.
  if (isManagedClient()) {
    await Promise.race([
      syncManagedProgramFromCoach({ customProgramId: cpId }),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
    return;
  }
  if (Store.getProgram()) return; // never overwrite a visitor's own data
  try {
    const data = await Promise.race([
      getCustomProgram(cpId),
      new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    if (data && Array.isArray(data.days)) {
      data.days.forEach((day) => Store.addDay({ name: day.name || "Workout", source: null, exercises: day.exercises || [] }));
    }
  } catch {
    // fall through -- seedIfEmpty() applies the normal default seed instead
  }
}

/** Reads a one-shot param out of the current URL into localStorage and strips
 * it, if present. Returns true when the param was there. */
function consumeUrlParam(name, storageKey) {
  const urlParams = new URLSearchParams(window.location.search);
  const value = urlParams.get(name);
  if (value === null) return false;
  localStorage.setItem(storageKey, value);
  urlParams.delete(name);
  const rest = urlParams.toString();
  history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
  return true;
}

let syncStatusIndicatorReady = false;
function initSyncStatusIndicator() {
  if (syncStatusIndicatorReady) return;
  syncStatusIndicatorReady = true;
  const el = document.getElementById("sync-status");
  if (!el) return;
  let hideTimer = null;
  let slowTimer = null;
  onSyncStatusChange((status) => {
    clearTimeout(hideTimer);
    clearTimeout(slowTimer);
    if (status === "pending") {
      el.textContent = "Saving…";
      el.className = "sync-status show pending";
      // Firestore's SDK queues writes locally and doesn't reject its promise
      // just because the network is unreachable -- it can sit "pending"
      // indefinitely while genuinely offline. Relabel after a while so that
      // doesn't read as a stuck/broken app.
      slowTimer = setTimeout(() => {
        el.textContent = "Offline — will sync later";
        el.className = "sync-status show error";
      }, 6000);
    } else if (status === "synced") {
      el.textContent = "Saved";
      el.className = "sync-status show synced";
      hideTimer = setTimeout(() => { el.className = "sync-status"; }, 1500);
    } else if (status === "error") {
      el.textContent = "Offline — will retry";
      el.className = "sync-status show error";
    }
  });
}

// Guards applyAssignedProgramIfNew against re-running for the same
// assignment while its fetch is still in flight (the client's own program
// pushes touch the same doc and re-fire this same listener).
let processingAssignmentKey = null;

/** A coach can push a new program onto an *already-synced* client (see
 * assignProgramToClient / "Assign new program" in the coach dashboard) by
 * writing clients/{id}.assignedProgram. This applies it -- as a brand-new
 * saved program, never overwriting what's already there -- the moment this
 * listener sees it, which fires on every fresh load (a "refresh") and any
 * time it changes while the app is already open. Only ever applies a given
 * assignment once, tracked by its assignedAt timestamp. */
async function applyAssignedProgramIfNew(assignedProgram) {
  if (!assignedProgram || !assignedProgram.assignedAt) return;
  const key = firestoreTimeToIso(assignedProgram.assignedAt);
  if (!key || localStorage.getItem(LOCAL_KEYS.lastAppliedAssignment) === key || processingAssignmentKey === key) return;
  processingAssignmentKey = key;
  try {
    let days = null;
    if (assignedProgram.kind === "custom" && assignedProgram.customProgramId) {
      const data = await getCustomProgram(assignedProgram.customProgramId);
      if (data && Array.isArray(data.days)) days = data.days;
    } else if (assignedProgram.kind === "template" && assignedProgram.templateId) {
      const template = PROGRAM_TEMPLATES.find((t) => t.id === assignedProgram.templateId);
      if (template) days = parseWorkoutSheets(template.sheetText);
    }
    if (!days) return; // couldn't fetch -- stays unmarked so the next sync retries
    Store.createProgram(assignedProgram.name || "New Program", days);
    localStorage.setItem(LOCAL_KEYS.lastAppliedAssignment, key);
    toast(`Your coach assigned a new program: "${assignedProgram.name || "New Program"}"`);
    if (["program", "history", "settings"].includes(state.screen)) render();
  } finally {
    processingAssignmentKey = null;
  }
}

/** Pulls the coach's current version of a managed client's program down and
 * merges it onto whatever is on this device, keeping every logged number
 * (see Store.syncManagedProgram). Safe to call as often as we like -- an
 * unchanged program is a no-op -- so it runs on every load and whenever the
 * coach touches the client's doc. Returns true if anything actually moved. */
async function syncManagedProgramFromCoach(managedProgram, { announce } = {}) {
  if (!managedProgram || !managedProgram.customProgramId) return false;
  const data = await getCustomProgram(managedProgram.customProgramId);
  if (!data || !Array.isArray(data.days)) return false; // offline: keep what we have
  const existingId = localStorage.getItem(LOCAL_KEYS.managedProgramLocalId) || null;
  const { programId, changed } = Store.syncManagedProgram(
    existingId,
    managedProgram.name || data.name || "My Program",
    data.days
  );
  localStorage.setItem(LOCAL_KEYS.managedProgramLocalId, programId);
  if (changed && announce) {
    toast("Your coach updated your program");
    if (["program", "history", "settings"].includes(state.screen)) render();
  }
  return changed;
}

/** The client's own "my coach changed something" button. Re-reads their doc
 * (rather than trusting a cached managedProgram) so it works even if the live
 * listener was asleep, then merges. */
async function refreshManagedProgram() {
  const clientId = getLocalClientId();
  if (!clientId || !isSyncConfigured()) {
    toast("Not connected to a coach on this device");
    return;
  }
  toast("Checking with your coach…");
  try {
    const managedProgram = await Promise.race([
      getClientManagedProgram(clientId),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
    ]);
    if (!managedProgram) {
      toast("Your coach hasn't published a program for you yet");
      return;
    }
    const changed = await syncManagedProgramFromCoach(managedProgram);
    toast(changed ? "Program updated — your logged weeks are untouched" : "You're already up to date");
    render();
  } catch (e) {
    toast(e?.message === "timeout" ? "Taking a while — check your connection" : "Couldn't reach your coach's program — check your connection");
  }
}

/** Sends this device's check-in history up to the coach. Called after each
 * save and once at boot, so a client who logged offline still lands. */
function pushCheckInsToCoach() {
  const clientId = getLocalClientId();
  if (!clientId || !isSyncConfigured()) return;
  pushClientCheckIns(clientId, Nutrition.getWeightLog());
}

function bootstrapClientSync() {
  const clientId = getLocalClientId();
  if (!clientId || !isSyncConfigured()) return;
  initSyncStatusIndicator();
  const unsubscribePush = Store.onChange((program) => {
    if (program) pushClientProgram(clientId, getClientName(), program);
  });
  const current = Store.getProgram();
  if (current) pushClientProgram(clientId, getClientName(), current);
  pushCheckInsToCoach();

  const unsubscribeRevokeCheck = listenClient(clientId, (data) => {
    if (data && data.revoked) {
      unsubscribePush();
      unsubscribeRevokeCheck();
      localStorage.removeItem(LOCAL_KEYS.clientId);
      localStorage.removeItem(LOCAL_KEYS.clientName);
      toast("Your coach ended this connection. Your workouts are still saved on this device.");
      return;
    }
    if (data && data.reminders) {
      localStorage.setItem(LOCAL_KEYS.remindersOff, data.reminders.enabled === false ? "true" : "false");
    }
    if (data && data.managed && data.managedProgram) {
      localStorage.setItem(LOCAL_KEYS.managed, "true");
      syncManagedProgramFromCoach(data.managedProgram, { announce: true });
      return; // a managed client never takes assignedProgram: one program, the coach's
    }
    if (data && data.assignedProgram) applyAssignedProgramIfNew(data.assignedProgram);
  });
}

/** The normal, non-paywalled boot path -- unchanged from before paywalls existed. */
async function enterApp() {
  await seedFromCustomProgramIfPresent();
  // A managed client gets their coach's program and nothing else -- never the
  // bundled default, which is one of the programs they're not meant to see.
  if (!isManagedClient()) seedIfEmpty();
  Store.seedLibraryCatalog(EXERCISE_CATALOG);
  bootstrapClientSync();
  navigate("program");
}

let paywallUnlockListener = null;

/** Live-watches a paywalled client's own doc; shows the payment-required
 * screen until paid, then unlocks automatically (real-time, no reload). */
function watchPaywallUnlock(clientId) {
  if (paywallUnlockListener) return;
  paywallUnlockListener = listenClient(clientId, (data) => {
    if (data && data.paid) {
      localStorage.setItem(LOCAL_KEYS.clientPaid, "true");
      if (state.screen === "paywall-signin" || state.screen === "paywall-payment") {
        toast("Payment confirmed — welcome in!");
        enterApp();
      }
    } else {
      navigate("paywall-payment");
    }
  });
}

async function boot() {
  // A coach link makes this device the coach's -- and is the only way back in
  // if the browser that created the id was ever cleared.
  if (consumeUrlParam("coach", LOCAL_KEYS.coachId)) {
    localStorage.removeItem(LOCAL_KEYS.coachPinOkUntil); // still ask for the PIN, if one is set
  }
  consumeUrlParam("client", LOCAL_KEYS.clientId);
  consumeUrlParam("price", LOCAL_KEYS.clientPriceCents);
  if (consumeUrlParam("m", LOCAL_KEYS.managed)) localStorage.setItem(LOCAL_KEYS.managed, "true");

  if (isSyncConfigured() && isSignInLink()) {
    try {
      const email = await completeClientSignIn();
      const clientId = getLocalClientId();
      if (email && clientId) {
        localStorage.setItem(LOCAL_KEYS.clientEmail, email);
        await recordClientEmail(clientId, email);
      }
    } catch (e) {
      console.warn("sign-in completion failed", e);
      toast("That sign-in link didn't work — try requesting a new one");
    }
  }

  const clientId = getLocalClientId();
  const priceCents = parseInt(localStorage.getItem(LOCAL_KEYS.clientPriceCents) || "0", 10);
  const alreadyUnlocked = localStorage.getItem(LOCAL_KEYS.clientPaid) === "true";

  if (isSyncConfigured() && clientId && priceCents > 0 && !alreadyUnlocked) {
    // Best-effort, and never lets a slow/offline network hold up the gate
    // screen itself -- worst case the greeting just skips the client's name.
    paywallClientLabel = await Promise.race([
      getClientLabel(clientId),
      new Promise((resolve) => setTimeout(() => resolve(""), 3000)),
    ]);
    if (!getCurrentClientEmail()) {
      navigate("paywall-signin");
      return;
    }
    watchPaywallUnlock(clientId);
    return;
  }

  enterApp();
}

boot();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
