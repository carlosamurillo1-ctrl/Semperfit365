import { fetchGoogleSheetCsv, parseGoogleSheetUrl } from "./csv.js";
import { parseWorkoutSheet, parseWorkoutSheets } from "./workoutParser.js";
import { Store } from "./store.js";
import { SEED_SHEET_TEXT } from "./seedProgram.js";
import { PROGRAM_TEMPLATES } from "./programTemplates.js";
import {
  isSyncConfigured,
  newId,
  pushClientProgram,
  addClientToRoster,
  removeClientFromRoster,
  listenRoster,
  listenClient,
} from "./sync.js";

const LOCAL_KEYS = {
  clientId: "sf365.clientId",
  clientName: "sf365.clientName",
  coachId: "sf365.coachId",
};

function getLocalClientId() {
  return localStorage.getItem(LOCAL_KEYS.clientId) || "";
}
function getClientName() {
  return localStorage.getItem(LOCAL_KEYS.clientName) || "";
}
function setClientName(name) {
  localStorage.setItem(LOCAL_KEYS.clientName, name);
}
function getOrCreateCoachId() {
  let id = localStorage.getItem(LOCAL_KEYS.coachId);
  if (!id) {
    id = newId();
    localStorage.setItem(LOCAL_KEYS.coachId, id);
  }
  return id;
}

const app = document.getElementById("app");
const tabbar = document.getElementById("tabbar");

const state = {
  tab: "program",
  screen: "program", // program | import | review | day | exercise | history | settings
  params: {},
  pendingImport: null, // { days: [{ dayTitle, exercises }], source }
  toast: null,
};

function toast(msg) {
  state.toast = msg;
  render();
  setTimeout(() => {
    state.toast = null;
    render();
  }, 2200);
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
  if (["program", "history", "settings"].includes(screen)) state.tab = screen;

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
  tabbar.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.route === state.tab && ["program", "history", "settings"].includes(state.screen));
  });

  let html = "";
  switch (state.screen) {
    case "program": html = renderProgram(); break;
    case "import": html = renderImport(); break;
    case "review": html = renderReview(); break;
    case "day": html = renderDay(); break;
    case "add-exercise": html = renderAddExercise(); break;
    case "exercise": html = renderExercise(); break;
    case "history": html = renderHistory(); break;
    case "settings": html = renderSettings(); break;
    case "templates": html = renderTemplates(); break;
    case "coach": html = renderCoach(); break;
    case "coach-add-client": html = renderCoachAddClient(); break;
    case "coach-client-link": html = renderCoachClientLink(); break;
    case "coach-client": html = renderCoachClient(); break;
    case "coach-client-day": html = renderCoachClientDay(); break;
    case "coach-client-exercise": html = renderCoachClientExercise(); break;
    default: html = renderProgram();
  }
  if (state.toast) html += `<div class="toast">${esc(state.toast)}</div>`;
  app.innerHTML = html;
  attachHandlers();
}

function topbar(title, opts = {}) {
  const backBtn = opts.back
    ? `<button class="btn ghost small" data-action="back" style="width:auto;padding:6px 10px;">&larr; Back</button>`
    : `<div class="brand"><span class="logo-crop"><img src="icons/logo.jpg" alt="SemperFit365"/></span></div>`;
  return `<div class="topbar">${backBtn}<h1 style="margin:0;font-size:17px;">${esc(title)}</h1><div style="width:${opts.back ? "70px" : "0"}"></div></div>`;
}

// ---------- PROGRAM screen (list of days) ----------

