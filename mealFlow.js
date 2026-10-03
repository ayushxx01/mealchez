const { generateRecipe } = require("./recipeGenerator");
const { calculateNutrition } = require("./nutritionCalculator");

/** Returns a recipe-plus-nutrition value, or throws if deterministic calculation rejects the recipe. */
function attachNutrition(recipe) {
  const nutrition = calculateNutrition(recipe.ingredients);
  if (!nutrition.ok) {
    throw new Error(`Recipe ingredients cannot be calculated: ${JSON.stringify(nutrition.errors)}`);
  }
  return { recipe, nutrition };
}

/** Returns a Promise of the recipe-plus-nutrition value; it rejects on Ollama, validation, or calculation errors. */
async function generateMeal(input) {
  const recipe = await generateRecipe(input);
  return attachNutrition(recipe);
}

module.exports = { attachNutrition, generateMeal };
