// Builds a day's meals that land on a calorie and macro target, picking from
// the bundled food library and respecting a diet pattern and a list of things
// to avoid.
//
// There is no model behind this and no network call -- it's arithmetic and a
// pick order, so it runs instantly on a phone with no signal and gives the
// same answer twice. The cost of that is a fixed food set: it can't invent a
// recipe, only assemble one from what's in js/foodLibrary.js.
//
// What it produces is a STARTING POINT, the way a coach's first draft is. The
// numbers that matter are what the scale does over the following fortnight.

import { FOOD_LIBRARY, macrosFor } from "./foodLibrary.js";
import { allowedFoods, allowedForSlot, tagsFor } from "./foodTags.js";

/** Calories per pound of bodyweight to hold weight steady. Trainer's
 * rule-of-thumb numbers: quick, defensible, and rougher than an equation that
 * also knows height, age and sex -- two people at the same weight can genuinely
 * need a few hundred calories apart. The weekly weigh-in is what corrects it. */
export const ACTIVITY_LEVELS = [
  { id: "sedentary", label: "Desk job, little training", perLb: 13 },
  { id: "light", label: "Training 2-3x a week", perLb: 15 },
  { id: "active", label: "Training 4-5x a week", perLb: 16 },
  { id: "very", label: "Training 6x+, or on your feet all day", perLb: 18 },
];

export const GOALS = [
  { id: "lose", label: "Lose fat", dir: -1 },
  { id: "maintain", label: "Hold steady", dir: 0 },
  { id: "gain", label: "Build muscle", dir: 1 },
];

/** Pounds per week someone can pick. Anything faster than 1.5 lb/wk down is
 * mostly water and muscle, and faster than 0.75 up is mostly fat. */
export const RATES = [0.25, 0.5, 0.75, 1, 1.5];

const KCAL_PER_LB = 3500;

/** Percentage of calories from each macro. 40/30/30 protein-first is the
 * default: it's the split most physique coaching works to, and it keeps
 * protein high enough to hold muscle on a deficit. Editable per plan -- a
 * client who trains hard and eats low fat wants different numbers. */
export const DEFAULT_SPLIT = { protein: 40, carbs: 30, fat: 30 };

/** Brings a split back to 100%. Someone typing three boxes will not always
 * land on it, and silently generating against 94% would quietly produce a
 * plan that misses every target. */
export function normalizeSplit(split) {
  const p = Math.max(0, Number(split?.protein) || 0);
  const c = Math.max(0, Number(split?.carbs) || 0);
  const f = Math.max(0, Number(split?.fat) || 0);
  const total = p + c + f;
  if (total <= 0) return { ...DEFAULT_SPLIT };
  // Fat takes the remainder of the ROUNDED other two, not of the raw ones --
  // otherwise 40/40/40 rounds to 33/33/33 and quietly adds up to 99.
  const protein = Math.round((p / total) * 100);
  const carbs = Math.round((c / total) * 100);
  return { protein, carbs, fat: 100 - protein - carbs };
}

/** Nobody is generated a plan below this, whatever the arithmetic says. A
 * target this low stops being a diet and starts being a medical question. */
const CALORIE_FLOOR = 1200;
/** Deepest cut from maintenance, as a fraction. Keeps an aggressive rate on a
 * light person from producing something absurd. */
const MAX_DEFICIT = 0.25;

const round = (n, step = 1) => Math.round(n / step) * step;

/**
 * Daily calorie and macro targets.
 * Returns { calories, protein, carbs, fat, maintenance, adjusted, notes[] }.
 * `notes` explains anything the guardrails changed, so the screen can say so
 * instead of silently handing back a different number than was asked for.
 */
