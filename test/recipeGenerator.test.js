const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateNutrition } = require("../nutritionCalculator");
const { parseAndValidateRecipe } = require("../recipeGenerator");

const input = {
  availableIngredients: ["rice", "egg", "onion"],
  mealType: "lunch",
  availableCookingTools: ["pan", "stove"],
};

const validRecipeJson = JSON.stringify({
  recipeName: "Onion Egg Rice",
  ingredients: [
    { ingredient: "egg", weightGrams: 100, state: "raw" },
    { ingredient: "onion", weightGrams: 40, state: "raw" },
  ],
  cookingSteps: [
    { instruction: "Cook the onion and egg in the pan on the stove until set.", ingredientsUsed: ["onion", "egg"], toolsUsed: ["pan", "stove"] },
  ],
});

test("parses and validates structured recipe JSON accepted by nutrition calculator", () => {
  const recipe = parseAndValidateRecipe(validRecipeJson, input);

  assert.equal(recipe.recipeName, "Onion Egg Rice");
  assert.equal(recipe.ingredients[0].weightGrams, 100);
  assert.equal(calculateNutrition(recipe.ingredients).ok, true);
});

test("rejects invalid JSON", () => {
  assert.throws(
    () => parseAndValidateRecipe("not json", input),
    /Gemma returned invalid JSON/,
  );
});

test("rejects ingredients outside the available list", () => {
  const recipe = JSON.parse(validRecipeJson);
  recipe.ingredients.push({ ingredient: "milk", weightGrams: 100, state: "whole milk, as listed; heat treatment not specified by IFCT" });

  assert.throws(
    () => parseAndValidateRecipe(JSON.stringify(recipe), input),
    /uses an ingredient that was not provided/,
  );
});

test("rejects invalid weights and missing ingredient state", () => {
  const badWeight = JSON.parse(validRecipeJson);
  badWeight.ingredients[0].weightGrams = 0;
  assert.throws(
    () => parseAndValidateRecipe(JSON.stringify(badWeight), input),
    /weightGrams must be a positive number/,
  );

  const missingState = JSON.parse(validRecipeJson);
  delete missingState.ingredients[0].state;
  assert.throws(
    () => parseAndValidateRecipe(JSON.stringify(missingState), input),
    /must contain only ingredient, weightGrams, and state/,
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
  recipe.ingredients.push({ ingredient: "rice", weightGrams: 70, state: "raw, milled" });
  recipe.cookingSteps[0].ingredientsUsed.push("rice");
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), input), /Raw rice requires water/);
});

test("rejects cooking steps that imply an unavailable knife or cooking fat", () => {
  const recipe = JSON.parse(validRecipeJson);
  recipe.cookingSteps[0].instruction = "Chop the onion, then sauté it in the pan.";
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), input), /requires a knife/);
  recipe.cookingSteps[0].instruction = "Cook the onion by sautéing it in the pan.";
  assert.throws(() => parseAndValidateRecipe(JSON.stringify(recipe), input), /implies cooking fat/);
});
