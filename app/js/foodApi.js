// Thin wrapper around Open Food Facts (https://world.openfoodfacts.org) --
// a free, public food database with no API key and no usage cost. Covers
// barcode lookup and name search for both branded/packaged foods and a lot
// of generic ones. Coverage is real but not universal (a homemade dish or an
// obscure product may come back empty) -- callers should always offer a
// manual-entry fallback.
//
// NOTE: this file talks to the public internet from the *client's own
// device* -- it's never reachable from a locked-down build/test sandbox, so
// verifying it actually returns results needs a real phone/browser.

const BASE = "https://world.openfoodfacts.org";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalizes one Open Food Facts product record into the shape the app uses. */
function normalizeProduct(product, barcode) {
  if (!product) return null;
  const n = product.nutriments || {};
  const per100g = {
    calories: num(n["energy-kcal_100g"]),
    protein: num(n.proteins_100g),
    carbs: num(n.carbohydrates_100g),
    fat: num(n.fat_100g),
  };
  if (per100g.calories === null && per100g.protein === null && per100g.carbs === null && per100g.fat === null) {
    return null; // no usable macro data at all
  }
  const hasServing = ["energy-kcal_serving", "proteins_serving", "carbohydrates_serving", "fat_serving"].some((k) => n[k] !== undefined);
  const perServing = hasServing
    ? {
        calories: num(n["energy-kcal_serving"]) || 0,
        protein: num(n.proteins_serving) || 0,
        carbs: num(n.carbohydrates_serving) || 0,
        fat: num(n.fat_serving) || 0,
      }
    : null;
  return {
    barcode: barcode || product.code || "",
    name: product.product_name || product.generic_name || "Unknown food",
    brand: (product.brands || "").split(",")[0].trim(),
    servingSize: product.serving_size || null,
    per100g,
    perServing,
  };
}

/** Looks up one product by barcode. Returns null if not found, unreachable, or has no usable nutrition data. */
export async function lookupBarcode(barcode) {
  try {
    const res = await fetch(`${BASE}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,generic_name,brands,nutriments,serving_size,code`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;
    return normalizeProduct(data.product, barcode);
  } catch {
    return null;
  }
}

/** Text search by product name. Returns an array (possibly empty) of normalized products, never throws. */
export async function searchFoodByName(query) {
  const q = query.trim();
  if (!q) return [];
  try {
    const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=product_name,generic_name,brands,nutriments,serving_size,code`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const products = Array.isArray(data.products) ? data.products : [];
    return products.map((p) => normalizeProduct(p, p.code)).filter(Boolean);
  } catch {
    return [];
  }
}