function renderProgram() {
  const program = Store.getProgram();
  if (!program || program.days.length === 0) {
    return `
      ${topbar("")}
      <div class="empty">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M20.5 3.5 21 4a1 1 0 0 1 0 1.4L6.9 19.5l-4.4 1 1-4.4L17.6 2.1a1 1 0 0 1 1.4 0l1.5 1.4Z"/></svg>
        <h2>No workout days yet</h2>
        <p>Connect your Google Sheet, paste your workout data, or upload a CSV to get started.</p>
        <div style="height:16px"></div>
        <button class="btn primary" data-action="go-import">Import a workout day</button>
      </div>`;
  }

  const items = program.days.map((day) => {
    const exCount = day.exercises.length;
    const filled = day.exercises.reduce((n, ex) => n + ex.weeks.filter((w) => w.updatedAt).length, 0);
    return `
      <div class="card tappable" data-action="open-day" data-day="${esc(day.id)}">
        <div class="row">
          <div>
            <h3>${esc(day.name)}</h3>
            <p>${exCount} exercise${exCount === 1 ? "" : "s"}${filled ? ` &middot; ${filled} week${filled === 1 ? "" : "s"} logged` : ""}</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="btn ghost small" data-action="rename-day" data-day="${esc(day.id)}" style="width:auto;padding:4px 8px;font-size:15px;" aria-label="Rename day">&#9998;</button>
            <span class="pill">Open</span>
          </div>
        </div>
      </div>`;
  }).join("");

  return `
    ${topbar("")}
    <div class="row" style="margin-bottom:14px;">
      <span class="source-chip">${program.days.length} workout day${program.days.length === 1 ? "" : "s"}</span>
      <button class="btn ghost small" data-action="go-import">+ Add day</button>
    </div>
    ${items}
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
  const items = day.exercises.map((ex, idx) => {
    const filled = ex.weeks.filter((w) => w.updatedAt).length;
    const repText = ex.repGoal && (/rep/i.test(ex.repGoal) ? ex.repGoal : `${ex.repGoal} reps`);
    const target = [repText, ex.restTime && `rest ${ex.restTime}`].filter(Boolean).join(" &middot; ");
    return `
      <div class="card tappable" data-action="open-exercise" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}">
        <div class="row">
          <div>
            <h3>${esc(ex.name)}</h3>
            <p>${target || `${ex.weeks.length} weeks`}${filled ? ` &middot; ${filled} logged` : ""}</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="reorder-btns">
              <button data-action="move-exercise" data-dir="-1" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}" ${idx === 0 ? "disabled" : ""} aria-label="Move up">&#9650;</button>
              <button data-action="move-exercise" data-dir="1" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}" ${idx === day.exercises.length - 1 ? "disabled" : ""} aria-label="Move down">&#9660;</button>
            </div>
            <span class="pill">${ex.setLabels.length || 0} sets</span>
          </div>
        </div>
      </div>`;
  }).join("");

  return `
    ${topbar(day.name, { back: true })}
    ${items || `<div class="empty"><p>No exercises in this day.</p></div>`}
    <button class="btn" data-action="go-add-exercise" data-day="${esc(day.id)}">+ Add exercise</button>
    <div style="height:8px"></div>
    <div class="btn-row">
      <button class="btn" data-action="rename-day" data-day="${esc(day.id)}">Rename day</button>
      <button class="btn danger" data-action="delete-day" data-day="${esc(day.id)}">Delete day</button>
    </div>
  `;
}

// ---------- ADD EXERCISE screen (manually create a new exercise) ----------

function renderAddExercise() {
  const day = Store.getDay(state.params.dayId);
  if (!day) {
    navigate("program");
    return "";
  }
  return `
    ${topbar("Add exercise", { back: true })}
    <div class="card">
      <label for="new-ex-name">Exercise name *</label>
      <input type="text" id="new-ex-name" placeholder="e.g. Barbell Squat" />

      <label for="new-ex-repgoal">Rep goal</label>
      <input type="text" id="new-ex-repgoal" placeholder="e.g. 8-10" />

      <label for="new-ex-resttime">Rest time</label>
      <input type="text" id="new-ex-resttime" placeholder="e.g. 90 sec" />

      <label for="new-ex-sets">Set columns</label>
      <input type="text" id="new-ex-sets" value="Set 1, Set 2, Set 3" placeholder="comma-separated" />
      <p class="hint">These become the editable fields for each week, e.g. "Set 1, Set 2, Set 3" or "WU set, Set 1, Set 2".</p>

      <label for="new-ex-weeks">Number of weeks</label>
      <input type="number" id="new-ex-weeks" value="8" min="1" max="52" />

      <label for="new-ex-video">YouTube video (optional)</label>
      <input type="url" id="new-ex-video" placeholder="https://youtube.com/watch?v=..." />
      <p class="hint">Shown as a how-to video on the exercise screen.</p>
    </div>
    <button class="btn primary" data-action="confirm-add-exercise" data-day="${esc(day.id)}">Add exercise</button>
  `;
}

function confirmAddExercise(dayId) {
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
  const exerciseId = Store.addExercise(dayId, { name, repGoal, restTime, setLabels, weekCount, videoUrl });
  toast("Exercise added");
  navigate("exercise", { dayId, exerciseId });
}

// ---------- EXERCISE screen (week-by-week log) ----------

function renderExercise() {
  const { dayId, exerciseId } = state.params;
  const day = Store.getDay(dayId);
  const ex = day?.exercises.find((e) => e.id === exerciseId);
  if (!day || !ex) {
    navigate("program");
    return "";
  }
  const weeksSorted = [...ex.weeks].sort((a, b) => a.week - b.week);
  const isWeekEmpty = (w) => w.values.every((v) => !v) && (w.reps || []).every((v) => !v) && !w.notes;
  const currentWeek = weeksSorted.find((w) => !w.updatedAt && isWeekEmpty(w));

  const weekCards = weeksSorted.map((w) => {
    const isCurrent = currentWeek && w.week === currentWeek.week;
    const fields = ex.setLabels.map((label, i) => `
      <div class="field">
        <label>${esc(label)}</label>
        <input type="text" inputmode="decimal" placeholder="lb" value="${esc(w.values[i] || "")}" data-week="${w.week}" data-idx="${i}" data-kind="value" />
        <input type="text" inputmode="numeric" placeholder="reps" value="${esc((w.reps || [])[i] || "")}" data-week="${w.week}" data-idx="${i}" data-kind="reps" />
      </div>
    `).join("");
    return `
      <div class="card${isCurrent ? " current-week" : ""}">
        <div class="row">
          <h3>Week ${w.week}${isCurrent ? ' <span class="pill">Next</span>' : ""}</h3>
          ${w.updatedAt ? `<span class="hint">updated ${relativeTime(w.updatedAt)}</span>` : ""}
        </div>
        <div class="week-fields">${fields}</div>
        <label>Notes</label>
        <input type="text" value="${esc(w.notes || "")}" data-week="${w.week}" data-kind="notes" />
      </div>
    `;
  }).join("");

  return `
    ${topbar(ex.name, { back: true })}
    <div class="row" style="margin-bottom:10px;flex-wrap:wrap;gap:8px;">
      ${ex.repGoal ? `<span class="source-chip">Reps: ${esc(ex.repGoal)}</span>` : ""}
      ${ex.restTime ? `<span class="source-chip">Rest: ${esc(ex.restTime)}</span>` : ""}
    </div>
    ${renderVideoEmbed(ex.videoUrl)}
    ${ex.setupNote ? `<div class="card"><p>${esc(ex.setupNote)}</p></div>` : ""}
    ${weekCards}
    <button class="btn" data-action="add-week" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}">+ Add week</button>
    <div style="height:8px"></div>
    <div class="btn-row">
      <button class="btn" data-action="rename-exercise" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}">Rename</button>
      <button class="btn" data-action="set-exercise-video" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}">${ex.videoUrl ? "Edit video" : "Add video"}</button>
      <button class="btn danger" data-action="delete-exercise" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}">Delete</button>
    </div>
  `;
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
      <h3>Workout days</h3>
      ${dayRows || "<p>None imported yet.</p>"}
      <div style="height:10px"></div>
      <button class="btn" data-action="go-import">Import another day</button>
    </div>
    <div class="card">
      <h3>Program templates</h3>
      <p>Swap this device's whole program for a different prebuilt one (e.g. give a client a leg-focused plan instead of the default).</p>
      <div style="height:10px"></div>
      <button class="btn" data-action="go-templates">Browse templates</button>
    </div>
    ${renderSyncSettingsCard()}
    <div class="card">
      <h3>Reset</h3>
      <p>Clears every imported day and every logged value from this device.</p>
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
  if (clientId) {
    return `
      <div class="card">
        <h3>Coach sync</h3>
        <p>This device is sharing its logged workouts with a coach.</p>
        <label for="client-name">Your name (shown to your coach)</label>
        <input type="text" id="client-name" value="${esc(getClientName())}" placeholder="e.g. Alex" />
        <div style="height:10px"></div>
        <button class="btn small" data-action="save-client-name">Save name</button>
      </div>
    `;
  }
  return `
    <div class="card">
      <h3>Coach dashboard</h3>
      <p>Generate links for clients and watch their logged workouts live.</p>
      <div style="height:10px"></div>
      <button class="btn" data-action="go-coach">Open coach dashboard</button>
    </div>
  `;
}

// ---------- TEMPLATES screen (load a whole prebuilt program) ----------

function renderTemplates() {
  const rows = PROGRAM_TEMPLATES.map((t) => `
    <div class="card">
      <h3>${esc(t.name)}</h3>
      <p>${esc(t.description)}</p>
      <div style="height:10px"></div>
      <button class="btn primary" data-action="load-template" data-template="${esc(t.id)}">Load this program</button>
    </div>
  `).join("");

  return `
    ${topbar("Program templates", { back: true })}
    <div class="card">
      <p>Loading a template replaces every workout day currently on this device, including any logged weeks. Use this on a client's phone (or before sharing a link) to hand them a different program instead of editing day by day.</p>
    </div>
    ${rows}
  `;
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

// ---------- COACH screens (view clients' synced data, read-only) ----------

function renderCoach() {
  const rows = coachRosterData.map((c) => `
    <div class="card tappable" data-action="open-coach-client" data-client="${esc(c.id)}" data-label="${esc(c.label)}">
      <div class="row">
        <div>
          <h3>${esc(c.label)}</h3>
          <p>${c.addedAt ? `Added ${relativeTime(firestoreTimeToIso(c.addedAt))}` : "Just added"}</p>
        </div>
        <button class="btn ghost small" data-action="remove-coach-client" data-client="${esc(c.id)}" data-label="${esc(c.label)}" style="width:auto;">Remove</button>
      </div>
    </div>
  `).join("");

  return `
    ${topbar("Coach dashboard", { back: true })}
    <button class="btn primary" data-action="go-coach-add-client">+ Add client</button>
    <div style="height:12px"></div>
    ${rows || `<div class="empty"><p>No clients yet. Add one to get a link you can send them.</p></div>`}
  `;
}

function renderCoachAddClient() {
  return `
    ${topbar("Add client", { back: true })}
    <div class="card">
      <label for="coach-client-label">Client name</label>
      <input type="text" id="coach-client-label" placeholder="e.g. Jordan" />
    </div>
    <button class="btn primary" data-action="confirm-add-coach-client">Generate client link</button>
  `;
}

async function confirmAddCoachClient() {
  const label = document.getElementById("coach-client-label").value.trim();
  if (!label) {
    toast("Give the client a name");
    return;
  }
  const clientId = newId();
  try {
    await addClientToRoster(getOrCreateCoachId(), clientId, label);
    navigate("coach-client-link", { clientId, label });
  } catch {
    toast("Couldn't create the client link — check your connection");
  }
}

function renderCoachClientLink() {
  const { clientId, label } = state.params;
  const link = `${window.location.origin}${window.location.pathname}?client=${clientId}`;
  return `
    ${topbar("Client link ready", { back: true })}
    <div class="card">
      <h3>${esc(label)}</h3>
      <p>Send this link to your client. The moment they open it, their logged workouts start syncing to you — no account needed on their end.</p>
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
  if (!coachClientData) {
    return `${topbar(clientLabel || "Client", { back: true })}<div class="empty"><p>Waiting for this client to open their link and sync for the first time...</p></div>`;
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
    ${items || `<div class="empty"><p>No workout days yet.</p></div>`}
  `;
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

  return `
    ${topbar(ex.name, { back: true })}
    <div class="row" style="margin-bottom:10px;flex-wrap:wrap;gap:8px;">
      ${ex.repGoal ? `<span class="source-chip">Reps: ${esc(ex.repGoal)}</span>` : ""}
      ${ex.restTime ? `<span class="source-chip">Rest: ${esc(ex.restTime)}</span>` : ""}
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

function onClick(e) {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;

  switch (action) {
    case "go-import": navigate("import"); break;
    case "back": {
      if (state.screen === "review") navigate("import");
      else if (state.screen === "import") navigate("program");
      else if (state.screen === "exercise") navigate("day", { dayId: state.params.dayId });
      else if (state.screen === "add-exercise") navigate("day", { dayId: state.params.dayId });
      else if (state.screen === "day") navigate("program");
      else if (state.screen === "coach") navigate("settings");
      else if (state.screen === "templates") navigate("settings");
      else if (state.screen === "coach-add-client") navigate("coach");
      else if (state.screen === "coach-client-link") navigate("coach");
      else if (state.screen === "coach-client") navigate("coach");
      else if (state.screen === "coach-client-day") navigate("coach-client", { clientId: state.params.clientId, clientLabel: state.params.clientLabel });
      else if (state.screen === "coach-client-exercise") navigate("coach-client-day", { clientId: state.params.clientId, clientLabel: state.params.clientLabel, dayId: state.params.dayId });
      else navigate("program");
      break;
    }
    case "import-sheet": handleImportSheet(); break;
    case "import-paste": handleImportPaste(); break;
    case "create-blank-day": handleCreateBlankDay(); break;
    case "confirm-review": confirmReview(); break;
    case "open-day": navigate("day", { dayId: el.dataset.day }); break;
    case "open-exercise": navigate("exercise", { dayId: el.dataset.day, exerciseId: el.dataset.exercise }); break;
    case "go-add-exercise": navigate("add-exercise", { dayId: el.dataset.day }); break;
    case "confirm-add-exercise": confirmAddExercise(el.dataset.day); break;
    case "add-week": {
      Store.addWeekToExercise(el.dataset.day, el.dataset.exercise);
      render();
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
    case "go-templates": navigate("templates"); break;
    case "load-template": loadTemplate(el.dataset.template); break;
    case "go-coach": navigate("coach"); break;
    case "go-coach-add-client": navigate("coach-add-client"); break;
    case "confirm-add-coach-client": confirmAddCoachClient(); break;
    case "copy-coach-link": {
      navigator.clipboard.writeText(el.dataset.link)
        .then(() => toast("Link copied"))
        .catch(() => toast("Couldn't copy — select the link and copy manually"));
      break;
    }
    case "open-coach-client": navigate("coach-client", { clientId: el.dataset.client, clientLabel: el.dataset.label }); break;
    case "remove-coach-client": {
      if (confirm(`Remove ${el.dataset.label} from your client list? This won't delete their own data.`)) {
        removeClientFromRoster(getOrCreateCoachId(), el.dataset.client).catch(() => toast("Couldn't remove — check your connection"));
      }
      break;
    }
    case "open-coach-client-day": navigate("coach-client-day", { clientId: el.dataset.client, clientLabel: el.dataset.label, dayId: el.dataset.day }); break;
    case "open-coach-client-exercise": navigate("coach-client-exercise", { clientId: el.dataset.client, clientLabel: el.dataset.label, dayId: el.dataset.day, exerciseId: el.dataset.exercise }); break;
  }
}

function onInput(e) {
  const el = e.target;
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
  if (el.id === "csv-file" && el.files[0]) {
    handleImportFile(el.files[0]);
  }
}

tabbar.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  navigate(btn.dataset.route);
});

// ---------- boot ----------

function seedIfEmpty() {
  if (Store.getProgram()) return; // never overwrite a visitor's own data
  try {
    const days = parseWorkoutSheets(SEED_SHEET_TEXT);
    days.forEach((day) => Store.addDay({ name: day.dayTitle || "Workout", source: null, exercises: day.exercises }));
  } catch {
    // if the bundled seed ever fails to parse, just fall back to the normal empty state
  }
}

function bootstrapClientSync() {
  const urlParams = new URLSearchParams(window.location.search);
  const linkedId = urlParams.get("client");
  if (linkedId) {
    localStorage.setItem(LOCAL_KEYS.clientId, linkedId);
    urlParams.delete("client");
    const rest = urlParams.toString();
    history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
  }
  const clientId = getLocalClientId();
  if (!clientId || !isSyncConfigured()) return;
  Store.onChange((program) => {
    if (program) pushClientProgram(clientId, getClientName(), program);
  });
  const current = Store.getProgram();
  if (current) pushClientProgram(clientId, getClientName(), current);
}

seedIfEmpty();
bootstrapClientSync();
navigate("program");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
