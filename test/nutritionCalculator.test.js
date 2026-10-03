const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateNutrition } = require("../nutritionCalculator");

test("calculates nutrients for a weighted ingredient", () => {
  const result = calculateNutrition([{ ingredient: "rice", weightGrams: 50 }]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.totals, {
    calories_kcal: 178.2,
    protein_g: 3.97,
    carbohydrates_g: 39.12,
    fat_g: 0.28,
  });
});

test("sums nutrients across ingredients", () => {
  const result = calculateNutrition([
    { ingredient: "rice", weightGrams: 50 },
    { ingredient: "milk", weightGrams: 200 },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.totals, {
    calories_kcal: 324,
    protein_g: 10.49,
    carbohydrates_g: 49,
    fat_g: 9.24,
  });
});

test("requires a state when a common name matches raw and boiled entries", () => {
  const result = calculateNutrition([{ ingredient: "egg", weightGrams: 100 }]);

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].type, "ambiguous_ingredient");
  assert.deepEqual(result.errors[0].options.map((food) => food.state), ["raw", "boiled"]);
  assert.equal("totals" in result, false);
});

test("uses the requested food state and preserves unavailable nutrients", () => {
  const result = calculateNutrition([
    { ingredient: "egg", state: "boiled", weightGrams: 100 },
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.totals.calories_kcal, 147.7);
  assert.equal(result.totals.protein_g, 13.43);
  assert.equal(result.totals.carbohydrates_g, null);
  assert.deepEqual(result.items[0].unavailableNutrients, ["carbohydrates_g"]);
});

test("reports unknown ingredients instead of treating them as zero", () => {
  const result = calculateNutrition([
    { ingredient: "oats", weightGrams: 40 },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].type, "ingredient_not_found");
  assert.equal("totals" in result, false);
});

test("rejects invalid weights", () => {
  const result = calculateNutrition([
    { ingredient: "rice", weightGrams: 0 },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].type, "invalid_weight");
});