export function calcTargets({ weightLb, activity = "light", goal = "maintain", rate = 0.5, diet = "Anything", split = DEFAULT_SPLIT }) {
  const weight = Number(weightLb) || 0;
  const notes = [];
  if (weight <= 0) return null;

  const level = ACTIVITY_LEVELS.find((a) => a.id === activity) || ACTIVITY_LEVELS[1];
  const maintenance = weight * level.perLb;
  const dir = (GOALS.find((g) => g.id === goal) || GOALS[1]).dir;
  const dailySwing = dir === 0 ? 0 : (Number(rate) || 0) * KCAL_PER_LB / 7;

  let calories = maintenance + dir * dailySwing;

  if (dir < 0) {
    const floorFromPercent = maintenance * (1 - MAX_DEFICIT);
    if (calories < floorFromPercent) {
      calories = floorFromPercent;
      notes.push(`${rate} lb a week is a steeper cut than makes sense at this bodyweight — eased back to about a quarter below maintenance.`);
    }
    if (calories < CALORIE_FLOOR) {
      calories = CALORIE_FLOOR;
      notes.push(`Held at ${CALORIE_FLOOR} calories, the lowest this will generate. Going under that is a conversation with a doctor, not an app.`);
    }
  }

  // The split decides the macros; calories decide the size.
  const sp = normalizeSplit(split);
  let protein = round((calories * sp.protein / 100) / 4, 5);
  let carbs = round((calories * sp.carbs / 100) / 4, 5);
  let fat = round((calories * sp.fat / 100) / 9, 5);

  // Keto isn't just a food filter -- it's a different macro split. Carbs go to
  // a ketogenic ceiling and fat takes the calories they gave up. Without this
  // the targets would still ask for 300g of carbs from a food list that has
  // nothing to supply them, and the plan would read as wildly off.
  if (diet === "Keto") {
    const before = carbs;
    carbs = Math.min(carbs, 40);
    fat = round((calories - protein * 4 - carbs * 4) / 9, 5);
    if (before > carbs) {
      notes.push(`Keto overrides the split: carbs held to 40g (the ${sp.carbs}% would have been ${before}g) and those calories put into fat.`);
    }
  }

  if (carbs < 0) {
    // Happens at very low calories: protein and fat alone overrun the budget.
    // Trim fat back toward its floor rather than cutting protein.
    carbs = 0;
    fat = round(Math.max((calories - protein * 4) / 9, weight * 0.25), 5);
    notes.push("Calories are tight enough that this is nearly all protein and fat.");
  }

  return {
    calories: round(calories, 10),
    protein, carbs, fat,
    split: sp,
    maintenance: round(maintenance, 10),
    adjusted: round(dir * dailySwing, 10),
    notes,
  };
}

/** How the day is divided up. Shares are of total calories and sum to 1. */
// Fat appears in three meals, not one. With a single fat slot in the day the
// fat target is unreachable without an absurd portion of it -- and real plans
// put oil in the cooking, avocado on the lunch and nuts in the snack anyway.
export const MEAL_TEMPLATE = [
  { slot: "Breakfast", share: 0.22, roles: ["protein", "carb", "fruit"] },
  { slot: "Mid-morning snack", share: 0.12, roles: ["protein", "fruit"] },
  { slot: "Lunch", share: 0.27, roles: ["protein", "carb", "veg", "fat"] },
  { slot: "Afternoon snack", share: 0.12, roles: ["protein", "fat"] },
  { slot: "Dinner", share: 0.27, roles: ["protein", "carb", "veg", "fat"] },
];

/** Keto has no carb slot to fill, so the day leans on fat instead. */
const KETO_TEMPLATE = [
  { slot: "Breakfast", share: 0.25, roles: ["protein", "fat", "veg"] },
  { slot: "Mid-morning snack", share: 0.12, roles: ["protein", "fat"] },
  { slot: "Lunch", share: 0.28, roles: ["protein", "veg", "fat"] },
  { slot: "Afternoon snack", share: 0.1, roles: ["protein", "fat"] },
  { slot: "Dinner", share: 0.25, roles: ["protein", "veg", "fat"] },
];

/** Portion sizes get rounded to something a person would actually weigh or
 * count, per unit. Nobody serves 147g of rice. */
function tidyQty(unitLabel, grams, gramsPerUnit) {
  const raw = grams / gramsPerUnit;
  if (unitLabel === "g") return Math.max(5, round(raw, 5));
  if (raw < 1) return Math.max(0.5, round(raw, 0.5));
  if (raw < 4) return round(raw, 0.5);
  return Math.max(1, Math.round(raw));
}

/** The unit a person would say out loud for roughly this much: prefer a
 * household unit when the count lands sensibly, else fall back to grams. */
