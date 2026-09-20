// Thin localStorage wrapper. All app persistence lives here.
//
// Program shape:
// {
//   days: [{
//     id, name, source: {type, url?} | null,
//     exercises: [{
//       id, name, repGoal, restTime, setupNote, videoUrl, setLabels: string[],
//       weeks: [{ week, values: string[], notes, updatedAt: string|null }]
//     }]
//   }],
//   importedAt
// }

const KEYS = {
  program: "sf365.program.v2",
  settings: "sf365.settings.v1",
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

export const Store = {
  getProgram() {
    return read(KEYS.program, null);
  },
  setProgram(program) {
    write(KEYS.program, program);
  },
  clearProgram() {
    localStorage.removeItem(KEYS.program);
  },

  /** Append a freshly-parsed day { name, source, exercises } to the program (creating one if needed). Returns the new day's id. */
  addDay(day) {
    const program = this.getProgram() || { days: [], importedAt: new Date().toISOString() };
    const dayWithIds = {
      id: uid(),
      name: day.name,
      source: day.source || null,
      exercises: day.exercises.map((ex) => ({
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
          notes: w.notes || "",
          updatedAt: null,
        })),
      })),
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
        notes: "",
        updatedAt: null,
      })),
    };
    day.exercises.push(newEx);
    this.setProgram(program);
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

  clearAll() {
    this.clearProgram();
    localStorage.removeItem(KEYS.settings);
  },
};
