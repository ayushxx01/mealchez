const { generateRecipe } = require("./recipeGenerator");
const { calculateNutrition } = require("./nutritionCalculator");
const { convertRecipeIngredientsToGrams } = require("./unitConverter");

/** Returns a recipe-plus-nutrition value, or throws on unsupported conversion or calculator errors. */
function attachNutrition(recipe) {
  const calculatorIngredients = convertRecipeIngredientsToGrams(recipe.ingredients);
  const nutrition = calculateNutrition(calculatorIngredients);
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
