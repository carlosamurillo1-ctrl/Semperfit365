// Local-only nutrition tracker: calorie/macro goals, a weight log, a daily
// food diary, and simple recipes. Deliberately independent of the workout
// Store and of coach sync -- nothing here is pushed to Firestore or visible
// to a coach, same "lives only on this device" default the whole app started
// with before cloud sync was added. A client's diet is theirs to keep
// private unless a future feature explicitly changes that.
//
// Diary shape (per date "YYYY-MM-DD"):
//   { entries: [{ id, mealType, name, brand, qty, unit, calories, protein,
//                 carbs, fat, source: "manual"|"barcode"|"search"|"recipe",
//                 loggedAt }] }
//
// Goals shape: { calorieGoal, proteinGoal, carbGoal, fatGoal,
//                weightGoal, weightUnit: "lb"|"kg", startWeight }
//
// Weight log: [{ id, date: "YYYY-MM-DD", weight, note }]
//
// Recipes: [{ id, name, servings, ingredients: [{ name, qty, unit, calories,
//              protein, carbs, fat }], createdAt }]

const KEYS = {
  goals: "sf365.nutritionGoals.v1",
  weightLog: "sf365.weightLog.v1",
  diary: "sf365.foodDiary.v1",
  recipes: "sf365.recipes.v1",
  recentFoods: "sf365.recentFoods.v1",
};

const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snacks"];

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

/** "YYYY-MM-DD" in the device's local timezone (never UTC -- matches the
 * cardio calendar's date-key convention elsewhere in the app). */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

export const Nutrition = {
  MEAL_TYPES,
  todayStr,

  // ---- Goals ----

  getGoals() {
    return read(KEYS.goals, {
      calorieGoal: "",
      proteinGoal: "",
      carbGoal: "",
      fatGoal: "",
      weightGoal: "",
      weightUnit: "lb",
      startWeight: "",
    });
  },
  setGoals(goals) {
    write(KEYS.goals, goals);
  },

  // ---- Weight log ----

  getWeightLog() {
    return read(KEYS.weightLog, []).slice().sort((a, b) => a.date.localeCompare(b.date));
  },
  logWeight(dateStr, weight, note) {
    const log = read(KEYS.weightLog, []);
    const idx = log.findIndex((w) => w.date === dateStr);
    const entry = { id: idx >= 0 ? log[idx].id : uid(), date: dateStr, weight: round1(weight), note: note || "" };
    if (idx >= 0) log[idx] = entry;
    else log.push(entry);
    write(KEYS.weightLog, log);
    return entry.id;
  },
  deleteWeightEntry(id) {
    write(KEYS.weightLog, read(KEYS.weightLog, []).filter((w) => w.id !== id));
  },
  /** Most recently logged weight, or null. */
  getLatestWeight() {
    const log = this.getWeightLog();
    return log.length ? log[log.length - 1] : null;
  },

  // ---- Food diary ----

  /** { entries: [...] } for a date, always returns a usable shape even if nothing's logged. */
  getDiaryDay(dateStr) {
    const diary = read(KEYS.diary, {});
    return diary[dateStr] || { entries: [] };
  },
  addDiaryEntry(dateStr, entry) {
    const diary = read(KEYS.diary, {});
    const day = diary[dateStr] || { entries: [] };
    const withId = {
      id: uid(),
      mealType: entry.mealType || "Snacks",
      name: entry.name || "Food",
      brand: entry.brand || "",
      qty: entry.qty || "1",
      unit: entry.unit || "serving",
      calories: round1(entry.calories),
      protein: round1(entry.protein),
      carbs: round1(entry.carbs),
      fat: round1(entry.fat),
      source: entry.source || "manual",
      loggedAt: new Date().toISOString(),
    };
    day.entries.push(withId);
    diary[dateStr] = day;
    write(KEYS.diary, diary);
    this.rememberFood(withId);
    return withId.id;
  },
  deleteDiaryEntry(dateStr, entryId) {
    const diary = read(KEYS.diary, {});
    const day = diary[dateStr];
    if (!day) return;
    day.entries = day.entries.filter((e) => e.id !== entryId);
    if (day.entries.length) diary[dateStr] = day;
    else delete diary[dateStr];
    write(KEYS.diary, diary);
  },
  /** Sums calories/protein/carbs/fat across a day's entries. */
  getDayTotals(dateStr) {
    const day = this.getDiaryDay(dateStr);
    return day.entries.reduce(
      (t, e) => ({
        calories: t.calories + (e.calories || 0),
        protein: t.protein + (e.protein || 0),
        carbs: t.carbs + (e.carbs || 0),
        fat: t.fat + (e.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  },

  // ---- Recently/commonly logged foods (quick re-add, like the exercise library) ----

  getRecentFoods() {
    return read(KEYS.recentFoods, []);
  },
  rememberFood(entry) {
    const list = read(KEYS.recentFoods, []);
    const key = (n) => n.trim().toLowerCase();
    const idx = list.findIndex((f) => key(f.name) === key(entry.name) && key(f.brand || "") === key(entry.brand || ""));
    const remembered = {
      name: entry.name,
      brand: entry.brand || "",
      qty: entry.qty,
      unit: entry.unit,
      calories: entry.calories,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
    };
    if (idx >= 0) list.splice(idx, 1);
    list.unshift(remembered);
    write(KEYS.recentFoods, list.slice(0, 40));
  },

  // ---- Recipes ----

  getRecipes() {
    return read(KEYS.recipes, []).slice().sort((a, b) => a.name.localeCompare(b.name));
  },
  getRecipe(id) {
    return read(KEYS.recipes, []).find((r) => r.id === id) || null;
  },
  /** ingredients: [{ name, qty, unit, calories, protein, carbs, fat }] (per that ingredient's logged quantity, pre-summed). */
  saveRecipe(name, servings, ingredients) {
    const recipes = read(KEYS.recipes, []);
    const totals = ingredients.reduce(
      (t, i) => ({
        calories: t.calories + (Number(i.calories) || 0),
        protein: t.protein + (Number(i.protein) || 0),
        carbs: t.carbs + (Number(i.carbs) || 0),
        fat: t.fat + (Number(i.fat) || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    const recipe = {
      id: uid(),
      name,
      servings: Math.max(1, Number(servings) || 1),
      ingredients,
      totals,
      createdAt: new Date().toISOString(),
    };
    recipes.push(recipe);
    write(KEYS.recipes, recipes);
    return recipe.id;
  },
  deleteRecipe(id) {
    write(KEYS.recipes, read(KEYS.recipes, []).filter((r) => r.id !== id));
  },
  /** Per-serving macros for a recipe (its stored totals divided by its serving count). */
  perServing(recipe) {
    const s = recipe.servings || 1;
    return {
      calories: round1(recipe.totals.calories / s),
      protein: round1(recipe.totals.protein / s),
      carbs: round1(recipe.totals.carbs / s),
      fat: round1(recipe.totals.fat / s),
    };
  },

  clearAll() {
    localStorage.removeItem(KEYS.goals);
    localStorage.removeItem(KEYS.weightLog);
    localStorage.removeItem(KEYS.diary);
    localStorage.removeItem(KEYS.recipes);
    localStorage.removeItem(KEYS.recentFoods);
  },
};
