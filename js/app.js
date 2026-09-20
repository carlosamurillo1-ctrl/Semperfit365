import { parseCSV, rowsToObjects, fetchGoogleSheetCsv, parseGoogleSheetUrl } from "./csv.js";
import { Store } from "./store.js";

const app = document.getElementById("app");
const tabbar = document.getElementById("tabbar");

const FIELD_ORDER = ["exercise", "sets", "reps", "weight", "week", "day", "rest", "category", "notes"];
const FIELD_LABELS = {
  exercise: "Exercise name", sets: "Sets", reps: "Reps", weight: "Weight",
  week: "Week / Phase", day: "Day", rest: "Rest", category: "Category / Muscle group", notes: "Notes",
};
const FIELD_PATTERNS = {
  exercise: /\b(exercise|movement|lift|activity)\b/i,
  sets: /^\s*sets?\s*$/i,
  reps: /^\s*reps?\s*$/i,
  weight: /\b(weight|load|lbs?|kgs?)\b/i,
  week: /\b(week|wk|phase|cycle|block)\b/i,
  day: /\b(day|session|workout)\b/i,
  rest: /\brest\b/i,
  category: /\b(category|group|muscle|body ?part|type)\b/i,
  notes: /\b(notes?|comments?|cues?|tempo)\b/i,
};

