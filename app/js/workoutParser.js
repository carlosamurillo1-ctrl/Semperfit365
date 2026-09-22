// Parses the "block per exercise, weeks as rows, sets as columns" sheet
// format used by real training-log spreadsheets, e.g.:
//
//   <blank>          Phase 1 - Friday (WORKOUT C)
//   Incline Bench    Rep goal: 5-10      Rest time: 2-3 min.
//   Perform 2-3 warm-up sets...
//   Week   WU set   Set 1   Set 2   Set 3          Notes
//   1      WEEK 1                                   4615
//   2      WEEK 2                                   5990
//   ...
//
// Exercise blocks may or may not be separated by blank rows, may or may not
// have a Rep goal / Rest time / warm-up note line, and may or may not have a
// Notes column — all of that is detected structurally, not assumed fixed.
//
// A single paste/sheet can also contain more than one day back to back (e.g.
// a user copies several tabs' worth of cells at once); parseWorkoutSheets()
// splits on day-title-looking lines (mentions a weekday, "Phase N", "Workout
// A/B/C", or a whole-cell body-part split name like "Push" or "Legs/Shoulders")
// so each day's exercises stay attributed to the right day.

import { parseCSV } from "./csv.js";

const DAY_TITLE_HINT = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\bphase\s*[0-9]|\bworkout\s+[a-z]\b/i;

// Matches only when the ENTIRE row is one of these split-day names (optionally
// combined, e.g. "Legs/Shoulders") -- deliberately whole-line, not substring,
// so it doesn't misfire on exercise names that happen to contain a body part
// (e.g. "Tricep Push Down" or "Leg Extensions").
const SPLIT_NAME = "push|pull|legs?|arms?|shoulders?|upper(\\s*body)?|lower(\\s*body)?|full\\s*body|chest|back|core";
const DAY_SPLIT_NAME_EXACT = new RegExp(`^(${SPLIT_NAME})(\\s*[/&+]\\s*|\\s+and\\s+|\\s*,\\s*)?(${SPLIT_NAME})?$`, "i");

function isBlankRow(row) {
  return row.every((c) => c.trim() === "");
}

function firstNonEmptyCell(row) {
  return (row.find((c) => c.trim() !== "") || "").trim();
}

function findCellIndex(row, pattern) {
  return row.findIndex((c) => pattern.test(c.trim()));
}

function rowLooksLikeDataRow(row) {
  const joined = row.join(" ");
  if (/week\s*0*[0-9]+/i.test(joined)) return true;
  const first = row[0]?.trim();
  return /^[0-9]{1,3}$/.test(first || "");
}

function parseWeekNumber(row, fallbackIndex) {
  for (const cell of row) {
    const m = cell.match(/week\s*0*([0-9]+)/i);
    if (m) return parseInt(m[1], 10);
  }
  const first = row[0]?.trim();
  if (/^[0-9]+$/.test(first || "")) return parseInt(first, 10);
  return fallbackIndex + 1;
}

function extractLabeledValue(row, labelPattern) {
  const cell = row.map((c) => c.trim()).find((c) => labelPattern.test(c));
  if (!cell) return "";
  return cell.replace(labelPattern, "").replace(/^:?\s*/, "").trim();
}

function looksLikeDayTitle(row) {
  if (isBlankRow(row)) return false;
  const rowText = row.join(" ");
  if (findCellIndex(row, /^week$/i) !== -1) return false;
  if (/rep\s*goal/i.test(rowText) || /rest\s*time/i.test(rowText)) return false;
  return DAY_TITLE_HINT.test(rowText) || DAY_SPLIT_NAME_EXACT.test(rowText.trim());
}

/** Split a sheet's rows into one chunk per detected day (see DAY_TITLE_HINT above). */
function splitIntoDayChunks(rows) {
  const chunks = [];
  let chunk = [];
  let chunkStarted = false;
  for (const row of rows) {
    if (looksLikeDayTitle(row) && chunkStarted) {
      chunks.push(chunk);
      chunk = [];
      chunkStarted = false;
    }
    chunk.push(row);
    if (!isBlankRow(row)) chunkStarted = true;
  }
  if (chunk.some((r) => !isBlankRow(r))) chunks.push(chunk);
  return chunks;
}

