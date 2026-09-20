// Thin localStorage wrapper. All app persistence lives here.

const KEYS = {
  program: "sf365.program.v1",
  logs: "sf365.logs.v1",
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

  getLogs() {
    return read(KEYS.logs, []);
  },
  addLog(entry) {
    const logs = this.getLogs();
    logs.unshift(entry);
    write(KEYS.logs, logs);
  },
  deleteLog(id) {
    const logs = this.getLogs().filter((l) => l.id !== id);
    write(KEYS.logs, logs);
  },
  lastLogFor(week, day) {
    return this.getLogs().find((l) => l.week === week && l.day === day) || null;
  },
  clearLogs() {
    localStorage.removeItem(KEYS.logs);
  },

  getSettings() {
    return read(KEYS.settings, { units: "lb" });
  },
  setSettings(settings) {
    write(KEYS.settings, settings);
  },

  clearAll() {
    this.clearProgram();
    this.clearLogs();
    localStorage.removeItem(KEYS.settings);
  },
};
