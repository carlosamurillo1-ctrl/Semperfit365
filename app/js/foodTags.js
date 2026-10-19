// What the meal-plan generator needs to know about each food that macros alone
// don't tell it: what job it does in a meal, where it came from, and what it
// might set off.
//
// Kept beside foodLibrary.js rather than inside it so the macro data stays one
// clean table, and so this -- which is judgement, not measurement -- can be
// reviewed on its own.
//
// Only two things are hand-written per food: its kind and its role, plus the
// exceptions for gluten and allergens. Vegan/vegetarian/pescatarian fall out of
// the kind, and keto falls out of the carb density, because a derived rule
// can't drift out of step with the data the way a hand-kept flag does.

import { FOOD_LIBRARY } from "./foodLibrary.js";

/** What a food does in a meal. The generator fills a slot by picking one of
 * each of the first four; "extra" and "treat" are never auto-selected -- they
 * exist so a person can swap one in deliberately. */
export const ROLES = ["protein", "carb", "veg", "fruit", "fat", "treat", "extra"];

/** Where it comes from. Drives the diet filters. */
export const KINDS = ["meat", "pork", "poultry", "fish", "shellfish", "egg", "dairy", "honey", "plant"];

export const DIETS = ["Anything", "Vegetarian", "Vegan", "Pescatarian", "Keto", "Gluten free"];

export const ALLERGENS = ["Dairy", "Egg", "Fish", "Shellfish", "Nuts", "Soy", "Gluten", "Pork"];