function pickUnit(food, grams) {
  for (const [label, perUnit] of food.units) {
    if (label === "g") continue;
    const count = grams / perUnit;
    if (count >= 0.5 && count <= 12) return [label, perUnit];
  }
  const gUnit = food.units.find((u) => u[0] === "g");
  return gUnit || food.units[0];
}

/** Builds the item, then makes sure ROUNDING didn't push it past the ceiling.
 * Tidying 400g of yogurt to "2.5 containers" quietly becomes 425g, which is
 * how a cap gets honoured everywhere except the number people actually read. */
function buildItem(food, grams, maxGrams = Infinity) {
  const [unitLabel, perUnit] = pickUnit(food, grams);
  let qty = tidyQty(unitLabel, grams, perUnit);
  const step = unitLabel === "g" ? 5 : (qty <= 4 ? 0.5 : 1);
  while (qty * perUnit > maxGrams && qty - step > 0) qty = round(qty - step, step);
  const macros = macrosFor(food, unitLabel, qty);
  return { foodId: food.id, name: food.name, qty, unit: unitLabel, role: tagsFor(food).role, ...macros };
}

const sum = (items, key) => items.reduce((n, i) => n + (i[key] || 0), 0);

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

/** The most of one food anyone is going to eat at a sitting. Vegetables get a
 * lower ceiling than a starch purely because 400g of broccoli is a joke. */
const capFor = (role) => (role === "veg" ? 300 : role === "fruit" ? 250 : 400);

/** The smallest portion worth writing down. Fats get a much lower floor than
 * everything else: 15g of olive oil is 133 calories, so a one-size floor makes
 * the fat target impossible to come down to on a day already carrying fat in
 * its cheese and eggs. A teaspoon is a real portion. */
const floorFor = (role) => (role === "fat" ? 5 : 15);

/** The most of a given household unit anyone puts on a plate at one sitting.
 * A flat gram ceiling isn't enough: 400g is a reasonable plate of rice and an
 * absurd eleven slices of bread, and the plan is only worth anything if a real
 * person would recognise the portion. Unknown units fall back to the gram cap. */
const MAX_UNITS = {
  slice: 4, oz: 10, cup: 3, "cup cooked": 3, scoop: 2, tbsp: 4, tsp: 4,
  medium: 2, large: 3, small: 3, egg: 5, link: 4, patty: 2, breast: 2,
  thigh: 2, fillet: 2, bagel: 2, bun: 2, container: 2, bottle: 1, glass: 1,
  can: 2, bar: 2, piece: 4, handful: 3, block: 1,
};

/** Grams ceiling for one food: the role's cap, tightened by what a sane number
 * of its own serving unit comes to, and by how much of the meal one item
 * should be allowed to take over. */
function ceilingFor(food, role, mealCalories, targets = null) {
  let cap = capFor(role);
  const [unitLabel, perUnit] = food.units[0];
  const maxUnits = MAX_UNITS[unitLabel];
  if (maxUnits) cap = Math.min(cap, maxUnits * perUnit);

  // No single item should be most of a meal -- 280g of feta hits a fat target
  // and is not a thing anyone eats. But how much of a meal one macro may take
  // depends on the diet: capping fat at 45% of every meal makes a ketogenic
  // day, which is fat by design, impossible to reach. So scale the allowance
  // with the share that macro has of the day's calories.
  // A very low carb target makes the vegetables the biggest carb source in the
  // day. Three generous portions of them is enough to put someone out of
  // ketosis on a plan that calls itself keto.
  // On a very low carb target, no single item should be able to spend much of
  // the day's carbs on its own -- whatever role it plays. Edamame is a protein
  // and passes a per-100g keto filter, but two and a half cups of it is 35g of
  // carbohydrate and the whole day's budget.
  if (targets && targets.carbs <= 60) {
    const carbPer100 = food.per100g.carbs || 0;
    if (carbPer100 > 0) cap = Math.min(cap, (targets.carbs * 0.35 / carbPer100) * 100);
  }

  let shareCap = role === "protein" ? 0.75 : role === "carb" ? 0.65 : role === "fat" ? 0.45 : 0.3;
  if (targets && targets.calories > 0 && (role === "fat" || role === "carb")) {
    const key = role === "fat" ? "fat" : "carbs";
    const perGram = role === "fat" ? 9 : 4;
    const dayShare = (targets[key] * perGram) / targets.calories;
    shareCap = clamp(dayShare * 1.25, shareCap, 0.75);
  }
  const per100 = food.per100g.calories || 1;
  if (mealCalories > 0) cap = Math.min(cap, (mealCalories * shareCap / per100) * 100);
  return Math.max(cap, floorFor(role));
}

