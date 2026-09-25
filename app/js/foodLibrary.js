// A bundled catalogue of ordinary grocery-store food, with the serving sizes
// people actually use: a slice of bread, a slice of cheese, a tablespoon of
// peanut butter. Offline, so it works in a kitchen with bad signal and needs
// no barcode.
//
// Macros are per 100g and the app scales them to whichever unit is picked, so
// there is one set of numbers per food rather than one per serving size -- far
// harder to get quietly inconsistent.
//
// Values are representative of a typical supermarket version, drawn from
// standard composition data. A specific brand will differ, sometimes a lot
// (bread and deli meat especially). Scanning the barcode beats this when the
// packet is to hand; this is for when it isn't.

export const FOOD_CATEGORIES = [
  "Meat & fish",
  "Eggs & dairy",
  "Bread & grains",
  "Fruit",
  "Vegetables",
  "Nuts & fats",
  "Snacks & sweets",
  "Drinks",
  "Sauces & condiments",
];

/** units is [[label, grams], ...] -- the first is the default, and should be
 * the one someone would say out loud ("two slices", not "56 grams"). */
const F = (id, name, category, units, calories, protein, carbs, fat, aliases = "") =>
  ({ id, name, category, units, per100g: { calories, protein, carbs, fat }, aliases });

export const FOOD_LIBRARY = [
  // ---------------- Meat & fish ----------------
  F("turkey-deli", "Turkey breast, deli sliced", "Meat & fish", [["slice", 28], ["oz", 28], ["g", 1]], 104, 17, 3, 2, "lunch meat cold cuts"),
  F("ham-deli", "Ham, deli sliced", "Meat & fish", [["slice", 28], ["oz", 28], ["g", 1]], 120, 17, 2, 5, "lunch meat cold cuts"),
  F("roast-beef-deli", "Roast beef, deli sliced", "Meat & fish", [["slice", 28], ["oz", 28], ["g", 1]], 125, 22, 1, 4, "lunch meat cold cuts"),
  F("chicken-breast", "Chicken breast, cooked", "Meat & fish", [["oz", 28], ["breast", 170], ["g", 1]], 165, 31, 0, 3.6, ""),
  F("chicken-thigh", "Chicken thigh, cooked, skinless", "Meat & fish", [["thigh", 90], ["oz", 28], ["g", 1]], 179, 24, 0, 8.2, ""),
  F("rotisserie-chicken", "Rotisserie chicken, meat only", "Meat & fish", [["oz", 28], ["cup", 140], ["g", 1]], 190, 27, 0, 9, ""),
  F("ground-beef-90", "Ground beef, 90% lean, cooked", "Meat & fish", [["oz", 28], ["patty", 113], ["g", 1]], 217, 26, 0, 12, "mince hamburger"),
  F("ground-beef-80", "Ground beef, 80% lean, cooked", "Meat & fish", [["oz", 28], ["patty", 113], ["g", 1]], 272, 24, 0, 19, "mince hamburger"),
  F("ground-turkey", "Ground turkey, 93% lean, cooked", "Meat & fish", [["oz", 28], ["g", 1]], 203, 27, 0, 10, "mince"),
  F("steak-sirloin", "Sirloin steak, cooked", "Meat & fish", [["oz", 28], ["g", 1]], 212, 30, 0, 10, ""),
  F("pork-chop", "Pork chop, cooked", "Meat & fish", [["chop", 120], ["oz", 28], ["g", 1]], 231, 27, 0, 13, ""),
  F("bacon", "Bacon, cooked", "Meat & fish", [["slice", 8], ["g", 1]], 541, 37, 1.4, 42, ""),
  F("sausage-breakfast", "Breakfast sausage link, cooked", "Meat & fish", [["link", 25], ["g", 1]], 325, 19, 1, 27, ""),
  F("salmon", "Salmon, cooked", "Meat & fish", [["oz", 28], ["fillet", 150], ["g", 1]], 208, 22, 0, 13, ""),
  F("tuna-canned", "Tuna, canned in water, drained", "Meat & fish", [["can", 142], ["oz", 28], ["g", 1]], 116, 26, 0, 1, ""),
  F("tilapia", "Tilapia, cooked", "Meat & fish", [["fillet", 115], ["oz", 28], ["g", 1]], 129, 26, 0, 2.7, ""),
  F("shrimp", "Shrimp, cooked", "Meat & fish", [["oz", 28], ["piece", 12], ["g", 1]], 99, 24, 0.2, 0.3, "prawns"),
  F("cod", "Cod, cooked", "Meat & fish", [["fillet", 150], ["oz", 28], ["g", 1]], 105, 23, 0, 0.9, ""),

  // ---------------- Eggs & dairy ----------------
  F("egg-whole", "Egg, large, whole", "Eggs & dairy", [["egg", 50], ["g", 1]], 143, 13, 0.7, 9.5, ""),
  F("egg-white", "Egg white", "Eggs & dairy", [["white", 33], ["cup", 243], ["g", 1]], 52, 11, 0.7, 0.2, ""),
  F("cheese-american", "American cheese, sliced", "Eggs & dairy", [["slice", 21], ["g", 1]], 371, 18, 9, 30, "processed singles"),
  F("cheese-cheddar", "Cheddar cheese", "Eggs & dairy", [["slice", 28], ["oz", 28], ["cup shredded", 113], ["g", 1]], 403, 25, 1.3, 33, ""),
  F("cheese-swiss", "Swiss cheese, sliced", "Eggs & dairy", [["slice", 28], ["g", 1]], 380, 27, 5, 28, ""),
  F("cheese-provolone", "Provolone cheese, sliced", "Eggs & dairy", [["slice", 28], ["g", 1]], 351, 26, 2, 27, ""),
  F("cheese-mozzarella", "Mozzarella, part skim", "Eggs & dairy", [["oz", 28], ["cup shredded", 113], ["g", 1]], 254, 24, 3, 16, ""),
  F("cheese-feta", "Feta cheese", "Eggs & dairy", [["oz", 28], ["cup crumbled", 150], ["g", 1]], 264, 14, 4, 21, ""),
  F("cottage-cheese", "Cottage cheese, low fat", "Eggs & dairy", [["cup", 226], ["g", 1]], 81, 11, 4.3, 2.3, ""),
  F("greek-yogurt", "Greek yogurt, plain 0%", "Eggs & dairy", [["cup", 245], ["container", 170], ["g", 1]], 59, 10, 3.6, 0.4, ""),
  F("yogurt-flavoured", "Yogurt, flavoured, low fat", "Eggs & dairy", [["container", 170], ["cup", 245], ["g", 1]], 95, 4, 15, 1.5, ""),
  F("milk-whole", "Milk, whole", "Eggs & dairy", [["cup", 244], ["g", 1]], 61, 3.2, 4.8, 3.3, ""),
  F("milk-skim", "Milk, skim", "Eggs & dairy", [["cup", 244], ["g", 1]], 34, 3.4, 5, 0.1, "nonfat"),
  F("almond-milk", "Almond milk, unsweetened", "Eggs & dairy", [["cup", 240], ["g", 1]], 15, 0.6, 0.6, 1.2, ""),
  F("butter", "Butter", "Eggs & dairy", [["tbsp", 14], ["tsp", 5], ["g", 1]], 717, 0.9, 0.1, 81, ""),
  F("cream-cheese", "Cream cheese", "Eggs & dairy", [["tbsp", 15], ["oz", 28], ["g", 1]], 350, 6, 5.5, 34, ""),

  // ---------------- Bread & grains ----------------
  F("bread-white", "White bread", "Bread & grains", [["slice", 28], ["g", 1]], 266, 9, 49, 3.3, "wonder sandwich loaf"),
  F("bread-wheat", "Wheat bread", "Bread & grains", [["slice", 28], ["g", 1]], 252, 12, 43, 3.5, "brown"),
  F("bread-whole-wheat", "100% whole wheat bread", "Bread & grains", [["slice", 32], ["g", 1]], 247, 13, 41, 3.4, "wholegrain wholemeal"),
  F("bread-sourdough", "Sourdough bread", "Bread & grains", [["slice", 36], ["g", 1]], 289, 12, 56, 1.8, ""),
  F("bread-rye", "Rye bread", "Bread & grains", [["slice", 32], ["g", 1]], 259, 9, 48, 3.3, ""),
  F("bagel", "Bagel, plain", "Bread & grains", [["bagel", 98], ["half", 49], ["g", 1]], 250, 10, 49, 1.5, ""),
  F("english-muffin", "English muffin", "Bread & grains", [["muffin", 57], ["g", 1]], 235, 8, 46, 1.8, ""),
  F("tortilla-flour", "Flour tortilla, 8 inch", "Bread & grains", [["tortilla", 45], ["g", 1]], 310, 8, 51, 8, "wrap"),
  F("tortilla-corn", "Corn tortilla, 6 inch", "Bread & grains", [["tortilla", 26], ["g", 1]], 218, 6, 45, 2.9, ""),
  F("pita", "Pita bread, white", "Bread & grains", [["pita", 60], ["g", 1]], 275, 9, 56, 1.2, ""),
  F("hamburger-bun", "Hamburger bun", "Bread & grains", [["bun", 52], ["g", 1]], 279, 9, 50, 4, ""),
  F("rice-white", "White rice, cooked", "Bread & grains", [["cup", 158], ["g", 1]], 130, 2.7, 28, 0.3, "jasmine basmati"),
  F("rice-brown", "Brown rice, cooked", "Bread & grains", [["cup", 195], ["g", 1]], 123, 2.7, 26, 1, ""),
  F("pasta", "Pasta, cooked", "Bread & grains", [["cup", 140], ["g", 1]], 158, 6, 31, 0.9, "spaghetti penne noodles"),
  F("oats", "Oats, dry rolled", "Bread & grains", [["cup", 81], ["half cup", 40], ["g", 1]], 379, 13, 68, 6.5, "oatmeal porridge"),
  F("quinoa", "Quinoa, cooked", "Bread & grains", [["cup", 185], ["g", 1]], 120, 4.4, 21, 1.9, ""),
  F("cereal-cheerios", "Toasted oat cereal", "Bread & grains", [["cup", 28], ["g", 1]], 379, 12, 73, 7, "cheerios"),
  F("granola", "Granola", "Bread & grains", [["cup", 112], ["quarter cup", 28], ["g", 1]], 471, 10, 64, 20, ""),
  F("potato", "Potato, baked with skin", "Bread & grains", [["medium", 173], ["g", 1]], 93, 2.5, 21, 0.1, ""),
  F("sweet-potato", "Sweet potato, baked", "Bread & grains", [["medium", 150], ["cup", 200], ["g", 1]], 90, 2, 21, 0.1, "yam"),

  // ---------------- Fruit ----------------
  F("apple", "Apple", "Fruit", [["medium", 182], ["g", 1]], 52, 0.3, 14, 0.2, ""),
  F("banana", "Banana", "Fruit", [["medium", 118], ["g", 1]], 89, 1.1, 23, 0.3, ""),
  F("orange", "Orange", "Fruit", [["medium", 131], ["g", 1]], 47, 0.9, 12, 0.1, ""),
  F("strawberries", "Strawberries", "Fruit", [["cup", 152], ["g", 1]], 32, 0.7, 7.7, 0.3, "berries"),
  F("blueberries", "Blueberries", "Fruit", [["cup", 148], ["g", 1]], 57, 0.7, 14, 0.3, "berries"),
  F("grapes", "Grapes", "Fruit", [["cup", 151], ["g", 1]], 69, 0.7, 18, 0.2, ""),
  F("pineapple", "Pineapple", "Fruit", [["cup", 165], ["g", 1]], 50, 0.5, 13, 0.1, ""),
  F("watermelon", "Watermelon", "Fruit", [["cup", 152], ["g", 1]], 30, 0.6, 7.6, 0.2, ""),
  F("avocado", "Avocado", "Fruit", [["half", 100], ["whole", 200], ["g", 1]], 160, 2, 8.5, 15, ""),
  F("mango", "Mango", "Fruit", [["cup", 165], ["g", 1]], 60, 0.8, 15, 0.4, ""),

  // ---------------- Vegetables ----------------
  F("broccoli", "Broccoli, cooked", "Vegetables", [["cup", 156], ["g", 1]], 35, 2.4, 7.2, 0.4, ""),
  F("spinach", "Spinach, raw", "Vegetables", [["cup", 30], ["g", 1]], 23, 2.9, 3.6, 0.4, ""),
  F("lettuce", "Lettuce, romaine", "Vegetables", [["cup", 47], ["leaf", 10], ["g", 1]], 17, 1.2, 3.3, 0.3, "salad"),
  F("tomato", "Tomato", "Vegetables", [["medium", 123], ["slice", 20], ["g", 1]], 18, 0.9, 3.9, 0.2, ""),
  F("cucumber", "Cucumber", "Vegetables", [["cup sliced", 119], ["g", 1]], 15, 0.7, 3.6, 0.1, ""),
  F("carrots", "Carrots, raw", "Vegetables", [["cup", 128], ["medium", 61], ["g", 1]], 41, 0.9, 10, 0.2, ""),
  F("bell-pepper", "Bell pepper", "Vegetables", [["medium", 119], ["cup", 149], ["g", 1]], 31, 1, 6, 0.3, "capsicum"),
  F("onion", "Onion", "Vegetables", [["medium", 110], ["slice", 14], ["g", 1]], 40, 1.1, 9.3, 0.1, ""),
  F("green-beans", "Green beans, cooked", "Vegetables", [["cup", 125], ["g", 1]], 35, 1.9, 8, 0.3, ""),
  F("asparagus", "Asparagus, cooked", "Vegetables", [["cup", 180], ["spear", 20], ["g", 1]], 22, 2.4, 4.1, 0.2, ""),
  F("corn", "Corn, cooked", "Vegetables", [["cup", 164], ["ear", 90], ["g", 1]], 96, 3.4, 21, 1.5, ""),
  F("black-beans", "Black beans, cooked", "Vegetables", [["cup", 172], ["g", 1]], 132, 8.9, 24, 0.5, "legumes"),
  F("chickpeas", "Chickpeas, cooked", "Vegetables", [["cup", 164], ["g", 1]], 164, 8.9, 27, 2.6, "garbanzo hummus beans"),

  // ---------------- Nuts & fats ----------------
  F("peanut-butter", "Peanut butter", "Nuts & fats", [["tbsp", 16], ["g", 1]], 588, 25, 20, 50, ""),
  F("almond-butter", "Almond butter", "Nuts & fats", [["tbsp", 16], ["g", 1]], 614, 21, 19, 56, ""),
  F("almonds", "Almonds", "Nuts & fats", [["oz", 28], ["quarter cup", 35], ["g", 1]], 579, 21, 22, 50, "nuts"),
  F("walnuts", "Walnuts", "Nuts & fats", [["oz", 28], ["g", 1]], 654, 15, 14, 65, "nuts"),
  F("cashews", "Cashews", "Nuts & fats", [["oz", 28], ["g", 1]], 553, 18, 30, 44, "nuts"),
  F("olive-oil", "Olive oil", "Nuts & fats", [["tbsp", 14], ["tsp", 5], ["g", 1]], 884, 0, 0, 100, ""),
  F("chia", "Chia seeds", "Nuts & fats", [["tbsp", 12], ["g", 1]], 486, 17, 42, 31, ""),

  // ---------------- Snacks & sweets ----------------
  F("protein-bar", "Protein bar", "Snacks & sweets", [["bar", 60], ["g", 1]], 350, 33, 38, 10, ""),
  F("protein-powder", "Whey protein powder", "Snacks & sweets", [["scoop", 30], ["g", 1]], 400, 80, 7, 5, "shake"),
  F("chips-potato", "Potato chips", "Snacks & sweets", [["oz", 28], ["small bag", 43], ["g", 1]], 536, 7, 53, 34, "crisps"),
  F("tortilla-chips", "Tortilla chips", "Snacks & sweets", [["oz", 28], ["g", 1]], 489, 7, 65, 23, ""),
  F("popcorn", "Popcorn, air popped", "Snacks & sweets", [["cup", 8], ["g", 1]], 387, 13, 78, 4.5, ""),
  F("chocolate-milk-bar", "Milk chocolate", "Snacks & sweets", [["oz", 28], ["bar", 43], ["g", 1]], 535, 7.6, 59, 30, "candy"),
  F("ice-cream", "Ice cream, vanilla", "Snacks & sweets", [["half cup", 66], ["cup", 132], ["g", 1]], 207, 3.5, 24, 11, ""),
  F("cookie", "Chocolate chip cookie", "Snacks & sweets", [["cookie", 16], ["g", 1]], 488, 5.7, 65, 24, "biscuit"),
  F("rice-cake", "Rice cake", "Snacks & sweets", [["cake", 9], ["g", 1]], 387, 8, 82, 2.8, ""),

  // ---------------- Drinks ----------------
  F("coffee-black", "Coffee, black", "Drinks", [["cup", 240], ["g", 1]], 1, 0.1, 0, 0, ""),
  F("orange-juice", "Orange juice", "Drinks", [["cup", 248], ["g", 1]], 45, 0.7, 10, 0.2, ""),
  F("soda", "Soda, regular", "Drinks", [["can", 355], ["bottle", 500], ["g", 1]], 41, 0, 11, 0, "coke pepsi pop"),
  F("soda-diet", "Diet soda", "Drinks", [["can", 355], ["g", 1]], 0, 0, 0, 0, "zero"),
  F("beer", "Beer, regular", "Drinks", [["bottle", 355], ["g", 1]], 43, 0.5, 3.6, 0, "alcohol"),
  F("wine-red", "Red wine", "Drinks", [["glass", 147], ["g", 1]], 85, 0.1, 2.6, 0, "alcohol"),
  F("sports-drink", "Sports drink", "Drinks", [["bottle", 591], ["cup", 240], ["g", 1]], 25, 0, 6, 0, "gatorade"),

  // ---------------- Sauces & condiments ----------------
  F("mayo", "Mayonnaise", "Sauces & condiments", [["tbsp", 14], ["g", 1]], 680, 1, 0.6, 75, ""),
  F("mayo-light", "Mayonnaise, light", "Sauces & condiments", [["tbsp", 15], ["g", 1]], 238, 0.4, 4, 24, ""),
  F("mustard", "Mustard", "Sauces & condiments", [["tbsp", 15], ["tsp", 5], ["g", 1]], 66, 4, 6, 3.3, ""),
  F("ketchup", "Ketchup", "Sauces & condiments", [["tbsp", 17], ["g", 1]], 101, 1.2, 26, 0.1, ""),
  F("ranch", "Ranch dressing", "Sauces & condiments", [["tbsp", 15], ["g", 1]], 430, 1, 6, 45, ""),
  F("hot-sauce", "Hot sauce", "Sauces & condiments", [["tsp", 5], ["tbsp", 15], ["g", 1]], 11, 0.5, 1.8, 0.4, ""),
  F("salsa", "Salsa", "Sauces & condiments", [["tbsp", 16], ["quarter cup", 60], ["g", 1]], 36, 1.5, 7, 0.2, ""),
  F("honey", "Honey", "Sauces & condiments", [["tbsp", 21], ["tsp", 7], ["g", 1]], 304, 0.3, 82, 0, ""),
  F("maple-syrup", "Maple syrup", "Sauces & condiments", [["tbsp", 20], ["g", 1]], 260, 0, 67, 0.1, ""),
  F("soy-sauce", "Soy sauce", "Sauces & condiments", [["tbsp", 16], ["tsp", 5], ["g", 1]], 53, 8, 4.9, 0.1, "tamari"),
];

/** Macros for a given quantity of a unit, rounded the way a diary shows them. */
export function macrosFor(food, unitLabel, qty) {
  const unit = food.units.find((u) => u[0] === unitLabel) || food.units[0];
  const grams = unit[1] * (Number(qty) || 0);
  const k = grams / 100;
  return {
    grams: Math.round(grams),
    calories: Math.round(food.per100g.calories * k),
    protein: Math.round(food.per100g.protein * k * 10) / 10,
    carbs: Math.round(food.per100g.carbs * k * 10) / 10,
    fat: Math.round(food.per100g.fat * k * 10) / 10,
  };
}

/** Free-text search over name, category and the alias list, plus an optional
 * category filter. Matching every word rather than the whole string lets
 * "wheat bread" and "bread wheat" both find the same thing. */
export function searchFoods(query, category = "All") {
  const words = (query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return FOOD_LIBRARY.filter((f) => {
    if (category !== "All" && f.category !== category) return false;
    if (!words.length) return true;
    const hay = `${f.name} ${f.category} ${f.aliases}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
