const conversionData = require("./unitConversions.json");

function normalize(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Returns a gram value or throws when the quantity or food/unit conversion is invalid. */
function convertQuantityToGrams({ name, quantity, unit }) {
  if (typeof name !== "string" || !name.trim()) {
    throw new TypeError("Ingredient name must be a non-empty string.");
  }
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
    throw new TypeError("Ingredient quantity must be a positive number.");
  }
  if (typeof unit !== "string" || !conversionData.supportedUnits.includes(normalize(unit))) {
    throw new Error(`Unsupported unit "${unit}". Use g, ml, or piece.`);
  }

  const normalizedUnit = normalize(unit);
  if (normalizedUnit === "g") return quantity;

  const food = conversionData.foods.find((entry) => entry.names.some((foodName) => normalize(foodName) === normalize(name)));
  const conversion = food?.units[normalizedUnit];
  if (!conversion) {
    throw new Error(`No gram conversion is configured for ${name} in ${normalizedUnit}. Add a conversion or choose grams.`);
  }

  return Math.round((quantity * conversion.gramsPerUnit + Number.EPSILON) * 100) / 100;
}

/** Returns calculator-ready ingredient values with deterministic gram weights. */
function convertRecipeIngredientsToGrams(ingredients) {
  if (!Array.isArray(ingredients)) {
    throw new TypeError("Recipe ingredients must be an array.");
  }
  return ingredients.map((item, index) => {
    try {
      return {
        ingredient: item.name,
        weightGrams: convertQuantityToGrams(item),
        state: item.state,
      };
    } catch (error) {
      throw new Error(`ingredients[${index}]: ${error.message}`);
    }
  });
}

module.exports = { convertQuantityToGrams, convertRecipeIngredientsToGrams };