/** Macros of a set of {food, grams} picks, before any display rounding. */
function rawMacros(chosen) {
  const out = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const c of chosen) {
    const k = c.grams / 100;
    out.calories += (c.food.per100g.calories || 0) * k;
    out.protein += (c.food.per100g.protein || 0) * k;
    out.carbs += (c.food.per100g.carbs || 0) * k;
    out.fat += (c.food.per100g.fat || 0) * k;
  }
  return out;
}

const calsOf = (chosen) => rawMacros(chosen).calories;

/** Nudges the whole day onto its targets.
 *
 * Sizing each meal on its own can't get there: bread, oats and even broccoli
 * carry protein, so a day built from "this meal's share of protein" overshoots
 * every time by however much the carbs happened to contribute. Rather than
 * guess that in advance, build the day and then correct it -- scale the protein
 * foods until the protein lands, scale the starches and fats until the calories
 * do, and repeat, because each fix disturbs the other. Portion ceilings are
 * respected throughout, so this converges or gives up still sane. */
/** Resize every food in one role so the day's total of one macro lands on
 * target, counting what the other roles already contribute. Bread brings
 * protein, protein brings fat, fruit brings carbs -- so each role has to be
 * sized against the rest, not in isolation. */
function adjustRole(all, role, macroKey, target) {
  const items = all.filter((c) => c.role === role);
  if (!items.length) return;
  const fromRole = rawMacros(items)[macroKey];
  if (fromRole <= 0) return;
  const fromOthers = rawMacros(all)[macroKey] - fromRole;
  const needed = target - fromOthers;
  const factor = clamp(needed / fromRole, 0.3, 2.5);
  for (const c of items) c.grams = clamp(c.grams * factor, floorFor(c.role), c.cap);
}

function balanceToTargets(all, targets) {
  // Each pass disturbs the others -- growing the fat to hit a fat target adds
  // calories the carbs then have to give back -- so it's iterated rather than
  // solved. Protein goes first because it's the macro worth protecting.
  // On keto there is no starch in the day at all, so nothing answers to the
  // carb target and the vegetables quietly run away with it. Whichever role is
  // actually carrying the carbohydrate is the one to size against it.
  const carbRole = all.some((c) => c.role === "carb") ? "carb" : "veg";
  for (let i = 0; i < 15; i++) {
    adjustRole(all, "protein", "protein", targets.protein);
    adjustRole(all, "fat", "fat", targets.fat);
    adjustRole(all, carbRole, "carbs", targets.carbs);
  }
  // Portion ceilings can leave the day short no matter how the split is
  // scaled; spend whatever is left on the starches.
  const calErr = rawMacros(all).calories - targets.calories;
  if (calErr < -Math.max(70, targets.calories * 0.025)) {
    const fillers = all.filter((c) => c.role === "carb" || c.role === "fat");
    const fromThem = rawMacros(fillers).calories;
    if (fromThem > 0) {
      const factor = clamp((fromThem - calErr) / fromThem, 1, 2.5);
      for (const c of fillers) c.grams = clamp(c.grams * factor, floorFor(c.role), c.cap);
    }
  }
}

export function mealTotals(items) {
  return {
    calories: Math.round(sum(items, "calories")),
    protein: Math.round(sum(items, "protein") * 10) / 10,
    carbs: Math.round(sum(items, "carbs") * 10) / 10,
    fat: Math.round(sum(items, "fat") * 10) / 10,
  };
}

export function planTotals(plan) {
  return mealTotals(plan.meals.flatMap((m) => m.items));
}

/** Deterministic pick that still varies between regenerates: the same seed
 * gives the same plan, a different seed shuffles which foods come up. */
function pick(list, seed, offset) {
  if (!list.length) return null;
  return list[(Math.abs(seed + offset * 7919)) % list.length];
}

/**
 * Build a day of meals hitting the targets.
 * opts: { targets, diet, avoid, seed }
 * Returns { meals: [{ slot, items, totals }], totals, targets, filters, seed,
 *           shortfall: [] } where shortfall names any role that couldn't be
 * filled at all, so the screen can say why a plan looks thin instead of
 * quietly handing over a day that misses the target.
 */
