const test = require("node:test");
const assert = require("node:assert/strict");
const { attachNutrition } = require("../mealFlow");
const { calculateNutrition } = require("../nutritionCalculator");
const { convertRecipeIngredientsToGrams } = require("../unitConverter");

test("attaches deterministic calculator totals to the validated recipe", () => {
  const recipe = {
    recipeName: "Onion Egg",
    ingredients: [
      { name: "egg", quantity: 2, unit: "piece", state: "raw" },
      { name: "onion", quantity: 0.5, unit: "piece", state: "raw" },
    ],
    cookingSteps: [],
  };

  const result = attachNutrition(recipe);
  assert.equal(result.recipe, recipe);
  assert.deepEqual(result.nutrition, calculateNutrition(convertRecipeIngredientsToGrams(recipe.ingredients)));
  assert.equal(result.nutrition.totals.protein_g, 14.03);
  assert.equal(result.nutrition.totals.calories_kcal, 158.8);
});

test("does not return nutrition when calculator rejects recipe ingredients", () => {
  assert.throws(
    () => attachNutrition({ ingredients: [{ name: "mystery food", quantity: 100, unit: "g" }] }),
    /Recipe ingredients cannot be calculated/,
  );
});

test("does not guess when a recipe uses an unsupported food/unit pair", () => {
  assert.throws(
    () => attachNutrition({ ingredients: [{ name: "onion", quantity: 1, unit: "ml", state: "raw" }] }),
    /No gram conversion is configured for onion in ml/,
  );
});