/** Parse one day's worth of rows into { dayTitle, exercises }. */
function parseDayRows(rows) {
  let dayTitle = null;
  const exercises = [];
  let current = null;
  let sawFirstNonBlank = false;

  const blankExercise = (name) => ({ name, repGoal: "", restTime: "", setupNotes: [], header: null, dataRows: [] });

  function finalizeCurrent() {
    if (current && current.header && current.dataRows.length) {
      exercises.push({
        name: current.name || `Exercise ${exercises.length + 1}`,
        repGoal: current.repGoal,
        restTime: current.restTime,
        setupNote: current.setupNotes.join(" ").trim(),
        setLabels: current.header.setCols.map((c) => c.label),
        weeks: current.dataRows.map((row, i) => ({
          week: parseWeekNumber(row, i),
          values: current.header.setCols.map((c) => (row[c.idx] ?? "").trim()),
          notes: current.header.notesCol >= 0 ? (row[current.header.notesCol] ?? "").trim() : "",
        })),
      });
    }
    current = null;
  }

  for (const row of rows) {
    if (isBlankRow(row)) continue;

    if (!sawFirstNonBlank) {
      sawFirstNonBlank = true;
      const rowText = row.join(" ");
      const isExerciseTitle = /rep\s*goal/i.test(rowText) || /rest\s*time/i.test(rowText) || findCellIndex(row, /^week$/i) !== -1;
      if (!isExerciseTitle) {
        dayTitle = firstNonEmptyCell(row);
        continue;
      }
    }

    const weekIdx = findCellIndex(row, /^week$/i);
    if (weekIdx !== -1) {
      if (!current) current = blankExercise("Exercise");
      const notesCol = findCellIndex(row, /^notes?$/i);
      const end = notesCol >= 0 ? notesCol : row.length;
      const setCols = [];
      for (let i = weekIdx + 1; i < end; i++) {
        const label = row[i].trim();
        if (label) setCols.push({ idx: i, label });
      }
      current.header = { weekCol: weekIdx, notesCol, setCols };
      continue;
    }

    if (current && current.header) {
      if (rowLooksLikeDataRow(row)) {
        current.dataRows.push(row);
        continue;
      }
      if (current.dataRows.length === 0) {
        // stray formatting row between the header and the first data row — ignore
        continue;
      }
      finalizeCurrent();
    }

    // this row starts a new exercise title, or is a setup/instruction note
    // for an exercise whose title we already saw but that has no header yet
    if (current && !current.header) {
      if (current.setupNotes.length < 2) {
        current.setupNotes.push(firstNonEmptyCell(row));
        continue;
      }
      // stuck too long without ever finding a "Week" header — this isn't a
      // setup note, it's unrelated trailing content; drop the dangling
      // exercise (it never got a header, so nothing real is lost) and treat
      // this row as a fresh title instead.
      current = null;
    }

    const name = firstNonEmptyCell(row);
    current = blankExercise(name);
    current.repGoal = extractLabeledValue(row, /^rep\s*goal\s*/i);
    current.restTime = extractLabeledValue(row, /^rest\s*time\s*/i);
  }
  finalizeCurrent();

  return { dayTitle, exercises };
}

/**
 * Parse raw sheet text (tab- or comma-delimited) into a single day + its
 * exercises. If the text actually contains multiple days back to back, only
 * the first is returned — use parseWorkoutSheets() for multi-day pastes.
 * Returns { dayTitle: string|null, exercises: [{ name, repGoal, restTime,
 * setupNote, setLabels: string[], weeks: [{ week, values: string[], notes }] }] }
 */
export function parseWorkoutSheet(text) {
  return parseDayRows(parseCSV(text));
}

/** Parse raw sheet text into one or more days, splitting on day-title lines. */
export function parseWorkoutSheets(text) {
  const rows = parseCSV(text);
  const chunks = splitIntoDayChunks(rows);
  return chunks.map(parseDayRows).filter((d) => d.exercises.length > 0);
}