export function generatePlan({ targets, diet = "Anything", avoid = [], seed = 1 }) {
  const filters = { diet, avoid };
  const template = diet === "Keto" ? KETO_TEMPLATE : MEAL_TEMPLATE;
  const shortfall = new Set();

  for (const role of ["protein", "carb", "veg", "fruit", "fat"]) {
    if (!allowedFoods(filters, role).length) shortfall.add(role);
  }

  // Foods already placed somewhere in the day. A plan that puts deli ham in
  // breakfast, lunch and dinner satisfies every macro check and reads like a
  // punishment, so each slot prefers something not used yet.
  const used = new Set();

  const meals = template.map((m, mi) => {
    const mealCals = targets.calories * m.share;
    const mealProtein = targets.protein * m.share;
    // Chosen foods and the grams we intend, kept apart from the built items so
    // a portion can be resized before anything is rounded for display.
    const chosen = [];

    for (const [ri, role] of m.roles.entries()) {
      let pool = allowedForSlot(filters, role, m.slot);
      if (!pool.length) continue;
      // A demanding protein target can't be met out of lentils and chickpeas.
      // When protein is a big share of the day, pick from the leaner, denser
      // half of what's available -- the fish and the egg whites, not the
      // legumes that bring three times their protein in carbohydrate.
      if (role === "protein" && (targets.split?.protein || 0) >= 35 && pool.length > 3) {
        const density = (f) => (f.per100g.protein || 0) / (f.per100g.calories || 1);
        const ranked = [...pool].sort((a, b) => density(b) - density(a));
        pool = ranked.slice(0, Math.max(3, Math.ceil(ranked.length / 2)));
      }
      const fresh = pool.filter((f) => !used.has(f.id));
      const food = pick(fresh.length ? fresh : pool, seed + mi * 31, ri);
      if (!food) continue;
      used.add(food.id);

      const cap = ceilingFor(food, role, mealCals, targets);
      let grams;
      if (role === "protein") {
        const per100 = food.per100g.protein || 1;
        grams = (mealProtein / per100) * 100;
      } else {
        const placed = calsOf(chosen);
        const share = role === "veg" || role === "fruit" ? 0.25 : 0.75;
        const budget = Math.max(0, mealCals - placed) * share;
        const per100 = food.per100g.calories || 1;
        grams = (budget / per100) * 100;
      }
      chosen.push({ food, role, cap, grams: clamp(grams, floorFor(role), cap) });
    }

    // The first pass deliberately under-spends: each role only claims a share
    // of what's left, so the meal reliably lands short. Give the remainder to
    // whatever is there to be eaten in quantity -- the carb, else the fat,
    // else the protein -- until the meal is on budget or everything is capped.
    for (let guard = 0; guard < 6; guard++) {
      const gap = mealCals - calsOf(chosen);
      if (gap <= 20) break;
      const filler = chosen.find((c) => c.role === "carb" && c.grams < c.cap)
        || chosen.find((c) => c.role === "fat" && c.grams < c.cap)
        || chosen.find((c) => c.role !== "protein" && c.grams < c.cap);
      if (!filler) break;
      const per100 = filler.food.per100g.calories || 1;
      filler.grams = clamp(filler.grams + (gap / per100) * 100, floorFor(filler.role), filler.cap);
    }

    return { slot: m.slot, chosen };
  });

  balanceToTargets(meals.flatMap((m) => m.chosen), targets);

  // Sane portion ceilings mean a big day simply can't be reached by making
  // three items larger -- and shouldn't be. A coach writing a 3,200 calorie
  // day adds a fourth food, they don't serve eleven slices of bread. So top up
  // by ADDING to whichever meal is furthest below its share, then rebalance.
  for (let guard = 0; guard < 22; guard++) {
    const all = meals.flatMap((m) => m.chosen);
    const got = rawMacros(all);
    const gap = targets.calories - got.calories;
    const proteinGap = targets.protein - got.protein;
    // Protein can be short while calories are fine -- a restricted diet runs
    // out of protein foods long before it runs out of calories. Either being
    // short is reason to add something.
    if (gap < Math.max(80, targets.calories * 0.03)
      && proteinGap < Math.max(10, targets.protein * 0.08)) break;

    // Whichever macro is furthest behind decides what to reach for, and the
    // meals furthest below their share get it first.
    const behind = [
      ["protein", proteinGap * 4],
      ["carb", (targets.carbs - got.carbs) * 4],
      ["fat", (targets.fat - got.fat) * 9],
    ].sort((a, b) => b[1] - a[1]);
    const wantRole = behind[0][0];
    const order = template
      .map((t, i) => ({ i, short: targets.calories * t.share - calsOf(meals[i].chosen) }))
      .sort((a, b) => b.short - a.short);

    let added = false;
    // One meal running out of options it hasn't already used is no reason to
    // stop: try the next meal, and the other filler role, before giving up.
    // On keto, topping up with anything carb-shaped is how a "keto" day ends
    // up at 65g of carbs and out of ketosis. Fat and protein only.
    const tryRoles = [wantRole, ...behind.map((b) => b[0]).filter((r) => r !== wantRole)]
      .filter((r) => diet !== "Keto" || r !== "carb");
    outer: for (const role of tryRoles) {
      for (const { i, short } of order) {
        const already = new Set(meals[i].chosen.map((c) => c.food.id));
        const pool = allowedForSlot(filters, role, template[i].slot).filter((f) => !already.has(f.id));
        if (!pool.length) continue;
        const fresh = pool.filter((f) => !used.has(f.id));
        const food = pick(fresh.length ? fresh : pool, seed + guard * 13, i);
        used.add(food.id);
        const cap = ceilingFor(food, role, targets.calories * template[i].share, targets);
        const want = Math.max(short, gap / 3);
        const grams = clamp((want / (food.per100g.calories || 1)) * 100, floorFor(role), cap);
        meals[i].chosen.push({ food, role, cap, grams });
        added = true;
        break outer;
      }
    }
    if (!added) break;
    balanceToTargets(meals.flatMap((m) => m.chosen), targets);
  }

  // The mirror of the top-up: if the day still runs over after balancing --
  // which happens when fat rides in on the protein foods and the fat items
  // are already at their floor -- drop whole items rather than shave portions
  // to nothing. Overshooting someone's deficit is the worse way to be wrong.
  for (let guard = 0; guard < 4; guard++) {
    const all = meals.flatMap((m) => m.chosen);
    if (rawMacros(all).calories - targets.calories < Math.max(120, targets.calories * 0.05)) break;
    // Only ever remove a macro there is too MUCH of. A high-protein split on a
    // restricted diet overshoots on the protein foods alone, and a trim that
    // just takes the biggest non-protein item strips every scrap of fat and
    // carbohydrate out of the day to make room for more beans.
    const got = rawMacros(all);
    const spare = {
      carb: got.carbs > targets.carbs * 0.95,
      fat: got.fat > targets.fat * 0.95,
      fruit: got.carbs > targets.carbs * 0.95,
      veg: got.carbs > targets.carbs * 0.95,
    };
    let victim = null;
    for (const meal of meals) {
      for (const c of meal.chosen) {
        if (meal.chosen.length <= 2) continue;
        if (c.role === "protein") continue; // protein is the last thing to cut
        if (!spare[c.role]) continue;
        const cals = (c.food.per100g.calories || 0) * c.grams / 100;
        if (!victim || cals > victim.cals) victim = { meal, c, cals };
      }
    }
    if (!victim) break;
    victim.meal.chosen.splice(victim.meal.chosen.indexOf(victim.c), 1);
    balanceToTargets(meals.flatMap((m) => m.chosen), targets);
  }

  // Fat usually overruns because of what the PROTEIN brings -- sausage, whole
  // eggs, rotisserie chicken -- not because the oil is too generous. Squeezing
  // the oil to 5g doesn't fix it and looks ridiculous on the page. Swap the
  // fattiest protein for a leaner one from the same slot instead.
  for (let guard = 0; guard < 4; guard++) {
    const all = meals.flatMap((m) => m.chosen);
    if (rawMacros(all).fat <= targets.fat * 1.25) break;
    let best = null;
    meals.forEach((meal, mi) => {
      for (const c of meal.chosen) {
        if (c.role !== "protein") continue;
        const fatPerProtein = (c.food.per100g.fat || 0) / (c.food.per100g.protein || 1);
        const leaner = allowedForSlot(filters, "protein", template[mi].slot)
          .filter((f) => (f.per100g.fat || 0) / (f.per100g.protein || 1) < fatPerProtein * 0.6);
        if (!leaner.length) continue;
        if (!best || fatPerProtein > best.ratio) {
          best = { c, ratio: fatPerProtein, food: pick(leaner, seed + guard * 17, mi), mi };
        }
      }
    });
    if (!best || !best.food) break;
    best.c.food = best.food;
    best.c.cap = ceilingFor(best.food, "protein", targets.calories * template[best.mi].share, targets);
    balanceToTargets(meals.flatMap((m) => m.chosen), targets);
  }

  for (const meal of meals) {
    // An item scaled down to a token 5g of cheese is noise on the page; the
    // plan reads better without it. Vegetables are exempt -- a small side is
    // a normal thing to put on a plate.
    meal.chosen = meal.chosen.filter((c, i) => {
      if (meal.chosen.length <= 1) return true;
      const cals = (c.food.per100g.calories || 0) * c.grams / 100;
      return cals >= 25 || c.role === "veg" || c.role === "protein";
    });
    meal.items = meal.chosen.map((c) => buildItem(c.food, c.grams, c.cap));
    meal.totals = mealTotals(meal.items);
    delete meal.chosen;
  }

  const plan = { meals, targets, filters, seed, shortfall: [...shortfall] };
  plan.totals = planTotals(plan);
  return plan;
}

