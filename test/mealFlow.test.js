const test = require("node:test");
const assert = require("node:assert/strict");
const { attachNutrition } = require("../mealFlow");
const { calculateNutrition } = require("../nutritionCalculator");

test("attaches deterministic calculator totals to the validated recipe", () => {
  const recipe = {
    recipeName: "Onion Egg",
    ingredients: [
      { ingredient: "egg", weightGrams: 100, state: "raw" },
      { ingredient: "onion", weightGrams: 40, state: "raw" },
    ],
    cookingSteps: [],
  };

  const result = attachNutrition(recipe);
  assert.equal(result.recipe, recipe);
  assert.deepEqual(result.nutrition, calculateNutrition(recipe.ingredients));
  assert.equal(result.nutrition.totals.protein_g, 13.88);
  assert.equal(result.nutrition.totals.calories_kcal, 154);
});

test("does not return nutrition when calculator rejects recipe ingredients", () => {
  assert.throws(
    () => attachNutrition({ ingredients: [{ ingredient: "mystery food", weightGrams: 100 }] }),
    /Recipe ingredients cannot be calculated/,
  );
});
