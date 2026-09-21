// Thin localStorage wrapper. All app persistence lives here.
//
// A device can hold several saved *programs* (e.g. a coach hands a client
// a second, different plan later) but only one is "active" at a time --
// every method below (getProgram, addDay, getDay, etc.) reads/writes
// whichever program is currently active, exactly as if there were only
// ever one. Switching the active program (see switchProgram) never
// deletes the others.
//
// Program shape (what getProgram() returns):
// {
//   days: [{
//     id, name, source: {type, url?} | null,
//     exercises: [{
//       id, name, repGoal, restTime, setupNote, videoUrl, setLabels: string[],
//       weeks: [{ week, values: string[], reps: string[], notes, updatedAt: string|null }]
//     }]
//   }],
//   importedAt
// }
//
// On-disk shape (sf365.programs.v1):
// { activeId, programs: [{ id, name, days, importedAt, publishedId? }] }
// publishedId, when present, is that program's id in the coach-only Firestore
// customPrograms collection (see sync.js) -- how a coach's own custom program
// gets assigned to a new client from the Add Client screen.

const KEYS = {
  programs: "sf365.programs.v1",
  legacyProgram: "sf365.program.v2", // pre-multi-program single program, migrated in place
  settings: "sf365.settings.v1",
  cardioLog: "sf365.cardioLog.v1",
  exerciseLibrary: "sf365.exerciseLibrary.v1",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable; fail silently, app still works in-memory for the session
  }
}

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function readState() {
  const state = read(KEYS.programs, null);
  if (state) return state;
  const legacy = read(KEYS.legacyProgram, null);
  if (legacy) {
    const migrated = {
      activeId: "default",
      programs: [{ id: "default", name: "My Program", days: legacy.days, importedAt: legacy.importedAt }],
    };
    write(KEYS.programs, migrated);
    return migrated;
  }
  return null;
}

function writeState(state) {
  write(KEYS.programs, state);
}

function activeProgramOf(state) {
  if (!state) return null;
  return state.programs.find((p) => p.id === state.activeId) || state.programs[0] || null;
}

const changeListeners = [];

