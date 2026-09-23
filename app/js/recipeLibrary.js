// A bundled recipe catalogue, filterable by the way people actually describe
// how they eat. Everything here is offline -- no API, no key, no rate limit --
// so it works in a basement gym with one bar of signal.
//
// Macros are per serving and are good-faith estimates from standard portion
// sizes, not laboratory values; they are close enough to build a day around
// and are meant to be adjusted once someone weighs their own portions.
//
// tags drive the filter chips. A recipe can carry several -- most high-protein
// meals are also gluten free, and saying so is what makes the filter useful.

export const DIET_TAGS = [
  "High protein",
  "Low carb",
  "Balanced",
  "Keto",
  "Pescatarian",
  "Gluten free",
  "Vegetarian",
  "Vegan",
];

export const MEAL_SLOTS = ["Breakfast", "Lunch", "Dinner", "Snacks"];

/** { id, name, slot, tags[], minutes, servings, calories, protein, carbs, fat,
 *    ingredients[], steps[], tip? } -- macros are per serving. */
export const RECIPE_LIBRARY = [
  // ---------------- Breakfast ----------------
  {
    id: "r-eggwhite-oats", name: "Egg White Oats", slot: "Breakfast",
    tags: ["High protein", "Balanced", "Gluten free", "Vegetarian"],
    minutes: 10, servings: 1, calories: 415, protein: 33, carbs: 56, fat: 6,
    ingredients: ["80g rolled oats (certified GF if needed)", "200ml water or skim milk", "180ml liquid egg whites", "1 tsp cinnamon", "100g berries", "Pinch of salt"],
    steps: [
      "Simmer the oats in the water with the salt until most of the liquid is gone, about 4 minutes.",
      "Take the pan off the heat for 30 seconds so it stops bubbling, then pour in the egg whites while whisking hard and constantly.",
      "Return to low heat and keep whisking for 2 minutes until it goes thick and glossy. Stop the moment it looks creamy.",
      "Fold in the cinnamon, top with berries.",
    ],
    tip: "Whisking off the heat first is the whole trick — dump the whites into a boiling pan and you get scrambled eggs in porridge.",
  },
  {
    id: "r-cottage-bowl", name: "Cottage Cheese Breakfast Bowl", slot: "Breakfast",
    tags: ["High protein", "Low carb", "Gluten free", "Vegetarian"],
    minutes: 5, servings: 1, calories: 330, protein: 34, carbs: 18, fat: 13,
    ingredients: ["250g low-fat cottage cheese", "100g pineapple or berries", "20g walnuts, chopped", "1 tsp honey (optional)"],
    steps: ["Spoon the cottage cheese into a bowl.", "Top with the fruit and walnuts.", "Drizzle with honey if you want it."],
    tip: "Five minutes and 34g of protein with no cooking — this is the one for mornings you're already late.",
  },
  {
    id: "r-shakshuka", name: "Shakshuka", slot: "Breakfast",
    tags: ["Low carb", "Balanced", "Gluten free", "Vegetarian"],
    minutes: 25, servings: 2, calories: 310, protein: 19, carbs: 16, fat: 19,
    ingredients: ["1 tbsp olive oil", "1 onion, diced", "1 red pepper, diced", "2 cloves garlic", "400g tin chopped tomatoes", "1 tsp smoked paprika", "1 tsp cumin", "4 eggs", "Salt and pepper"],
    steps: [
      "Soften the onion and pepper in the oil over medium heat, 6-8 minutes.",
      "Add the garlic and spices, stir for a minute until they smell toasted.",
      "Pour in the tomatoes, season, and simmer 10 minutes until thickened.",
      "Make four wells, crack an egg into each, cover and cook 5-7 minutes until the whites set.",
    ],
  },
  {
    id: "r-protein-pancakes", name: "Banana Protein Pancakes", slot: "Breakfast",
    tags: ["High protein", "Balanced", "Gluten free", "Vegetarian"],
    minutes: 15, servings: 1, calories: 430, protein: 38, carbs: 48, fat: 9,
    ingredients: ["1 ripe banana", "2 eggs", "30g vanilla whey protein", "30g oat flour (GF oats blended)", "1/2 tsp baking powder", "Spray oil"],
    steps: [
      "Blend everything until smooth and let it sit 2 minutes so the oat flour hydrates.",
      "Cook in a non-stick pan over medium-low heat, 2 minutes a side.",
      "Keep the heat lower than you think — protein batter burns before it sets.",
    ],
  },
  {
    id: "r-tofu-scramble", name: "Turmeric Tofu Scramble", slot: "Breakfast",
    tags: ["High protein", "Low carb", "Gluten free", "Vegetarian", "Vegan"],
    minutes: 15, servings: 1, calories: 295, protein: 26, carbs: 12, fat: 17,
    ingredients: ["200g firm tofu, pressed", "1 tsp turmeric", "1/2 tsp garlic powder", "2 tbsp nutritional yeast", "Handful spinach", "1 tsp olive oil", "Black salt (kala namak) if you have it"],
    steps: [
      "Crumble the tofu with your hands into rough, egg-sized curds — don't mash it.",
      "Fry in the oil over medium-high for 5 minutes without stirring much, so it browns.",
      "Add the turmeric, garlic powder and nutritional yeast, toss for 2 minutes.",
      "Stir the spinach through until it wilts. Season, and add black salt for an eggy flavour.",
    ],
    tip: "Press the tofu properly (20 min under something heavy) or it steams instead of browning.",
  },
  {
    id: "r-greek-parfait", name: "Greek Yogurt Parfait", slot: "Breakfast",
    tags: ["High protein", "Balanced", "Gluten free", "Vegetarian"],
    minutes: 5, servings: 1, calories: 370, protein: 31, carbs: 40, fat: 9,
    ingredients: ["250g 0% Greek yogurt", "30g granola (GF if needed)", "120g mixed berries", "1 tbsp chia seeds"],
    steps: ["Layer the yogurt, berries and granola in a glass or jar.", "Top with chia seeds.", "Make it the night before and it's ready when you are."],
  },

  // ---------------- Lunch ----------------
  {
    id: "r-chicken-rice-bowl", name: "Chicken and Rice Power Bowl", slot: "Lunch",
    tags: ["High protein", "Balanced", "Gluten free"],
    minutes: 25, servings: 2, calories: 520, protein: 46, carbs: 58, fat: 11,
    ingredients: ["300g chicken breast", "150g jasmine rice (dry)", "1 head broccoli", "1 tbsp olive oil", "1 tsp paprika", "1 tsp garlic powder", "Juice of 1 lemon", "Salt and pepper"],
    steps: [
      "Cook the rice.",
      "Season the chicken with the paprika, garlic powder, salt and pepper. Sear 5-6 minutes a side until 74C / 165F inside.",
      "Steam or roast the broccoli.",
      "Rest the chicken 5 minutes before slicing, then build the bowls and finish with lemon.",
    ],
    tip: "The five-minute rest is not optional — slice it straight off the heat and the juice ends up on the board instead of in the meat.",
  },
  {
    id: "r-tuna-white-bean", name: "Tuna and White Bean Salad", slot: "Lunch",
    tags: ["High protein", "Balanced", "Pescatarian", "Gluten free"],
    minutes: 10, servings: 1, calories: 430, protein: 40, carbs: 36, fat: 13,
    ingredients: ["1 tin tuna in water, drained", "200g tinned cannellini beans, rinsed", "1/2 red onion, thinly sliced", "Handful parsley", "1 tbsp olive oil", "Juice of 1/2 lemon", "Salt and pepper"],
    steps: ["Flake the tuna into a bowl with the beans.", "Add the onion and parsley.", "Dress with oil and lemon, season and toss."],
    tip: "Soak the sliced onion in cold water for 5 minutes to take the harsh edge off it.",
  },
  {
    id: "r-turkey-lettuce-wraps", name: "Turkey Lettuce Wraps", slot: "Lunch",
    tags: ["High protein", "Low carb", "Keto", "Gluten free"],
    minutes: 20, servings: 2, calories: 340, protein: 38, carbs: 11, fat: 16,
    ingredients: ["450g lean ground turkey", "1 tbsp sesame oil", "2 cloves garlic, minced", "1 tbsp fresh ginger, grated", "2 tbsp tamari (GF soy sauce)", "1 head butter or iceberg lettuce", "2 spring onions", "1 tbsp rice vinegar"],
    steps: [
      "Brown the turkey in the sesame oil over high heat, breaking it up, 6-8 minutes.",
      "Add the garlic and ginger, cook 1 minute.",
      "Stir in the tamari and vinegar, cook until the pan is nearly dry.",
      "Spoon into lettuce cups, top with spring onion.",
    ],
  },
  {
    id: "r-salmon-quinoa", name: "Salmon and Quinoa Salad", slot: "Lunch",
    tags: ["High protein", "Balanced", "Pescatarian", "Gluten free"],
    minutes: 25, servings: 2, calories: 540, protein: 40, carbs: 40, fat: 23,
    ingredients: ["2 salmon fillets (about 150g each)", "150g quinoa (dry)", "1 cucumber, diced", "200g cherry tomatoes, halved", "50g feta", "2 tbsp olive oil", "Juice of 1 lemon", "Fresh dill"],
    steps: [
      "Rinse and cook the quinoa, then spread it out to cool.",
      "Season the salmon and roast at 200C / 400F for 12-14 minutes.",
      "Toss the quinoa with the cucumber, tomatoes, oil and lemon.",
      "Flake the salmon on top, crumble over the feta and finish with dill.",
    ],
  },
  {
    id: "r-chickpea-bowl", name: "Roasted Chickpea Bowl", slot: "Lunch",
    tags: ["Balanced", "Gluten free", "Vegetarian", "Vegan"],
    minutes: 35, servings: 2, calories: 470, protein: 19, carbs: 62, fat: 17,
    ingredients: ["2 tins chickpeas, drained and dried", "1 tbsp olive oil", "1 tsp cumin", "1 tsp smoked paprika", "150g brown rice (dry)", "2 handfuls spinach", "3 tbsp tahini", "Juice of 1 lemon", "Water to thin"],
    steps: [
      "Dry the chickpeas thoroughly, toss with oil and spices, roast at 220C / 425F for 25 minutes.",
      "Cook the rice.",
      "Whisk the tahini with the lemon and enough water to make it pourable.",
      "Build: rice, spinach, chickpeas, then the sauce.",
    ],
    tip: "Wet chickpeas steam and go soft. Pat them properly dry and they come out crisp.",
  },
  {
    id: "r-shrimp-zoodles", name: "Garlic Shrimp Zoodles", slot: "Lunch",
    tags: ["High protein", "Low carb", "Keto", "Pescatarian", "Gluten free"],
    minutes: 15, servings: 2, calories: 290, protein: 32, carbs: 10, fat: 14,
    ingredients: ["400g raw shrimp, peeled", "3 courgettes, spiralized", "3 cloves garlic", "2 tbsp olive oil", "Chilli flakes", "Juice of 1 lemon", "Parsley"],
    steps: [
      "Sear the shrimp in half the oil over high heat, 90 seconds a side, then take them out.",
      "Add the rest of the oil, the garlic and chilli, 30 seconds.",
      "Toss the courgette in for no more than 2 minutes — any longer and it turns to water.",
      "Return the shrimp, finish with lemon and parsley.",
    ],
  },

  // ---------------- Dinner ----------------
  {
    id: "r-steak-sweetpotato", name: "Steak and Sweet Potato", slot: "Dinner",
    tags: ["High protein", "Balanced", "Gluten free"],
    minutes: 40, servings: 2, calories: 560, protein: 45, carbs: 45, fat: 22,
    ingredients: ["2 sirloin steaks (about 200g each)", "2 large sweet potatoes", "200g green beans", "1 tbsp olive oil", "2 cloves garlic", "Rosemary", "Salt and pepper"],
    steps: [
      "Cube the sweet potato, toss in oil, roast at 220C / 425F for 30 minutes.",
      "Take the steaks out of the fridge 30 minutes before cooking and salt them well.",
      "Sear in a screaming-hot pan, 3-4 minutes a side for medium-rare, basting with garlic and rosemary.",
      "Rest 5-10 minutes. Steam the beans while it rests.",
    ],
    tip: "A cold steak in a hot pan cooks grey on the outside before the middle is done. Room temperature first.",
  },
  {
    id: "r-cod-tray", name: "One-Tray Cod and Vegetables", slot: "Dinner",
    tags: ["High protein", "Low carb", "Pescatarian", "Gluten free"],
    minutes: 30, servings: 2, calories: 380, protein: 42, carbs: 22, fat: 14,
    ingredients: ["2 cod loins (about 180g each)", "1 courgette", "1 red pepper", "200g cherry tomatoes", "2 tbsp olive oil", "1 lemon", "Oregano", "Salt and pepper"],
    steps: [
      "Chop the vegetables, toss with half the oil, roast at 200C / 400F for 15 minutes.",
      "Push them aside, lay the cod in the middle, brush with the rest of the oil, season, top with lemon slices.",
      "Roast another 12-14 minutes until the fish flakes.",
    ],
    tip: "Giving the vegetables a 15-minute head start is what stops the fish overcooking while they catch up.",
  },
  {
    id: "r-keto-chicken-thighs", name: "Creamy Garlic Chicken Thighs", slot: "Dinner",
    tags: ["High protein", "Low carb", "Keto", "Gluten free"],
    minutes: 35, servings: 2, calories: 610, protein: 44, carbs: 7, fat: 45,
    ingredients: ["4 bone-in chicken thighs, skin on", "150ml double cream", "4 cloves garlic", "100g spinach", "30g parmesan", "1 tbsp butter", "Salt and pepper"],
    steps: [
      "Salt the skin and lay the thighs skin-down in a cold, dry pan. Bring it up to medium and render 10-12 minutes until the skin is deep gold.",
      "Flip, cook 8 more minutes, take them out.",
      "Pour off most of the fat, add the butter and garlic, then the cream and parmesan.",
      "Wilt the spinach in, return the thighs, simmer 3 minutes.",
    ],
    tip: "Starting skin-down in a cold pan is how restaurants get crisp skin — it renders the fat instead of scorching it.",
  },
  {
    id: "r-turkey-chilli", name: "Turkey Chilli", slot: "Dinner",
    tags: ["High protein", "Balanced", "Gluten free"],
    minutes: 45, servings: 4, calories: 400, protein: 38, carbs: 36, fat: 12,
    ingredients: ["700g lean ground turkey", "1 onion", "1 red pepper", "2 tins kidney beans", "400g tin chopped tomatoes", "2 tbsp tomato paste", "2 tbsp chilli powder", "1 tbsp cumin", "1 tbsp olive oil", "Salt"],
    steps: [
      "Brown the turkey hard in the oil, then set it aside.",
      "Soften the onion and pepper, add the tomato paste and spices and cook them out for 2 minutes.",
      "Return the turkey, add the tomatoes and beans, simmer 25 minutes.",
    ],
    tip: "Makes four portions and reheats better than it cooks — this is the Sunday batch that saves three weeknights.",
  },
  {
    id: "r-lentil-curry", name: "Red Lentil Curry", slot: "Dinner",
    tags: ["Balanced", "Gluten free", "Vegetarian", "Vegan"],
    minutes: 35, servings: 4, calories: 390, protein: 18, carbs: 55, fat: 11,
    ingredients: ["300g red lentils, rinsed", "400ml tin coconut milk", "400g tin chopped tomatoes", "1 onion", "3 cloves garlic", "1 tbsp fresh ginger", "2 tbsp curry powder", "1 tsp turmeric", "600ml vegetable stock", "Spinach to finish"],
    steps: [
      "Soften the onion, then add the garlic, ginger and spices for a minute.",
      "Add the lentils, tomatoes, coconut milk and stock.",
      "Simmer 20-25 minutes, stirring now and then, until the lentils collapse.",
      "Stir spinach through at the end.",
    ],
  },
  {
    id: "r-tofu-stirfry", name: "Crispy Tofu Stir-Fry", slot: "Dinner",
    tags: ["High protein", "Balanced", "Gluten free", "Vegetarian", "Vegan"],
    minutes: 30, servings: 2, calories: 450, protein: 28, carbs: 45, fat: 19,
    ingredients: ["400g extra-firm tofu, pressed and cubed", "2 tbsp cornstarch", "2 tbsp sesame oil", "1 head broccoli", "1 red pepper", "3 tbsp tamari", "1 tbsp maple syrup", "1 tbsp rice vinegar", "2 cloves garlic", "150g rice (dry)"],
    steps: [
      "Toss the tofu cubes in cornstarch until evenly dusted.",
      "Fry in the oil over medium-high, leaving each side alone for 2-3 minutes so it crusts. Set aside.",
      "Stir-fry the vegetables 4 minutes, add the garlic.",
      "Whisk the tamari, maple and vinegar, pour in, return the tofu, toss for 1 minute.",
    ],
    tip: "The cornstarch coat is what makes tofu crisp instead of rubbery. Don't skip it, and don't stir it constantly.",
  },
  {
    id: "r-beef-stirfry", name: "Beef and Broccoli", slot: "Dinner",
    tags: ["High protein", "Low carb", "Gluten free"],
    minutes: 25, servings: 2, calories: 430, protein: 42, carbs: 18, fat: 21,
    ingredients: ["400g flank steak, sliced thin against the grain", "1 head broccoli", "3 tbsp tamari", "1 tbsp oyster sauce (GF)", "1 tbsp cornstarch", "1 tbsp sesame oil", "2 cloves garlic", "1 tbsp ginger"],
    steps: [
      "Toss the beef with the cornstarch and 1 tbsp of the tamari, leave 10 minutes.",
      "Sear it in a very hot pan in one layer, 1 minute a side, then remove.",
      "Stir-fry the broccoli with a splash of water, lid on, 3 minutes.",
      "Add garlic, ginger, the rest of the sauce and the beef, toss 1 minute.",
    ],
    tip: "Against the grain matters more than the cut — slice flank the wrong way and it's chewy however you cook it.",
  },
  {
    id: "r-salmon-asparagus", name: "Baked Salmon with Asparagus", slot: "Dinner",
    tags: ["High protein", "Low carb", "Keto", "Pescatarian", "Gluten free"],
    minutes: 25, servings: 2, calories: 460, protein: 40, carbs: 8, fat: 30,
    ingredients: ["2 salmon fillets (about 180g each)", "400g asparagus", "2 tbsp olive oil", "1 lemon", "2 cloves garlic", "Dill", "Salt and pepper"],
    steps: [
      "Heat the oven to 200C / 400F.",
      "Lay the salmon and asparagus on a tray, drizzle with oil, season, scatter the garlic.",
      "Bake 12-15 minutes — pull it while the centre is still slightly translucent.",
      "Finish with lemon and dill.",
    ],
    tip: "Salmon keeps cooking on the hot tray. Take it out looking very slightly underdone and it lands perfect.",
  },

  // ---------------- Snacks ----------------
  {
    id: "r-protein-balls", name: "No-Bake Protein Balls", slot: "Snacks",
    tags: ["High protein", "Vegetarian", "Gluten free"],
    minutes: 15, servings: 12, calories: 130, protein: 8, carbs: 12, fat: 6,
    ingredients: ["120g rolled oats (GF)", "60g vanilla or chocolate whey", "120g peanut butter", "60ml honey or maple syrup", "2 tbsp water if needed"],
    steps: [
      "Mix everything until it holds together, adding water a teaspoon at a time only if it's too dry.",
      "Roll into 12 balls.",
      "Chill 30 minutes. Keeps a week in the fridge.",
    ],
  },
  {
    id: "r-cottage-toast", name: "Cottage Cheese Toast", slot: "Snacks",
    tags: ["High protein", "Balanced", "Vegetarian"],
    minutes: 5, servings: 1, calories: 260, protein: 22, carbs: 26, fat: 7,
    ingredients: ["2 slices wholegrain bread (or GF)", "150g cottage cheese", "Everything bagel seasoning", "Sliced tomato or cucumber"],
    steps: ["Toast the bread.", "Spread the cottage cheese thick.", "Top with the vegetables and seasoning."],
  },
  {
    id: "r-edamame", name: "Chilli Lime Edamame", slot: "Snacks",
    tags: ["High protein", "Gluten free", "Vegetarian", "Vegan"],
    minutes: 8, servings: 2, calories: 160, protein: 14, carbs: 13, fat: 6,
    ingredients: ["300g frozen edamame in pods", "Juice of 1 lime", "1/2 tsp chilli flakes", "Flaky salt"],
    steps: ["Boil or steam the edamame 5 minutes.", "Drain, toss with lime, chilli and salt while still hot."],
  },
  {
    id: "r-greek-dip", name: "Greek Yogurt Ranch Dip", slot: "Snacks",
    tags: ["High protein", "Low carb", "Gluten free", "Vegetarian"],
    minutes: 5, servings: 2, calories: 110, protein: 14, carbs: 8, fat: 2,
    ingredients: ["250g 0% Greek yogurt", "1 tsp garlic powder", "1 tsp onion powder", "1 tbsp fresh dill", "Juice of 1/2 lemon", "Salt", "Carrots and peppers to dip"],
    steps: ["Stir everything together.", "Rest it 10 minutes so the dried spices bloom.", "Serve with raw vegetables."],
    tip: "Swaps straight in for sour cream on chilli or tacos at a fraction of the fat.",
  },
  {
    id: "r-keto-fat-bombs", name: "Almond Butter Fat Bombs", slot: "Snacks",
    tags: ["Low carb", "Keto", "Gluten free", "Vegetarian"],
    minutes: 10, servings: 10, calories: 150, protein: 4, carbs: 3, fat: 14,
    ingredients: ["120g almond butter", "60g coconut oil", "30g unsweetened cocoa", "Sweetener to taste", "Pinch of salt"],
    steps: ["Melt the coconut oil and stir everything together.", "Spoon into a mini muffin tray or silicone mould.", "Freeze 20 minutes. Keep them in the freezer."],
  },
  {
    id: "r-tuna-cucumber", name: "Tuna Cucumber Boats", slot: "Snacks",
    tags: ["High protein", "Low carb", "Keto", "Pescatarian", "Gluten free"],
    minutes: 8, servings: 1, calories: 210, protein: 28, carbs: 7, fat: 8,
    ingredients: ["1 tin tuna, drained", "2 tbsp Greek yogurt", "1 tsp mustard", "1 large cucumber", "Salt, pepper, paprika"],
    steps: ["Mix the tuna with the yogurt and mustard.", "Halve the cucumber lengthways and scoop out the seeds.", "Fill the channels and dust with paprika."],
  },
];

/** Recipes matching every selected tag (AND, not OR -- picking "High protein"
 * and "Vegan" should show things that are both, which is the useful question)
 * and the selected slot, narrowed by a free-text query over name and
 * ingredients. */
export function filterRecipes(recipes, { tags = [], slot = "All", query = "" } = {}) {
  const q = query.trim().toLowerCase();
  return recipes.filter((r) => {
    if (slot !== "All" && r.slot !== slot) return false;
    if (tags.length && !tags.every((t) => r.tags.includes(t))) return false;
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      r.ingredients.some((i) => i.toLowerCase().includes(q))
    );
  });
}
