// Treadmill sessions: pick a level and a duration, get an interval session
// built around three heart-rate zones.
//
// Three zones rather than the usual five, because three is what someone can
// actually hold in their head while running. Each is described by how talking
// feels, since almost nobody on a gym treadmill is wearing a chest strap and
// perceived effort tracks heart rate closely enough for this.
//
// The percentages are of maximum heart rate, for clients who do have a watch.

export const ZONES = {
  1: {
    id: 1,
    name: "Easy",
    short: "Z1",
    hr: "60-70%",
    feel: "Full sentences. You could hold a conversation.",
    purpose: "Builds the aerobic base and clears the last effort.",
    colour: "#5ee6a8",
  },
  2: {
    id: 2,
    name: "Steady",
    short: "Z2",
    hr: "70-80%",
    feel: "Short sentences only. Breathing has a rhythm.",
    purpose: "The workhorse — where most aerobic fitness is built.",
    colour: "#ffc24d",
  },
  3: {
    id: 3,
    name: "Hard",
    short: "Z3",
    hr: "80-90%",
    feel: "A word or two at a time. You want it to end.",
    purpose: "Raises the ceiling — the top end of what you can sustain.",
    colour: "#ff6a45",
  },
};

export const LEVELS = [
  { level: 1, name: "Base", blurb: "All easy and steady. No hard work at all — for a first week back, a recovery day, or a true beginner." },
  { level: 2, name: "Build", blurb: "Steady running with short pushes. The first taste of harder work." },
  { level: 3, name: "Intervals", blurb: "Even split of hard efforts and recovery. The standard session." },
  { level: 4, name: "Threshold", blurb: "Longer hard blocks, shorter recoveries. Uncomfortable on purpose." },
  { level: 5, name: "Peak", blurb: "Hard work with barely enough recovery. Only on a day you're fresh." },
];

export const DURATIONS = [20, 30, 40, 45, 60];

/** Per level: the work block, the recovery block, the zone each sits in, and
 * the zone of the steady running that fills any time left over.
 *
 * Kept as plain data so the shape of every session is visible at a glance
 * rather than buried in branching. */
// maxRounds is the important one. Without a cap, a 60 minute session at level
// 4 fills with nine threshold blocks -- around 27 minutes in zone 3, which is
// not a threshold session, it is a beasting, and it is the kind of thing that
// gets a general-population client injured or put off. Time above the cap runs
// steady instead, which is where aerobic fitness is actually built.
const RECIPES = {
  1: { workMin: 3, workZone: 2, restMin: 2, restZone: 1, fillZone: 1, maxRounds: 4, label: "Steady push" },
  2: { workMin: 3, workZone: 2, restMin: 2, restZone: 1, fillZone: 2, maxRounds: 5, label: "Steady push" },
  3: { workMin: 2, workZone: 3, restMin: 2, restZone: 1, fillZone: 2, maxRounds: 6, label: "Hard interval" },
  4: { workMin: 3, workZone: 3, restMin: 1.5, restZone: 1, fillZone: 2, maxRounds: 5, label: "Threshold block" },
  5: { workMin: 4, workZone: 3, restMin: 1, restZone: 1, fillZone: 2, maxRounds: 5, label: "Peak block" },
};

const WARMUP_MIN = 5;
const COOLDOWN_MIN = 5;

function block(minutes, zoneId, label) {
  return { minutes: Math.round(minutes * 10) / 10, zone: zoneId, label };
}

/**
 * Builds the session for a level and a total duration.
 *
 * Warm-up and cool-down come off the top first and are never skipped -- on a
 * 20 minute session they shrink rather than disappear, because going straight
 * from standing to zone 3 is how people hurt themselves.
 *
 * Returns { level, totalMinutes, blocks: [{minutes, zone, label}] }, and the
 * blocks always add up to exactly totalMinutes.
 */
export function buildSession(level, totalMinutes) {
  const recipe = RECIPES[level] || RECIPES[3];
  const total = Math.max(10, Math.min(120, Number(totalMinutes) || 30));

  // Short sessions get a proportionally shorter warm-up, but never less than
  // three minutes at either end.
  const ends = total <= 25 ? 3 : Math.min(WARMUP_MIN, total * 0.15);
  const warmup = Math.round(ends);
  const cooldown = Math.round(total <= 25 ? 3 : Math.min(COOLDOWN_MIN, total * 0.15));

  let middle = total - warmup - cooldown;
  const blocks = [block(warmup, 1, "Warm-up")];

  if (middle <= 0) {
    // Nothing left to work with -- give them an honest easy run.
    return { level, totalMinutes: total, blocks: [block(total, 1, "Easy run")] };
  }

  const roundSize = recipe.workMin + recipe.restMin;
  const rounds = Math.min(Math.floor(middle / roundSize), recipe.maxRounds);
  const intervalMinutes = rounds * roundSize;
  const steady = Math.round((middle - intervalMinutes) * 10) / 10;

  // Steady running goes *before* the hard work, not after it. Settling into a
  // rhythm and then working is how a coached session runs; finishing a set of
  // threshold blocks and then being asked for another ten steady minutes is
  // how one gets abandoned halfway.
  if (steady >= 0.5) blocks.push(block(steady, recipe.fillZone, "Steady"));

  for (let i = 0; i < rounds; i++) {
    blocks.push(block(recipe.workMin, recipe.workZone, `${recipe.label} ${i + 1}`));
    // The last recovery runs into the cool-down, so don't make them do both.
    if (i < rounds - 1) blocks.push(block(recipe.restMin, recipe.restZone, "Recover"));
    else blocks.push(block(recipe.restMin, 1, "Cool-down"));
  }

  blocks.push(block(cooldown, 1, "Cool-down"));
  return { level, totalMinutes: total, blocks: mergeAdjacent(blocks) };
}

/** Two identical zones back to back read as one longer block, which is what
 * it actually is. */
function mergeAdjacent(blocks) {
  const out = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && last.zone === b.zone && last.label === b.label) {
      last.minutes = Math.round((last.minutes + b.minutes) * 10) / 10;
    } else {
      out.push({ ...b });
    }
  }
  return out;
}

/** Minutes spent in each zone, for the summary line. */
export function zoneBreakdown(session) {
  const totals = { 1: 0, 2: 0, 3: 0 };
  session.blocks.forEach((b) => { totals[b.zone] = Math.round((totals[b.zone] + b.minutes) * 10) / 10; });
  return totals;
}

/** Rough calorie estimate. Deliberately conservative and clearly a guess --
 * treadmill consoles overstate this badly and a client comparing the two
 * should be told which to believe. Uses MET values by zone against bodyweight. */
export function estimateCalories(session, weightLb) {
  const kg = (Number(weightLb) || 175) * 0.4536;
  const METS = { 1: 6, 2: 9, 3: 12 };
  let kcal = 0;
  session.blocks.forEach((b) => { kcal += METS[b.zone] * 3.5 * kg / 200 * b.minutes; });
  return Math.round(kcal);
}

/** Flattens a session into per-second zone lookups for the guided timer. */
export function sessionTimeline(session) {
  let at = 0;
  return session.blocks.map((b) => {
    const start = at;
    at += Math.round(b.minutes * 60);
    return { ...b, startSec: start, endSec: at };
  });
}

export function totalSeconds(session) {
  return session.blocks.reduce((n, b) => n + Math.round(b.minutes * 60), 0);
}