// id: [kind, role, glutenFree, allergens]
// glutenFree defaults true; it's written out only where it's false, so a
// missing entry can't silently claim a food is safe.
const T = {
  // ---- Meat & fish ----
  "turkey-deli": ["poultry", "protein"],
  "ham-deli": ["pork", "protein", true, ["Pork"]],
  "roast-beef-deli": ["meat", "protein"],
  "chicken-breast": ["poultry", "protein"],
  "chicken-thigh": ["poultry", "protein"],
  "rotisserie-chicken": ["poultry", "protein"],
  "ground-beef-90": ["meat", "protein"],
  "ground-beef-80": ["meat", "protein"],
  "ground-turkey": ["poultry", "protein"],
  "steak-sirloin": ["meat", "protein"],
  "pork-chop": ["pork", "protein", true, ["Pork"]],
  "bacon": ["pork", "fat", true, ["Pork"]],
  "sausage-breakfast": ["pork", "protein", true, ["Pork"]],
  "salmon": ["fish", "protein", true, ["Fish"]],
  "tuna-canned": ["fish", "protein", true, ["Fish"]],
  "tilapia": ["fish", "protein", true, ["Fish"]],
  "shrimp": ["shellfish", "protein", true, ["Shellfish"]],
  "cod": ["fish", "protein", true, ["Fish"]],

  // ---- Eggs & dairy ----
  // The hard cheeses sit under "fat", not "protein": by the portion anyone
  // actually eats they contribute far more fat than protein.
  "egg-whole": ["egg", "protein", true, ["Egg"]],
  "egg-white": ["egg", "protein", true, ["Egg"]],
  "cheese-american": ["dairy", "fat", true, ["Dairy"]],
  "cheese-cheddar": ["dairy", "fat", true, ["Dairy"]],
  "cheese-swiss": ["dairy", "fat", true, ["Dairy"]],
  "cheese-provolone": ["dairy", "fat", true, ["Dairy"]],
  "cheese-mozzarella": ["dairy", "fat", true, ["Dairy"]],
  "cheese-feta": ["dairy", "fat", true, ["Dairy"]],
  "cottage-cheese": ["dairy", "protein", true, ["Dairy"]],
  "greek-yogurt": ["dairy", "protein", true, ["Dairy"]],
  "yogurt-flavoured": ["dairy", "protein", true, ["Dairy"]],
  "milk-whole": ["dairy", "extra", true, ["Dairy"]],
  "milk-skim": ["dairy", "extra", true, ["Dairy"]],
  "almond-milk": ["plant", "extra", true, ["Nuts"]],
  "butter": ["dairy", "fat", true, ["Dairy"]],
  "cream-cheese": ["dairy", "fat", true, ["Dairy"]],

  // ---- Bread & grains ----
  "bread-white": ["plant", "carb", false, ["Gluten"]],
  "bread-wheat": ["plant", "carb", false, ["Gluten"]],
  "bread-whole-wheat": ["plant", "carb", false, ["Gluten"]],
  "bread-sourdough": ["plant", "carb", false, ["Gluten"]],
  "bread-rye": ["plant", "carb", false, ["Gluten"]],
  "bagel": ["plant", "carb", false, ["Gluten"]],
  "english-muffin": ["plant", "carb", false, ["Gluten"]],
  "tortilla-flour": ["plant", "carb", false, ["Gluten"]],
  "tortilla-corn": ["plant", "carb"],
  "pita": ["plant", "carb", false, ["Gluten"]],
  "hamburger-bun": ["plant", "carb", false, ["Gluten"]],
  "rice-white": ["plant", "carb"],
  "rice-brown": ["plant", "carb"],
  "pasta": ["plant", "carb", false, ["Gluten"]],
  // Oats are gluten-free grains, but ordinary supermarket oats are milled
  // alongside wheat and routinely carry it. Treated as not gluten-free: this
  // list is used to keep food away from someone who reacts to it, and the
  // safe direction to be wrong in is obvious.
  "oats": ["plant", "carb", false, ["Gluten"]],
  "quinoa": ["plant", "carb"],
  "cereal-cheerios": ["plant", "carb", false, ["Gluten"]],
  "granola": ["plant", "carb", false, ["Gluten", "Nuts"]],
  "potato": ["plant", "carb"],
  "sweet-potato": ["plant", "carb"],

  // ---- Fruit ----
  "apple": ["plant", "fruit"],
  "banana": ["plant", "fruit"],
  "orange": ["plant", "fruit"],
  "strawberries": ["plant", "fruit"],
  "blueberries": ["plant", "fruit"],
  "grapes": ["plant", "fruit"],
  "pineapple": ["plant", "fruit"],
  "watermelon": ["plant", "fruit"],
  "mango": ["plant", "fruit"],
  "avocado": ["plant", "fat"],

  // ---- Vegetables ----
  "broccoli": ["plant", "veg"],
  "spinach": ["plant", "veg"],
  "lettuce": ["plant", "veg"],
  "tomato": ["plant", "veg"],
  "cucumber": ["plant", "veg"],
  "carrots": ["plant", "veg"],
  "bell-pepper": ["plant", "veg"],
  "onion": ["plant", "veg"],
  "green-beans": ["plant", "veg"],
  "asparagus": ["plant", "veg"],
  "corn": ["plant", "veg"],
  // Legumes carry the protein slot on a vegan plan, so they're tagged as
  // protein even though they'd sit with the vegetables in a shop.
  "tofu-firm": ["plant", "protein", true, ["Soy"]],
  "tempeh": ["plant", "protein", true, ["Soy"]],
  "seitan": ["plant", "protein", false, ["Gluten"]],
  "lentils": ["plant", "protein"],
  "edamame": ["plant", "protein", true, ["Soy"]],
  "pea-protein": ["plant", "protein"],
  "black-beans": ["plant", "protein"],
  "chickpeas": ["plant", "protein"],

  // ---- Nuts & fats ----
  "peanut-butter": ["plant", "fat", true, ["Nuts"]],
  "almond-butter": ["plant", "fat", true, ["Nuts"]],
  "almonds": ["plant", "fat", true, ["Nuts"]],
  "walnuts": ["plant", "fat", true, ["Nuts"]],
  "cashews": ["plant", "fat", true, ["Nuts"]],
  "olive-oil": ["plant", "fat"],
  "chia": ["plant", "fat"],

  // ---- Snacks & sweets ----
  "protein-bar": ["dairy", "protein", false, ["Dairy"]],
  "protein-powder": ["dairy", "protein", true, ["Dairy"]],
  "chips-potato": ["plant", "treat"],
  "tortilla-chips": ["plant", "treat"],
  "popcorn": ["plant", "treat"],
  "chocolate-milk-bar": ["dairy", "treat", true, ["Dairy"]],
  "ice-cream": ["dairy", "treat", true, ["Dairy"]],
  "cookie": ["dairy", "treat", false, ["Gluten", "Dairy", "Egg"]],
  "rice-cake": ["plant", "carb"],

  // ---- Drinks ----
  "coffee-black": ["plant", "extra"],
  "orange-juice": ["plant", "extra"],
  "soda": ["plant", "extra"],
  "soda-diet": ["plant", "extra"],
  "beer": ["plant", "extra", false, ["Gluten"]],
  "wine-red": ["plant", "extra"],
  "sports-drink": ["plant", "extra"],

  // ---- Sauces & condiments ----
  "mayo": ["egg", "extra", true, ["Egg"]],
  "mayo-light": ["egg", "extra", true, ["Egg"]],
  "mustard": ["plant", "extra"],
  "ketchup": ["plant", "extra"],
  "ranch": ["dairy", "extra", true, ["Dairy", "Egg"]],
  "hot-sauce": ["plant", "extra"],
  "salsa": ["plant", "extra"],
  "honey": ["honey", "extra"],
  "maple-syrup": ["plant", "extra"],
  "soy-sauce": ["plant", "extra", false, ["Soy", "Gluten"]],
};

/** Carbs per 100g at or below which a food is workable on keto. Generous
 * enough to keep the vegetables in, tight enough to keep rice and bread out. */
const KETO_CARB_CEILING = 10;

/** Everything known about a food, macros included. Unknown id returns null. */
export function tagsFor(food) {
  const row = T[food.id];
  if (!row) return null;
  const [kind, role, glutenFree = true, allergens = []] = row;
  const plantOnly = kind === "plant";
  return {
    kind,
    role,
    glutenFree,
    allergens,
    vegan: plantOnly,
    vegetarian: plantOnly || kind === "egg" || kind === "dairy" || kind === "honey",
    pescatarian: plantOnly || ["egg", "dairy", "honey", "fish", "shellfish"].includes(kind),
    keto: food.per100g.carbs <= KETO_CARB_CEILING,
  };
}

