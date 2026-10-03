const nutritionData = require("./nutrition.json");

const NUTRIENTS = [
  "calories_kcal",
  "protein_g",
  "carbohydrates_g",
  "fat_g",
];

function normalize(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchesState(foodState, requestedState) {
  const actual = normalize(foodState);
  const requested = normalize(requestedState);
  return actual === requested || actual.split(/[,;]+\s*/).includes(requested);
}

function findFood(ingredient, state, foods) {
  const searchTerm = normalize(ingredient);
  const candidates = foods.filter((food) => {
    const names = [food.id, food.name, ...food.aliases].map(normalize);
    return names.includes(searchTerm) && (!state || matchesState(food.state, state));
  });

  if (candidates.length === 1) return { food: candidates[0] };
  if (candidates.length > 1) {
    return {
      error: {
        type: "ambiguous_ingredient",
        message: `"${ingredient}" matches multiple food states. Specify a state or use a more specific name.`,
        options: candidates.map(({ id, name, state: foodState }) => ({
          id,
          name,
          state: foodState,
        })),
      },
    };
  }

  return {
    error: {
      type: "ingredient_not_found",
      message: state
        ? `No database entry found for "${ingredient}" in state "${state}".`
        : `No database entry found for "${ingredient}".`,
    },
  };
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates ingredient and total nutrition from the local per-100 g dataset.
 * Returns an ok/result object, or ok:false with input errors and no totals.
 */
function calculateNutrition(ingredients) {
  if (!Array.isArray(ingredients)) {
    return {
      ok: false,
      errors: [{ type: "invalid_input", message: "Ingredients must be an array." }],
    };
  }

  const errors = [];
  const resolved = [];

  ingredients.forEach((item, index) => {
    if (!item || typeof item.ingredient !== "string" || !item.ingredient.trim()) {
      errors.push({
        index,
        type: "invalid_ingredient",
        message: "Each item must include a non-empty ingredient name.",
      });
      return;
    }

    if (typeof item.weightGrams !== "number" || !Number.isFinite(item.weightGrams) || item.weightGrams <= 0) {
      errors.push({
        index,
        ingredient: item.ingredient,
        type: "invalid_weight",
        message: "Weight must be a positive number of grams.",
      });
      return;
    }

    const match = findFood(item.ingredient, item.state, nutritionData.foods);
    if (match.error) {
      errors.push({ index, ingredient: item.ingredient, ...match.error });
      return;
    }

    resolved.push({ item, food: match.food });
  });

  if (errors.length > 0) return { ok: false, errors };

  const items = resolved.map(({ item, food }) => {
    const nutrients = {};
    const unavailableNutrients = [];

    for (const nutrient of NUTRIENTS) {
      const per100g = food.per100g[nutrient];
      if (per100g === null || per100g === undefined) {
        nutrients[nutrient] = null;
        unavailableNutrients.push(nutrient);
      } else {
        nutrients[nutrient] = round((per100g * item.weightGrams) / 100);
      }
    }

    return {
      ingredient: food.name,
      state: food.state,
      weightGrams: item.weightGrams,
      nutrients,
      unavailableNutrients,
    };
  });

  const totals = Object.fromEntries(
    NUTRIENTS.map((nutrient) => [
      nutrient,
      items.some((item) => item.nutrients[nutrient] === null)
        ? null
        : round(items.reduce((sum, item) => sum + item.nutrients[nutrient], 0)),
    ]),
  );

  return { ok: true, items, totals };
}

module.exports = { calculateNutrition };