const state = {
  tab: "program",
  screen: "program", // program | import | mapping | workout | log-detail | history | settings
  params: {},
  pendingImport: null, // { headers, records, source }
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

// ---------- data helpers ----------

function autoMap(headers) {
  const mapping = {};
  const used = new Set();
  for (const field of FIELD_ORDER) {
    const pattern = FIELD_PATTERNS[field];
    const match = headers.find((h) => !used.has(h) && pattern.test(h));
    if (match) {
      mapping[field] = match;
      used.add(match);
    } else {
      mapping[field] = null;
    }
  }
  return mapping;
}

function formatWeekLabel(raw) {
  const trimmed = String(raw).trim();
  return /^\d+$/.test(trimmed) ? `Week ${trimmed}` : trimmed;
}

function buildWorkouts(program) {
  const { records, mapping } = program;
  const groups = new Map();
  records.forEach((rec, idx) => {
    const week = (mapping.week && rec[mapping.week] && formatWeekLabel(rec[mapping.week])) || "Week 1";
    const day = (mapping.day && rec[mapping.day]) || "Day 1";
    const key = `${week}||${day}`;
    if (!groups.has(key)) groups.set(key, { week, day, key, exercises: [] });
    const name = mapping.exercise ? rec[mapping.exercise] : "";
    if (!name) return;
    groups.get(key).exercises.push({
      name,
      sets: mapping.sets ? rec[mapping.sets] : "",
      reps: mapping.reps ? rec[mapping.reps] : "",
      weight: mapping.weight ? rec[mapping.weight] : "",
      rest: mapping.rest ? rec[mapping.rest] : "",
      notes: mapping.notes ? rec[mapping.notes] : "",
      category: mapping.category ? rec[mapping.category] : "",
      order: idx,
    });
  });
  return Array.from(groups.values()).sort((a, b) => {
    const first = (g) => Math.min(...g.exercises.map((e) => e.order), Infinity);
    return first(a) - first(b);
  });
}

function setsCount(raw) {
  const n = parseInt(String(raw).match(/\d+/)?.[0] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
    case "mapping": html = renderMapping(); break;
    case "workout": html = renderWorkout(); break;
    case "log-detail": html = renderLogDetail(); break;
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
    : `<div class="brand"><img src="icons/icon.svg" alt="" width="26" height="26"/><b>SemperFit365</b></div>`;
  return `<div class="topbar">${backBtn}<h1 style="margin:0;font-size:17px;">${esc(title)}</h1><div style="width:${opts.back ? "70px" : "0"}"></div></div>`;
}

// ---------- PROGRAM screen ----------

function renderProgram() {
  const program = Store.getProgram();
  if (!program) {
    return `
      ${topbar("")}
      <div class="empty">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M20.5 3.5 21 4a1 1 0 0 1 0 1.4L6.9 19.5l-4.4 1 1-4.4L17.6 2.1a1 1 0 0 1 1.4 0l1.5 1.4Z"/></svg>
        <h2>No workout program yet</h2>
        <p>Connect your Google Sheet, paste your workout data, or upload a CSV to get started.</p>
        <div style="height:16px"></div>
        <button class="btn primary" data-action="go-import">Import my program</button>
      </div>`;
  }

  const workouts = buildWorkouts(program);
  let lastWeek = null;
  const items = workouts.map((w) => {
    const weekHeader = w.week !== lastWeek ? `<div class="week-group">${esc(w.week)}</div>` : "";
    lastWeek = w.week;
    const exCount = w.exercises.length;
    const last = Store.lastLogFor(w.week, w.day);
    return `${weekHeader}
      <div class="card tappable" data-action="open-workout" data-week="${esc(w.week)}" data-day="${esc(w.day)}">
        <div class="row">
          <div>
            <h3>${esc(w.day)}</h3>
            <p>${exCount} exercise${exCount === 1 ? "" : "s"}${last ? ` &middot; last done ${new Date(last.date).toLocaleDateString()}` : ""}</p>
          </div>
          <span class="pill">${last ? "Repeat" : "Start"}</span>
        </div>
      </div>`;
  }).join("");

  const sourceLabel = program.source?.type === "sheet" ? "Google Sheet" : program.source?.type === "file" ? "CSV file" : "Pasted data";

  return `
    ${topbar("")}
    <div class="row" style="margin-bottom:14px;">
      <span class="source-chip">Source: ${esc(sourceLabel)}</span>
      <button class="btn ghost small" data-action="go-import">Change</button>
    </div>
    ${items || `<div class="empty"><p>No workouts found in this sheet. Check your column mapping in Settings.</p></div>`}
  `;
}

// ---------- IMPORT screen ----------

function renderImport() {
  const program = Store.getProgram();
  return `
    ${topbar("Import your program", { back: !!program })}
    <div class="card">
      <h3>From a Google Sheet</h3>
      <p>Share your sheet as "Anyone with the link can view", then paste the link here.</p>
      <label for="sheet-url">Google Sheet link</label>
      <input type="url" id="sheet-url" placeholder="https://docs.google.com/spreadsheets/d/..." />
      <div style="height:10px"></div>
      <button class="btn primary" data-action="import-sheet">Fetch from Google Sheets</button>
      <div id="import-error"></div>
    </div>

    <div class="divider">or</div>

    <div class="card">
      <h3>Paste CSV data</h3>
      <p>In Google Sheets: File &rarr; Download &rarr; Comma Separated Values, open it, then paste the contents below. Or just copy a range of cells and paste.</p>
      <textarea id="csv-paste" placeholder="Week,Day,Exercise,Sets,Reps,Weight,Rest,Notes&#10;1,Day 1 - Push,Bench Press,4,8,135,90s,"></textarea>
      <div style="height:10px"></div>
      <button class="btn" data-action="import-paste">Use pasted data</button>
    </div>

    <div class="divider">or</div>

    <div class="card">
      <h3>Upload a CSV file</h3>
      <input type="file" id="csv-file" accept=".csv,text/csv" />
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

function beginImport(csvText, source) {
  const rows = parseCSV(csvText);
  const { headers, records } = rowsToObjects(rows);
  if (!headers.length || !records.length) {
    toast("No data found — check the format and try again");
    return;
  }
  state.pendingImport = { headers, records, source, mapping: autoMap(headers) };
  navigate("mapping");
}

// ---------- MAPPING screen ----------

function renderMapping() {
  const pending = state.pendingImport;
  if (!pending) {
    navigate("import");
    return "";
  }
  const options = (selected) => {
    const opts = [`<option value="" ${!selected ? "selected" : ""}>(none)</option>`];
    for (const h of pending.headers) {
      opts.push(`<option value="${esc(h)}" ${selected === h ? "selected" : ""}>${esc(h)}</option>`);
    }
    return opts.join("");
  };

  const fields = FIELD_ORDER.map((f) => `
    <div>
      <label for="map-${f}">${esc(FIELD_LABELS[f])}${f === "exercise" ? " *" : ""}</label>
      <select id="map-${f}" data-field="${f}">${options(pending.mapping[f])}</select>
    </div>
  `).join("");

  return `
    ${topbar("Match your columns", { back: true })}
    <div class="card">
      <p>Found ${pending.records.length} rows with ${pending.headers.length} columns. Match them to the fields below — we guessed based on your headers, adjust anything that's wrong.</p>
    </div>
    <div class="card">
      <div class="map-grid">${fields}</div>
    </div>
    <button class="btn primary" data-action="confirm-mapping">Save &amp; view program</button>
  `;
}

function confirmMapping() {
  const pending = state.pendingImport;
  const mapping = {};
  FIELD_ORDER.forEach((f) => {
    const sel = document.getElementById(`map-${f}`);
    mapping[f] = sel.value || null;
  });
  if (!mapping.exercise) {
    toast("Pick a column for Exercise name");
    return;
  }
  const program = {
    headers: pending.headers,
    records: pending.records,
    mapping,
    source: pending.source,
    importedAt: new Date().toISOString(),
  };
  Store.setProgram(program);
  state.pendingImport = null;
  toast("Program imported");
  navigate("program");
}

// ---------- WORKOUT screen ----------

let activeDraft = null;

function loadDraft(week, day) {
  const program = Store.getProgram();
  const workouts = buildWorkouts(program);
  const w = workouts.find((x) => x.week === week && x.day === day);
  if (!w) return null;
  return {
    week, day,
    exercises: w.exercises.map((ex) => ({
      ...ex,
      setRows: Array.from({ length: setsCount(ex.sets) }, () => ({ reps: "", weight: "", done: false })),
    })),
  };
}

function renderWorkout() {
  const { week, day } = state.params;
  if (!activeDraft || activeDraft.week !== week || activeDraft.day !== day) {
    activeDraft = loadDraft(week, day);
  }
  if (!activeDraft) {
    navigate("program");
    return "";
  }
  const last = Store.lastLogFor(week, day);
  const lastByName = {};
  if (last) {
    last.exercises.forEach((e) => { lastByName[e.name] = e; });
  }

  const exHtml = activeDraft.exercises.map((ex, exIdx) => {
    const target = [ex.sets && `${ex.sets} sets`, ex.reps && `${ex.reps} reps`, ex.weight && `@ ${ex.weight}`].filter(Boolean).join(" · ");
    const lastEx = lastByName[ex.name];
    const lastSummary = lastEx?.setRows?.length
      ? lastEx.setRows.filter((s) => s.weight || s.reps).map((s) => `${s.weight || "-"}${s.reps ? `x${s.reps}` : ""}`).join(", ")
      : null;

    const rows = ex.setRows.map((s, setIdx) => `
      <div class="set-row">
        <div class="set-idx">${setIdx + 1}</div>
        <input type="number" inputmode="decimal" placeholder="${esc(ex.weight) || "weight"}" value="${esc(s.weight)}" data-ex="${exIdx}" data-set="${setIdx}" data-kind="weight" />
        <input type="number" inputmode="numeric" placeholder="${esc(ex.reps) || "reps"}" value="${esc(s.reps)}" data-ex="${exIdx}" data-set="${setIdx}" data-kind="reps" />
        <div class="check ${s.done ? "done" : ""}" data-action="toggle-set" data-ex="${exIdx}" data-set="${setIdx}">
          <svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
        </div>
      </div>
    `).join("");

    return `
      <div class="exercise">
        <div class="ex-head">
          <span class="ex-name">${esc(ex.name)}</span>
          <span class="ex-target">${esc(target)}${ex.rest ? ` &middot; rest ${esc(ex.rest)}` : ""}</span>
        </div>
        ${ex.category ? `<div class="ex-target">${esc(ex.category)}</div>` : ""}
        ${ex.notes ? `<div class="ex-notes">${esc(ex.notes)}</div>` : ""}
        ${lastSummary ? `<div class="last-time">Last time: ${esc(lastSummary)}</div>` : ""}
        ${rows}
      </div>
    `;
  }).join("");

  return `
    ${topbar(day, { back: true })}
    <p style="margin-bottom:12px;">${esc(week)}</p>
    <div class="card">${exHtml || "<p>No exercises in this workout.</p>"}</div>
    <div class="btn-row">
      <button class="btn" data-action="cancel-workout">Cancel</button>
      <button class="btn primary" data-action="finish-workout">Finish workout</button>
    </div>
  `;
}

function finishWorkout() {
  if (!activeDraft) return;
  const loggedExercises = activeDraft.exercises
    .map((ex) => ({
      name: ex.name,
      setRows: ex.setRows.filter((s) => s.done || s.weight || s.reps),
    }))
    .filter((ex) => ex.setRows.length > 0);

  if (loggedExercises.length === 0) {
    toast("Log at least one set before finishing");
    return;
  }

  Store.addLog({
    id: `${Date.now()}`,
    date: new Date().toISOString(),
    week: activeDraft.week,
    day: activeDraft.day,
    exercises: loggedExercises,
  });
  activeDraft = null;
  toast("Workout saved");
  navigate("program");
}

// ---------- HISTORY screen ----------

function renderHistory() {
  const logs = Store.getLogs();
  if (!logs.length) {
    return `${topbar("History")}<div class="empty"><h2>No workouts logged yet</h2><p>Finish a workout and it'll show up here.</p></div>`;
  }
  const items = logs.map((l) => `
    <div class="card tappable" data-action="open-log" data-id="${esc(l.id)}">
      <div class="row">
        <div>
          <h3>${esc(l.day)}</h3>
          <p>${esc(l.week)} &middot; ${new Date(l.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
        </div>
        <span class="pill">${l.exercises.length} ex</span>
      </div>
    </div>
  `).join("");
  return `${topbar("History")}${items}`;
}

function renderLogDetail() {
  const log = Store.getLogs().find((l) => l.id === state.params.id);
  if (!log) {
    navigate("history");
    return "";
  }
  const items = log.exercises.map((ex) => `
    <div class="log-entry">
      <div class="log-ex"><b>${esc(ex.name)}</b></div>
      ${ex.setRows.map((s, i) => `<div class="log-ex">Set ${i + 1}: ${esc(s.weight) || "-"} &times; ${esc(s.reps) || "-"}</div>`).join("")}
    </div>
  `).join("");
  return `
    ${topbar(log.day, { back: true })}
    <p style="margin-bottom:12px;">${esc(log.week)} &middot; ${new Date(log.date).toLocaleString()}</p>
    <div class="card">${items}</div>
    <button class="btn danger" data-action="delete-log" data-id="${esc(log.id)}">Delete this log</button>
  `;
}

// ---------- SETTINGS screen ----------

function renderSettings() {
  const settings = Store.getSettings();
  const program = Store.getProgram();
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
      <h3>Data source</h3>
      <p>${program ? `Imported ${new Date(program.importedAt).toLocaleDateString()}` : "No program imported"}</p>
      <div style="height:10px"></div>
      <button class="btn" data-action="go-import">Import / change program</button>
      ${program?.source?.type === "sheet" ? `<div style="height:10px"></div><button class="btn" data-action="refresh-sheet">Refresh from Google Sheet</button>` : ""}
    </div>
    <div class="card">
      <h3>Reset</h3>
      <p>Clears your imported program and all logged workouts from this device.</p>
      <div style="height:10px"></div>
      <button class="btn danger" data-action="reset-all">Erase all data</button>
    </div>
  `;
}

async function refreshSheet() {
  const program = Store.getProgram();
  if (!program?.source?.url) return;
  toast("Refreshing...");
  try {
    const csvText = await fetchGoogleSheetCsv(program.source.url);
    const rows = parseCSV(csvText);
    const { headers, records } = rowsToObjects(rows);
    const mapping = {};
    FIELD_ORDER.forEach((f) => {
      mapping[f] = program.mapping[f] && headers.includes(program.mapping[f]) ? program.mapping[f] : null;
    });
    Store.setProgram({ ...program, headers, records, mapping, importedAt: new Date().toISOString() });
    toast("Program refreshed");
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
      if (state.screen === "mapping") navigate("import");
      else if (state.screen === "import") navigate(Store.getProgram() ? "program" : "program");
      else if (state.screen === "workout") navigate("program");
      else if (state.screen === "log-detail") navigate("history");
      else navigate("program");
      break;
    }
    case "import-sheet": handleImportSheet(); break;
    case "import-paste": handleImportPaste(); break;
    case "confirm-mapping": confirmMapping(); break;
    case "open-workout": navigate("workout", { week: el.dataset.week, day: el.dataset.day }); break;
    case "cancel-workout": activeDraft = null; navigate("program"); break;
    case "finish-workout": finishWorkout(); break;
    case "toggle-set": {
      const ex = activeDraft.exercises[+el.dataset.ex];
      const row = ex.setRows[+el.dataset.set];
      row.done = !row.done;
      render();
      break;
    }
    case "open-log": navigate("log-detail", { id: el.dataset.id }); break;
    case "delete-log": Store.deleteLog(el.dataset.id); toast("Log deleted"); navigate("history"); break;
    case "set-units": {
      const settings = Store.getSettings();
      settings.units = el.dataset.units;
      Store.setSettings(settings);
      render();
      break;
    }
    case "refresh-sheet": refreshSheet(); break;
    case "reset-all": {
      if (confirm("Erase your imported program and all logged workouts? This can't be undone.")) {
        Store.clearAll();
        activeDraft = null;
        toast("All data erased");
        navigate("program");
      }
      break;
    }
  }
}

function onInput(e) {
  const el = e.target;
  if (el.dataset.kind && activeDraft) {
    const ex = activeDraft.exercises[+el.dataset.ex];
    const row = ex.setRows[+el.dataset.set];
    row[el.dataset.kind] = el.value;
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
  activeDraft = null;
  navigate(btn.dataset.route);
});

// ---------- boot ----------

navigate(Store.getProgram() ? "program" : "program");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
