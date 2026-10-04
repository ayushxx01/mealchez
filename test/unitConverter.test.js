const test = require("node:test");
const assert = require("node:assert/strict");
const { convertQuantityToGrams, convertRecipeIngredientsToGrams } = require("../unitConverter");

test("passes gram quantities through unchanged for the nutrition calculator", () => {
  assert.deepEqual(
    convertRecipeIngredientsToGrams([{ name: "rice", quantity: 150, unit: "g", state: "raw, milled" }]),
    [{ ingredient: "rice", weightGrams: 150, state: "raw, milled" }],
  );
});

test("converts piece quantities only for ingredients with explicit mappings", () => {
  assert.equal(convertQuantityToGrams({ name: "egg", quantity: 2, unit: "piece" }), 100);
  assert.equal(convertQuantityToGrams({ name: "onion", quantity: 0.5, unit: "piece" }), 50);
});

test("converts milk milliliters using its explicit density mapping", () => {
  assert.equal(convertQuantityToGrams({ name: "milk", quantity: 500, unit: "ml" }), 515);
});

test("reports unsupported food and unit conversions instead of guessing", () => {
  assert.throws(
    () => convertQuantityToGrams({ name: "onion", quantity: 1, unit: "ml" }),
    /No gram conversion is configured for onion in ml/,
  );
  assert.throws(
    () => convertQuantityToGrams({ name: "oil", quantity: 2, unit: "tbsp" }),
    /Unsupported unit "tbsp"/,
  );
});
