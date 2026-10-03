const nutritionData = require("./nutrition.json");
const { calculateNutrition } = require("./nutritionCalculator");

const OLLAMA_GENERATE_URL = "http://127.0.0.1:11434/api/generate";
const MODEL = "gemma4:e4b";

function normalize(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function validateInputs({ availableIngredients, mealType, availableCookingTools }) {
  if (!Array.isArray(availableIngredients) || availableIngredients.length === 0 ||
      availableIngredients.some((ingredient) => typeof ingredient !== "string" || !ingredient.trim())) {
    throw new TypeError("availableIngredients must be a non-empty list of ingredient names.");
  }
  if (typeof mealType !== "string" || !mealType.trim()) {
    throw new TypeError("mealType must be a non-empty string.");
  }
  if (!Array.isArray(availableCookingTools) || availableCookingTools.length === 0 ||
      availableCookingTools.some((tool) => typeof tool !== "string" || !tool.trim())) {
    throw new TypeError("availableCookingTools must be a non-empty list of tool names.");
  }
}

function nutritionChoices(availableIngredients) {
  return availableIngredients.map((ingredient) => {
    const searchName = normalize(ingredient);
    const choices = nutritionData.foods
      .filter((food) => [food.id, food.name, ...food.aliases].some((name) => normalize(name) === searchName))
      .map(({ name, state }) => ({ name, state }));

    return { ingredient, nutritionEntries: choices };
  });
}

function buildPrompt({ availableIngredients, mealType, availableCookingTools }) {
  const context = {
    mealType,
    availableIngredients: nutritionChoices(availableIngredients),
    availableCookingTools,
  };

  return [
    "Create one practical recipe for the requested meal type.",
    "Return only one valid JSON object. Do not use markdown or add text outside the JSON.",
    "Use exactly these keys: recipeName, ingredients, cookingSteps.",
    "Each ingredients item must have exactly these keys: ingredient, weightGrams, state.",
    "ingredient must match one available ingredient name exactly; do not add ingredients, pantry staples, or seasonings that are not listed.",
    "weightGrams must be a positive number for the amount weighed before cooking (dry/raw amount when applicable).",
    "state must exactly match one of the nutritionEntries states shown for that ingredient. If a general ingredient name has multiple states and no state was specified by the user, choose its raw/uncooked state.",
    "Use only the listed cooking tools. Do not claim an ingredient or tool is available when it is not listed.",
    "cookingSteps must be a non-empty array of objects with exactly: instruction, ingredientsUsed, toolsUsed.",
    "For each step, ingredientsUsed and toolsUsed must list every ingredient/tool needed by that step and must be subsets of the supplied lists. Do not assume oil, water, salt, spices, sauces, or other pantry items unless explicitly supplied.",
    "Do not use dry rice, dry dal, or dry chickpeas unless water is available; omit any ingredient you cannot feasibly prepare with the listed ingredients and tools.",
    "Do not calculate or include calories, protein, carbohydrates, fat, or any other nutrition totals.",
    "Input:",
    JSON.stringify(context, null, 2),
  ].join("\n");
}

function parseAndValidateRecipe(responseText, input) {
  let recipe;
  try {
    recipe = JSON.parse(responseText);
  } catch (error) {
    throw new Error(`Gemma returned invalid JSON: ${error.message}`);
  }

  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
    throw new Error("Gemma response must be a JSON object.");
  }

  const expectedKeys = ["recipeName", "ingredients", "cookingSteps"];
  if (expectedKeys.some((key) => !(key in recipe)) ||
      Object.keys(recipe).some((key) => !expectedKeys.includes(key))) {
    throw new Error("Recipe JSON must contain only recipeName, ingredients, and cookingSteps.");
  }
  if (typeof recipe.recipeName !== "string" || !recipe.recipeName.trim()) {
    throw new Error("recipeName must be a non-empty string.");
  }
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
    throw new Error("ingredients must be a non-empty array.");
  }
  if (!Array.isArray(recipe.cookingSteps) || recipe.cookingSteps.length === 0) {
    throw new Error("cookingSteps must be a non-empty array of step objects.");
  }

  const available = new Set(input.availableIngredients.map(normalize));
  const availableTools = new Set(input.availableCookingTools.map(normalize));
  recipe.ingredients.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        Object.keys(item).some((key) => !["ingredient", "weightGrams", "state"].includes(key)) ||
        !["ingredient", "weightGrams", "state"].every((key) => key in item)) {
      throw new Error(`ingredients[${index}] must contain only ingredient, weightGrams, and state.`);
    }
    if (typeof item.ingredient !== "string" || !available.has(normalize(item.ingredient))) {
      throw new Error(`ingredients[${index}] uses an ingredient that was not provided.`);
    }
    if (typeof item.weightGrams !== "number" || !Number.isFinite(item.weightGrams) || item.weightGrams <= 0) {
      throw new Error(`ingredients[${index}].weightGrams must be a positive number.`);
    }
    if (typeof item.state !== "string" || !item.state.trim()) {
      throw new Error(`ingredients[${index}].state must be a non-empty string.`);
    }
  });

  const recipeIngredients = new Set(recipe.ingredients.map((item) => normalize(item.ingredient)));
  const hiddenResources = ["oil", "water", "salt", "pepper", "spice", "spices", "masala", "sauce", "butter", "ghee", "garlic", "ginger", "chilli", "chili"];
  recipe.cookingSteps.forEach((step, index) => {
    if (!step || typeof step !== "object" || Array.isArray(step) ||
        Object.keys(step).some((key) => !["instruction", "ingredientsUsed", "toolsUsed"].includes(key)) ||
        !["instruction", "ingredientsUsed", "toolsUsed"].every((key) => key in step)) {
      throw new Error(`cookingSteps[${index}] must contain only instruction, ingredientsUsed, and toolsUsed.`);
    }
    if (typeof step.instruction !== "string" || !step.instruction.trim() ||
        !Array.isArray(step.ingredientsUsed) || !Array.isArray(step.toolsUsed) ||
        step.ingredientsUsed.some((name) => typeof name !== "string") ||
        step.toolsUsed.some((name) => typeof name !== "string")) {
      throw new Error(`cookingSteps[${index}] has invalid instruction or resource lists.`);
    }
    if (step.ingredientsUsed.some((name) => !recipeIngredients.has(normalize(name))) ||
        step.toolsUsed.some((name) => !availableTools.has(normalize(name)))) {
      throw new Error(`cookingSteps[${index}] requires an ingredient or tool that is unavailable.`);
    }
    const instruction = normalize(step.instruction);
    const unavailableResource = hiddenResources.find((resource) =>
      !available.has(resource) && new RegExp(`\\b${resource}\\b`, "i").test(instruction));
    if (unavailableResource) {
      throw new Error(`cookingSteps[${index}] mentions unavailable ingredient/resource "${unavailableResource}".`);
    }
    if (/\b(chop|chops|chopped|chopping|dice|diced|mince|minced|slice|sliced)\b/i.test(instruction) && !availableTools.has("knife")) {
      throw new Error(`cookingSteps[${index}] requires a knife, which is not available.`);
    }
    if (/\b(sauté|saute|sautéed|sauteed|fry|frying|fried)\b/i.test(instruction) && !available.has("oil") && !available.has("ghee") && !available.has("butter")) {
      throw new Error(`cookingSteps[${index}] implies cooking fat, which is not available.`);
    }
    const mentionedIngredient = input.availableIngredients.find((name) =>
      new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "i").test(instruction));
    if (mentionedIngredient && !step.ingredientsUsed.some((name) => normalize(name) === normalize(mentionedIngredient))) {
      throw new Error(`cookingSteps[${index}] must declare mentioned ingredient "${mentionedIngredient}" in ingredientsUsed.`);
    }
    const mentionedTool = input.availableCookingTools.find((name) =>
      new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "i").test(instruction));
    if (mentionedTool && !step.toolsUsed.some((name) => normalize(name) === normalize(mentionedTool))) {
      throw new Error(`cookingSteps[${index}] must declare mentioned tool "${mentionedTool}" in toolsUsed.`);
    }
  });

  const usedIngredients = new Set(recipe.cookingSteps.flatMap((step) => step.ingredientsUsed.map(normalize)));
  if (recipe.ingredients.some((item) => !usedIngredients.has(normalize(item.ingredient)))) {
    throw new Error("Every recipe ingredient must be used in at least one cooking step.");
  }
  const availableNames = new Set(input.availableIngredients.map(normalize));
  if ((availableNames.has("rice") || availableNames.has("raw rice")) &&
      recipe.ingredients.some((item) => normalize(item.ingredient) === "rice" && normalize(item.state).includes("raw")) &&
      !availableNames.has("water")) {
    throw new Error("Raw rice requires water, which is not in the available ingredients.");
  }

  // Ensure the exact ingredient list can be passed to the deterministic calculator.
  const nutritionCheck = calculateNutrition(recipe.ingredients);
  if (!nutritionCheck.ok) {
    throw new Error(`Recipe ingredients are not accepted by the nutrition database: ${JSON.stringify(nutritionCheck.errors)}`);
  }

  return recipe;
}

async function generateRecipe(input) {
  validateInputs(input);

  let response;
  try {
    response = await fetch(OLLAMA_GENERATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        prompt: buildPrompt(input),
        format: "json",
        stream: false,
        options: { temperature: 0.2 },
      }),
    });
  } catch (error) {
    throw new Error(`Could not connect to local Ollama at ${OLLAMA_GENERATE_URL}: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Ollama returned HTTP ${response.status}: ${await response.text()}`);
  }

  const result = await response.json();
  if (typeof result.response !== "string") {
    throw new Error("Ollama response did not include generated text.");
  }

  return parseAndValidateRecipe(result.response, input);
}

async function runHardcodedRecipeTest() {
  const { generateMeal } = require("./mealFlow");
  const result = await generateMeal({
    availableIngredients: ["rice", "egg", "onion"],
    mealType: "lunch",
    availableCookingTools: ["pan", "stove"],
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

module.exports = { generateRecipe, parseAndValidateRecipe };

if (require.main === module) {
  runHardcodedRecipeTest().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