/** True when a food is allowed by a diet pattern and a set of allergens to avoid. */
export function isAllowed(food, { diet = "Anything", avoid = [] } = {}) {
  const t = tagsFor(food);
  if (!t) return false;
  if (avoid.some((a) => t.allergens.includes(a))) return false;
  switch (diet) {
    case "Vegan": return t.vegan;
    case "Vegetarian": return t.vegetarian;
    case "Pescatarian": return t.pescatarian;
    case "Keto": return t.keto;
    case "Gluten free": return t.glutenFree;
    default: return true;
  }
}

/** Every food that passes the filters, optionally narrowed to one role. */
export function allowedFoods(filters, role = null) {
  return FOOD_LIBRARY.filter((f) => {
    if (!isAllowed(f, filters)) return false;
    if (!role) return true;
    return tagsFor(f).role === role;
  });
}

/** Foods with no entry above. Should always be empty -- the test asserts it,
 * so adding a food to the library without tagging it fails loudly. */
export function untaggedFoods() {
  return FOOD_LIBRARY.filter((f) => !T[f.id]).map((f) => f.id);
}

/** Which meals a food belongs in. Macro-fitting alone will happily put eleven
 * slices of bread in a lunch and a steak in a mid-morning snack: the numbers
 * work and the plan is still unusable. Defaults come from the role, and only
 * the foods that genuinely don't travel are listed as exceptions. */
const MORNING = ["Breakfast"];
const SNACKS = ["Mid-morning snack", "Afternoon snack"];
const MAINS = ["Lunch", "Dinner"];
const ALL_SLOTS = [...MORNING, ...SNACKS, ...MAINS];

// Only exceptions are listed; anything absent is allowed everywhere.
const SLOT_RULES = {
  // Breakfast carbs are breakfast carbs.
  "oats": MORNING, "cereal-cheerios": MORNING, "granola": [...MORNING, ...SNACKS],
  "rice-white": MAINS, "rice-brown": MAINS, "pasta": MAINS, "quinoa": MAINS,
  "potato": MAINS, "sweet-potato": MAINS, "tortilla-flour": MAINS, "tortilla-corn": MAINS,
  "pita": MAINS, "hamburger-bun": MAINS,
  "bagel": MORNING, "english-muffin": MORNING,
  "rice-cake": SNACKS,
  // A snack is something you can eat without cooking it.
  "chicken-breast": MAINS, "chicken-thigh": MAINS, "rotisserie-chicken": MAINS,
  "ground-beef-90": MAINS, "ground-beef-80": MAINS, "ground-turkey": MAINS,
  "steak-sirloin": MAINS, "pork-chop": MAINS,
  "salmon": MAINS, "tuna-canned": [...MAINS, ...SNACKS], "tilapia": MAINS,
  "shrimp": MAINS, "cod": MAINS,
  "tofu-firm": [...MORNING, ...MAINS], "tempeh": MAINS, "seitan": MAINS,
  "black-beans": [...MAINS, ...SNACKS], "chickpeas": [...MAINS, ...SNACKS], "lentils": [...MAINS, ...SNACKS], "edamame": [...MAINS, ...SNACKS],
  "bacon": MORNING, "sausage-breakfast": MORNING,
  // Yogurt, cottage cheese and a shake are breakfasts and snacks. Left
  // unrestricted the generator will happily make two tubs of flavoured
  // yogurt someone's dinner protein -- which hits no target well and is
  // not a dinner.
  "greek-yogurt": [...MORNING, ...SNACKS], "yogurt-flavoured": [...MORNING, ...SNACKS],
  "cottage-cheese": [...MORNING, ...SNACKS],
  "protein-powder": [...MORNING, ...SNACKS], "pea-protein": [...MORNING, ...SNACKS],
  "protein-bar": SNACKS,
  // Deli meat is a sandwich filling, not what goes on a dinner plate.
  "turkey-deli": [...MORNING, ...SNACKS, "Lunch"],
  "ham-deli": [...MORNING, ...SNACKS, "Lunch"],
  "roast-beef-deli": [...MORNING, ...SNACKS, "Lunch"],
  "egg-whole": [...MORNING, ...MAINS], "egg-white": [...MORNING, ...MAINS],
  // Cooked vegetables don't belong in a mid-morning snack.
  "broccoli": MAINS, "green-beans": MAINS, "asparagus": MAINS, "corn": MAINS,
  "onion": MAINS, "spinach": [...MORNING, ...MAINS],
  "olive-oil": MAINS, "butter": [...MORNING, ...MAINS],
};

export function slotsFor(food) {
  return SLOT_RULES[food.id] || ALL_SLOTS;
}

/** Foods allowed by the filters that also suit a given meal. Falls back to
 * ignoring the slot when nothing fits, because a plan with an empty breakfast
 * is worse than one with an odd breakfast. */
export function allowedForSlot(filters, role, slot) {
  const pool = allowedFoods(filters, role);
  const fits = pool.filter((f) => slotsFor(f).includes(slot));
  return fits.length ? fits : pool;
}
