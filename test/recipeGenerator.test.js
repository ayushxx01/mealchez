const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateNutrition } = require("../nutritionCalculator");
const { convertRecipeIngredientsToGrams } = require("../unitConverter");
const { parseAndValidateRecipe } = require("../recipeGenerator");

const input = {
  availableIngredients: [
    { name: "rice", quantity: 200, unit: "g" },
    { name: "egg", quantity: 3, unit: "piece" },
    { name: "onion", quantity: 1, unit: "piece" },
  ],
  mealType: "lunch",
  availableCookingTools: ["pan", "stove", "knife"],
};

const validRecipeJson = JSON.stringify({
  recipeName: "Onion Egg Rice",
  ingredients: [
    { name: "egg", quantity: 2, unit: "piece", state: "raw" },
    { name: "onion", quantity: 0.5, unit: "piece", state: "raw" },
  ],
  cookingSteps: [
    { instruction: "Cook the onion and egg in the pan on the stove until set.", ingredientsUsed: ["onion", "egg"], toolsUsed: ["pan", "stove"] },
  ],
});

test("parses and validates structured recipe JSON accepted by nutrition calculator", () => {
  const recipe = parseAndValidateRecipe(validRecipeJson, input);

  assert.equal(recipe.recipeName, "Onion Egg Rice");
  assert.equal(recipe.ingredients[0].quantity, 2);
  assert.equal(recipe.ingredients[0].unit, "piece");
  assert.equal(calculateNutrition(convertRecipeIngredientsToGrams(recipe.ingredients)).ok, true);
});

test("rejects invalid JSON", () => {
  assert.throws(
    () => parseAndValidateRecipe("not json", input),
    /Gemma returned invalid JSON/,
  );
});

test("rejects ingredients outside the available list", () => {
  const recipe = JSON.parse(validRecipeJson);
  recipe.ingredients.push({ name: "milk", quantity: 100, unit: "ml", state: "whole milk, as listed; heat treatment not specified by IFCT" });

  assert.throws(
    () => parseAndValidateRecipe(JSON.stringify(recipe), input),
    /uses an ingredient that was not provided/,
  );
});

test("validates recipe quantities against stock in the same unit", () => {
  const recipe = JSON.parse(validRecipeJson);
  recipe.ingredients[0].quantity = 2;
  assert.equal(parseAndValidateRecipe(JSON.stringify(recipe), input).ingredients[0].quantity, 2);

  recipe.ingredients[0].quantity = 4;
  assert.throws(
    () => parseAndValidateRecipe(JSON.stringify(recipe), input),
    /exceeds the available 3 piece of egg/,
  );

  recipe.ingredients[0].quantity = 2;
  recipe.ingredients[0].unit = "g";
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), input), /unit must match the available unit piece/);
});

test("requires each available ingredient to have a unique name, positive quantity, and supported unit", async () => {
  const { generateRecipe } = require("../recipeGenerator");
  await assert.rejects(
    () => generateRecipe({ ...input, availableIngredients: [{ name: "rice", quantity: 0, unit: "g" }] }),
    /positive quantity/,
  );
  await assert.rejects(
    () => generateRecipe({ ...input, availableIngredients: [
      { name: "egg", quantity: 1, unit: "piece" },
      { name: " Egg ", quantity: 2, unit: "piece" },
    ] }),
    /duplicate ingredient names/,
  );
  await assert.rejects(
    () => generateRecipe({ ...input, availableIngredients: [{ name: "oil", quantity: 2, unit: "tbsp" }] }),
    /supported unit \(g, ml, or piece\)/,
  );
});

test("sends available quantities and original units to Gemma", async () => {
  const { generateRecipe } = require("../recipeGenerator");
  const originalFetch = global.fetch;
  let ollamaRequest;
  global.fetch = async (_url, options) => {
    ollamaRequest = JSON.parse(options.body);
    return { ok: true, json: async () => ({ response: validRecipeJson }) };
  };

  try {
    const recipe = await generateRecipe(input);
    const prompt = ollamaRequest.prompt;
    assert.equal(recipe.ingredients[0].quantity, 2);
    assert.match(prompt, /"availableQuantity": 3/);
    assert.match(prompt, /"unit": "piece"/);
    assert.match(prompt, /must not exceed availableQuantity/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("rejects invalid weights and missing ingredient state", () => {
  const badWeight = JSON.parse(validRecipeJson);
  badWeight.ingredients[0].quantity = 0;
  assert.throws(
    () => parseAndValidateRecipe(JSON.stringify(badWeight), input),
    /quantity must be a positive number/,
  );

  const missingState = JSON.parse(validRecipeJson);
  delete missingState.ingredients[0].state;
  assert.throws(
    () => parseAndValidateRecipe(JSON.stringify(missingState), input),
    /must contain only name, quantity, unit, and state/,
  );
});

test("rejects a recipe whose ingredient state cannot be resolved by nutrition data", () => {
  const recipe = JSON.parse(validRecipeJson);
  recipe.ingredients[1].state = "fried";

  assert.throws(
    () => parseAndValidateRecipe(JSON.stringify(recipe), input),
    /not accepted by the nutrition database/,
  );
});

test("rejects undeclared pantry ingredients in cooking instructions", () => {
  const recipe = JSON.parse(validRecipeJson);
  recipe.cookingSteps[0].instruction += " Add oil.";
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), input), /unavailable ingredient\/resource "oil"/);
});

test("rejects unavailable tools declared for a cooking step", () => {
  const recipe = JSON.parse(validRecipeJson);
  recipe.cookingSteps[0].toolsUsed.push("oven");
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), input), /unavailable/);
});

test("rejects raw rice when water is unavailable", () => {
  const recipe = JSON.parse(validRecipeJson);
  recipe.recipeName = "Rice and Egg";
  recipe.ingredients.push({ name: "rice", quantity: 70, unit: "g", state: "raw, milled" });
  recipe.cookingSteps[0].ingredientsUsed.push("rice");
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), input), /Raw rice requires water/);
});

test("rejects cooking steps that imply an unavailable knife or cooking fat", () => {
  const recipe = JSON.parse(validRecipeJson);
  recipe.cookingSteps[0].instruction = "Chop the onion, then sauté it in the pan.";
  const withoutKnife = { ...input, availableCookingTools: ["pan", "stove"] };
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), withoutKnife), /requires a knife/);
  recipe.cookingSteps[0].instruction = "Cook the onion by sautéing it in the pan.";
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), input), /implies cooking fat/);
});