/** Other foods that could stand in for an item -- same role, same filters,
 * minus the one already there. */
export function alternativesFor(plan, mealIndex, itemIndex) {
  const item = plan.meals[mealIndex]?.items[itemIndex];
  if (!item) return [];
  return allowedFoods(plan.filters, item.role).filter((f) => f.id !== item.foodId);
}

/** Swap one item for another food, keeping roughly the same calories so the
 * day's totals don't lurch. Returns a new plan; the original isn't touched. */
export function swapItem(plan, mealIndex, itemIndex, newFoodId) {
  const next = structuredClone(plan);
  const meal = next.meals[mealIndex];
  const old = meal?.items[itemIndex];
  const food = FOOD_LIBRARY.find((f) => f.id === newFoodId);
  if (!old || !food) return plan;

  const targetCals = old.calories || 1;
  const grams = (targetCals / (food.per100g.calories || 1)) * 100;
  meal.items[itemIndex] = buildItem(food, Math.min(Math.max(grams, 15), 400));
  meal.totals = mealTotals(meal.items);
  next.totals = planTotals(next);
  return next;
}

/** Drop an item. */
export function removeItem(plan, mealIndex, itemIndex) {
  const next = structuredClone(plan);
  const meal = next.meals[mealIndex];
  if (!meal) return plan;
  meal.items.splice(itemIndex, 1);
  meal.totals = mealTotals(meal.items);
  next.totals = planTotals(next);
  return next;
}

