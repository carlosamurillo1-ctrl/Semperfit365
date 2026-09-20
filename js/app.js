import { fetchGoogleSheetCsv, parseGoogleSheetUrl } from "./csv.js";
import { parseWorkoutSheet, parseWorkoutSheets } from "./workoutParser.js";
import { Store } from "./store.js";
import { SEED_SHEET_TEXT } from "./seedProgram.js";

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

function navigate(screen, params = {}) {
  state.screen = screen;
  state.params = params;
  if (["program", "history", "settings"].includes(screen)) state.tab = screen;
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
    case "exercise": html = renderExercise(); break;
    case "history": html = renderHistory(); break;
    case "settings": html = renderSettings(); break;
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
          <span class="pill">Open</span>
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
  const items = day.exercises.map((ex) => {
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
          <span class="pill">${ex.setLabels.length || 0} sets</span>
        </div>
      </div>`;
  }).join("");

  return `
    ${topbar(day.name, { back: true })}
    ${items || `<div class="empty"><p>No exercises in this day.</p></div>`}
    <div style="height:8px"></div>
    <button class="btn danger" data-action="delete-day" data-day="${esc(day.id)}">Delete this day</button>
  `;
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
  const currentWeek = weeksSorted.find((w) => !w.updatedAt && w.values.every((v) => !v) && !w.notes);

  const weekCards = weeksSorted.map((w) => {
    const isCurrent = currentWeek && w.week === currentWeek.week;
    const fields = ex.setLabels.map((label, i) => `
      <div class="field">
        <label>${esc(label)}</label>
        <input type="text" inputmode="decimal" value="${esc(w.values[i] || "")}" data-week="${w.week}" data-idx="${i}" data-kind="value" />
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
    ${ex.setupNote ? `<div class="card"><p>${esc(ex.setupNote)}</p></div>` : ""}
    ${weekCards}
    <button class="btn" data-action="add-week" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}">+ Add week</button>
    <div style="height:8px"></div>
    <button class="btn danger" data-action="delete-exercise" data-day="${esc(day.id)}" data-exercise="${esc(ex.id)}">Delete this exercise</button>
  `;
}

// ---------- HISTORY screen ----------

function renderHistory() {
  const entries = Store.getRecentEntries();
  if (!entries.length) {
    return `${topbar("History")}<div class="empty"><h2>Nothing logged yet</h2><p>Fill in a set weight on any exercise and it'll show up here.</p></div>`;
  }
  const items = entries.map((e) => {
    const summary = e.values.map((v, i) => v ? `${esc(e.setLabels[i])}: ${esc(v)}` : null).filter(Boolean).join(", ");
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
      <h3>Reset</h3>
      <p>Clears every imported day and every logged value from this device.</p>
      <div style="height:10px"></div>
      <button class="btn danger" data-action="reset-all">Erase all data</button>
    </div>
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
          if (oldWeek && (oldWeek.updatedAt || oldWeek.values.some((v) => v) || oldWeek.notes)) return oldWeek;
          return { week: w.week, values: w.values, notes: w.notes, updatedAt: null };
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
      else if (state.screen === "day") navigate("program");
      else navigate("program");
      break;
    }
    case "import-sheet": handleImportSheet(); break;
    case "import-paste": handleImportPaste(); break;
    case "confirm-review": confirmReview(); break;
    case "open-day": navigate("day", { dayId: el.dataset.day }); break;
    case "open-exercise": navigate("exercise", { dayId: el.dataset.day, exerciseId: el.dataset.exercise }); break;
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
    case "delete-exercise": {
      if (confirm("Delete this exercise and everything logged for it?")) {
        const dayId = el.dataset.day;
        Store.removeExercise(dayId, el.dataset.exercise);
        toast("Exercise deleted");
        navigate("day", { dayId });
      }
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
  }
}

function onInput(e) {
  const el = e.target;
  if (!el.dataset.kind || state.screen !== "exercise") return;
  const { dayId, exerciseId } = state.params;
  const week = parseInt(el.dataset.week, 10);
  if (el.dataset.kind === "notes") {
    Store.updateExerciseWeek(dayId, exerciseId, week, { notes: el.value });
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

seedIfEmpty();
navigate("program");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