export const Store = {
  /** Called after every active-program write (including clear/switch), with the new program (or null). Used to drive cloud sync. */
  onChange(fn) {
    changeListeners.push(fn);
    return () => {
      const i = changeListeners.indexOf(fn);
      if (i >= 0) changeListeners.splice(i, 1);
    };
  },

  getProgram() {
    const active = activeProgramOf(readState());
    return active ? { days: active.days, importedAt: active.importedAt } : null;
  },
  setProgram(program) {
    let state = readState();
    if (!state) {
      const id = uid();
      state = { activeId: id, programs: [{ id, name: "My Program", days: program.days, importedAt: program.importedAt }] };
    } else {
      const active = activeProgramOf(state);
      if (active) {
        active.days = program.days;
        active.importedAt = program.importedAt;
      } else {
        const id = uid();
        state.programs.push({ id, name: "My Program", days: program.days, importedAt: program.importedAt });
        state.activeId = id;
      }
    }
    writeState(state);
    changeListeners.forEach((fn) => fn(this.getProgram()));
  },
  /** Wipes every saved program on this device, not just the active one. */
  clearProgram() {
    localStorage.removeItem(KEYS.programs);
    localStorage.removeItem(KEYS.legacyProgram);
    changeListeners.forEach((fn) => fn(null));
  },

  /** All programs saved on this device, active first-marked. */
  listPrograms() {
    const state = readState();
    if (!state) return [];
    return state.programs.map((p) => ({ id: p.id, name: p.name, dayCount: p.days.length, active: p.id === state.activeId, publishedId: p.publishedId || null }));
  },
  /** A saved program's days by id (any program, not just the active one) -- used to publish a program for clients without first switching to it. */
  getProgramDaysById(id) {
    const state = readState();
    return state?.programs.find((p) => p.id === id)?.days || null;
  },
  /** Marks (or clears, passing null) a saved program's remote "published for clients" id. */
  setProgramPublishedId(id, publishedId) {
    const state = readState();
    const p = state?.programs.find((p) => p.id === id);
    if (!p) return;
    if (publishedId) p.publishedId = publishedId;
    else delete p.publishedId;
    writeState(state);
  },
  /** Create a brand-new, separate program from parsed days and make it active. Returns its id. Doesn't touch any other saved program. */
  createProgram(name, days) {
    let state = readState() || { activeId: null, programs: [] };
    const id = uid();
    state.programs.push({ id, name, days: [], importedAt: new Date().toISOString() });
    state.activeId = id;
    writeState(state);
    (days || []).forEach((day) => {
      this.addDay({ name: day.dayTitle || day.name || "Workout", source: day.source || null, exercises: day.exercises || [] });
    });
    changeListeners.forEach((fn) => fn(this.getProgram()));
    return id;
  },
  switchProgram(id) {
    const state = readState();
    if (!state || !state.programs.some((p) => p.id === id)) return;
    state.activeId = id;
    writeState(state);
    changeListeners.forEach((fn) => fn(this.getProgram()));
  },
  renameProgram(id, name) {
    const state = readState();
    const p = state?.programs.find((p) => p.id === id);
    if (!p) return;
    p.name = name;
    writeState(state);
  },
  /** Deletes a saved program (never the last one). Returns false if it couldn't. */
  deleteProgram(id) {
    const state = readState();
    if (!state || state.programs.length <= 1) return false;
    const idx = state.programs.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    state.programs.splice(idx, 1);
    if (state.activeId === id) state.activeId = state.programs[0].id;
    writeState(state);
    changeListeners.forEach((fn) => fn(this.getProgram()));
    return true;
  },

  /** Append a freshly-parsed day { name, source, exercises } to the program (creating one if needed). Returns the new day's id. */
  addDay(day) {
    const program = this.getProgram() || { days: [], importedAt: new Date().toISOString() };
    const dayWithIds = {
      id: uid(),
      name: day.name,
      source: day.source || null,
      exercises: day.exercises.map((ex) => {
        this.saveToLibrary({ name: ex.name, repGoal: ex.repGoal, restTime: ex.restTime, videoUrl: ex.videoUrl });
        return {
          id: uid(),
          name: ex.name,
          repGoal: ex.repGoal || "",
          restTime: ex.restTime || "",
          setupNote: ex.setupNote || "",
          videoUrl: ex.videoUrl || "",
          setLabels: ex.setLabels,
          weeks: ex.weeks.map((w) => ({
            week: w.week,
            values: w.values,
            reps: w.reps || ex.setLabels.map(() => ""),
            notes: w.notes || "",
            updatedAt: null,
          })),
        };
      }),
    };
    program.days.push(dayWithIds);
    program.importedAt = new Date().toISOString();
    this.setProgram(program);
    return dayWithIds.id;
  },

  removeDay(dayId) {
    const program = this.getProgram();
    if (!program) return;
    program.days = program.days.filter((d) => d.id !== dayId);
    this.setProgram(program);
  },

  renameDay(dayId, name) {
    const program = this.getProgram();
    const day = program?.days.find((d) => d.id === dayId);
    if (!day) return;
    day.name = name;
    this.setProgram(program);
  },

  /** Add a manually-created exercise { name, repGoal, restTime, setLabels, weekCount } to a day. Returns the new exercise's id. */
  addExercise(dayId, exercise) {
    const program = this.getProgram();
    const day = program?.days.find((d) => d.id === dayId);
    if (!day) return null;
    const setLabels = exercise.setLabels?.length ? exercise.setLabels : ["Set 1"];
    const weekCount = exercise.weekCount > 0 ? exercise.weekCount : 8;
    const newEx = {
      id: uid(),
      name: exercise.name,
      repGoal: exercise.repGoal || "",
      restTime: exercise.restTime || "",
      setupNote: "",
      videoUrl: exercise.videoUrl || "",
      setLabels,
      weeks: Array.from({ length: weekCount }, (_, i) => ({
        week: i + 1,
        values: setLabels.map(() => ""),
        reps: setLabels.map(() => ""),
        notes: "",
        updatedAt: null,
      })),
    };
    day.exercises.push(newEx);
    this.setProgram(program);
    this.saveToLibrary({ name: newEx.name, repGoal: newEx.repGoal, restTime: newEx.restTime, videoUrl: newEx.videoUrl });
    return newEx.id;
  },

  /** Remove the exercise at dayId/oldExerciseId and insert a freshly-built one in its place (same position). Returns the new exercise's id. */
  replaceExercise(dayId, oldExerciseId, exercise) {
    const program = this.getProgram();
    const day = program?.days.find((d) => d.id === dayId);
    if (!day) return null;
    const idx = day.exercises.findIndex((e) => e.id === oldExerciseId);
    if (idx === -1) return null;
    const setLabels = exercise.setLabels?.length ? exercise.setLabels : ["Set 1"];
    const weekCount = exercise.weekCount > 0 ? exercise.weekCount : 8;
    const newEx = {
      id: uid(),
      name: exercise.name,
      repGoal: exercise.repGoal || "",
      restTime: exercise.restTime || "",
      setupNote: "",
      videoUrl: exercise.videoUrl || "",
      setLabels,
      weeks: Array.from({ length: weekCount }, (_, i) => ({
        week: i + 1,
        values: setLabels.map(() => ""),
        reps: setLabels.map(() => ""),
        notes: "",
        updatedAt: null,
      })),
    };
    day.exercises.splice(idx, 1, newEx);
    this.setProgram(program);
    this.saveToLibrary({ name: newEx.name, repGoal: newEx.repGoal, restTime: newEx.restTime, videoUrl: newEx.videoUrl });
    return newEx.id;
  },

  removeExercise(dayId, exerciseId) {
    const program = this.getProgram();
    if (!program) return;
    const day = program.days.find((d) => d.id === dayId);
    if (!day) return;
    day.exercises = day.exercises.filter((e) => e.id !== exerciseId);
    this.setProgram(program);
  },

  renameExercise(dayId, exerciseId, name) {
    const program = this.getProgram();
    if (!program) return;
    const day = program.days.find((d) => d.id === dayId);
    const ex = day?.exercises.find((e) => e.id === exerciseId);
    if (!ex) return;
    ex.name = name;
    this.setProgram(program);
  },

  setExerciseVideo(dayId, exerciseId, videoUrl) {
    const program = this.getProgram();
    if (!program) return;
    const day = program.days.find((d) => d.id === dayId);
    const ex = day?.exercises.find((e) => e.id === exerciseId);
    if (!ex) return;
    ex.videoUrl = videoUrl;
    this.setProgram(program);
    if (videoUrl) this.saveToLibrary({ name: ex.name, videoUrl });
  },

  // ---- Exercise library: names/reps/rest/video remembered from everything ----
  // ---- ever added to any program, so they can be reused instead of retyped. ----

  getExerciseLibrary() {
    return read(KEYS.exerciseLibrary, []).slice().sort((a, b) => a.name.localeCompare(b.name));
  },
  /** Upsert by case-insensitive name; blank fields never overwrite an existing value. */
  saveToLibrary(entry) {
    const name = (entry.name || "").trim();
    if (!name) return;
    const lib = read(KEYS.exerciseLibrary, []);
    const idx = lib.findIndex((e) => e.name.toLowerCase() === name.toLowerCase());
    const existing = idx >= 0 ? lib[idx] : { id: uid(), name, repGoal: "", restTime: "", videoUrl: "" };
    const merged = {
      id: existing.id,
      name,
      repGoal: entry.repGoal ? entry.repGoal : existing.repGoal,
      restTime: entry.restTime ? entry.restTime : existing.restTime,
      videoUrl: entry.videoUrl ? entry.videoUrl : existing.videoUrl,
    };
    if (idx >= 0) lib[idx] = merged; else lib.push(merged);
    write(KEYS.exerciseLibrary, lib);
  },
  removeFromLibrary(id) {
    write(KEYS.exerciseLibrary, read(KEYS.exerciseLibrary, []).filter((e) => e.id !== id));
  },
  clearExerciseLibrary() {
    localStorage.removeItem(KEYS.exerciseLibrary);
  },
  /** Merge a starter catalog [{name, muscleGroup, equipment}] into the library, skipping any name already present. Never overwrites existing entries. Returns how many were added. */
  seedLibraryCatalog(entries) {
    const lib = read(KEYS.exerciseLibrary, []);
    const existingNames = new Set(lib.map((e) => e.name.toLowerCase()));
    let added = 0;
    for (const entry of entries) {
      const key = entry.name.toLowerCase();
      if (existingNames.has(key)) continue;
      lib.push({ id: uid(), name: entry.name, repGoal: "", restTime: "", videoUrl: "", muscleGroup: entry.muscleGroup || "", equipment: entry.equipment || "" });
      existingNames.add(key);
      added++;
    }
    if (added) write(KEYS.exerciseLibrary, lib);
    return added;
  },

  /** Move an exercise up (-1) or down (+1) within its day's list. */
  moveExercise(dayId, exerciseId, direction) {
    const program = this.getProgram();
    if (!program) return;
    const day = program.days.find((d) => d.id === dayId);
    if (!day) return;
    const idx = day.exercises.findIndex((e) => e.id === exerciseId);
    const newIdx = idx + direction;
    if (idx < 0 || newIdx < 0 || newIdx >= day.exercises.length) return;
    const [ex] = day.exercises.splice(idx, 1);
    day.exercises.splice(newIdx, 0, ex);
    this.setProgram(program);
  },

  getDay(dayId) {
    return this.getProgram()?.days.find((d) => d.id === dayId) || null;
  },

  getExercise(dayId, exerciseId) {
    const day = this.getDay(dayId);
    return day?.exercises.find((e) => e.id === exerciseId) || null;
  },

  updateExerciseWeek(dayId, exerciseId, weekNumber, patch) {
    const program = this.getProgram();
    if (!program) return;
    const day = program.days.find((d) => d.id === dayId);
    const ex = day?.exercises.find((e) => e.id === exerciseId);
    if (!ex) return;
    const week = ex.weeks.find((w) => w.week === weekNumber);
    if (!week) return;
    Object.assign(week, patch, { updatedAt: new Date().toISOString() });
    this.setProgram(program);
  },

  addWeekToExercise(dayId, exerciseId) {
    const program = this.getProgram();
    if (!program) return null;
    const day = program.days.find((d) => d.id === dayId);
    const ex = day?.exercises.find((e) => e.id === exerciseId);
    if (!ex) return null;
    const nextWeek = ex.weeks.length ? Math.max(...ex.weeks.map((w) => w.week)) + 1 : 1;
    ex.weeks.push({
      week: nextWeek,
      values: ex.setLabels.map(() => ""),
      reps: ex.setLabels.map(() => ""),
      notes: "",
      updatedAt: null,
    });
    this.setProgram(program);
    return nextWeek;
  },

  /** Every week row across the whole program that's been touched, newest first. */
  getRecentEntries() {
    const program = this.getProgram();
    if (!program) return [];
    const entries = [];
    for (const day of program.days) {
      for (const ex of day.exercises) {
        for (const week of ex.weeks) {
          if (week.updatedAt) {
            entries.push({ dayId: day.id, dayName: day.name, exerciseId: ex.id, exerciseName: ex.name, setLabels: ex.setLabels, ...week });
          }
        }
      }
    }
    entries.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return entries;
  },

  getSettings() {
    return read(KEYS.settings, { units: "lb" });
  },
  setSettings(settings) {
    write(KEYS.settings, settings);
  },

  // ---- Cardio & steps log (one global log per device, independent of which program is active) ----

  /** { calories, steps, updatedAt } for a date ("YYYY-MM-DD"), or null if nothing logged. */
  getCardioEntry(dateStr) {
    const log = read(KEYS.cardioLog, {});
    return log[dateStr] || null;
  },
  /** Save (or, if both fields are blank, remove) a day's calories/steps. */
  setCardioEntry(dateStr, entry) {
    const log = read(KEYS.cardioLog, {});
    const calories = (entry.calories || "").toString().trim();
    const steps = (entry.steps || "").toString().trim();
    if (calories || steps) {
      log[dateStr] = { calories, steps, updatedAt: new Date().toISOString() };
    } else {
      delete log[dateStr];
    }
    write(KEYS.cardioLog, log);
  },
  /** The whole log, keyed by date string. */
  getCardioLog() {
    return read(KEYS.cardioLog, {});
  },
  clearCardioLog() {
    localStorage.removeItem(KEYS.cardioLog);
  },

  clearAll() {
    this.clearProgram();
    this.clearCardioLog();
    localStorage.removeItem(KEYS.settings);
  },
};