/** Add a food to a meal at a given portion. */
export function addItem(plan, mealIndex, foodId, unitLabel, qty) {
  const next = structuredClone(plan);
  const meal = next.meals[mealIndex];
  const food = FOOD_LIBRARY.find((f) => f.id === foodId);
  if (!meal || !food) return plan;
  const macros = macrosFor(food, unitLabel, qty);
  meal.items.push({ foodId: food.id, name: food.name, qty, unit: unitLabel, role: tagsFor(food).role, ...macros });
  meal.totals = mealTotals(meal.items);
  next.totals = planTotals(next);
  return next;
}

/** How far the plan lands from its targets, as signed numbers and as a verdict
 * per macro. Used to show "on target" vs "160 cal under" rather than making
 * someone compare two columns of figures themselves. */
export function planAccuracy(plan) {
  const t = plan.targets;
  const got = plan.totals;
  const line = (key, tol) => {
    const diff = Math.round(got[key] - t[key]);
    return { diff, ok: Math.abs(diff) <= tol };
  };
  return {
    calories: line("calories", Math.max(100, t.calories * 0.05)),
    protein: line("protein", Math.max(10, t.protein * 0.1)),
    carbs: line("carbs", Math.max(20, t.carbs * 0.15)),
    fat: line("fat", Math.max(10, t.fat * 0.2)),
  };
}
