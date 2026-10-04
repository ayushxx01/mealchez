const form = document.querySelector("#meal-form");
const submitButton = document.querySelector("#submit-button");
const statusMessage = document.querySelector("#status");
const resultSection = document.querySelector("#result");

function appendText(parent, tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  parent.append(element);
  return element;
}

function renderMeal({ recipe, nutrition }) {
  resultSection.replaceChildren();
  appendText(resultSection, "h2", recipe.recipeName);

  appendText(resultSection, "h3", "Ingredients");
  const ingredientsList = document.createElement("ul");
  recipe.ingredients.forEach((item) => {
    appendText(ingredientsList, "li", `${item.name} — ${item.quantity} ${item.unit}`);
  });
  resultSection.append(ingredientsList);

  appendText(resultSection, "h3", "Cooking steps");
  const stepsList = document.createElement("ol");
  recipe.cookingSteps.forEach((step) => appendText(stepsList, "li", step.instruction));
  resultSection.append(stepsList);

  appendText(resultSection, "h3", "Nutrition (whole recipe)");
  const nutritionGrid = document.createElement("div");
  nutritionGrid.className = "nutrition";
  const labels = [
    ["Calories", "calories_kcal", "kcal"],
    ["Protein", "protein_g", "g"],
    ["Carbohydrates", "carbohydrates_g", "g"],
    ["Fat", "fat_g", "g"],
  ];
  labels.forEach(([label, key, unit]) => {
    const card = document.createElement("div");
    const value = nutrition.totals[key];
    appendText(card, "span", label);
    appendText(card, "strong", value === null ? "Not available in dataset" : `${value} ${unit}`);
    nutritionGrid.append(card);
  });
  resultSection.append(nutritionGrid);
  resultSection.hidden = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusMessage.textContent = "Generating a meal with local Gemma…";
  resultSection.hidden = true;
  submitButton.disabled = true;

  try {
    const availableIngredients = document.querySelector("#ingredients").value.split(",").map((entry) => {
      const match = entry.trim().match(/^(.+?)\s*:\s*(\d+(?:\.\d+)?)\s*(g|ml|piece)$/i);
      if (!match || Number(match[2]) <= 0) {
        throw new Error(`Use "ingredient: positive quantity unit" with g, ml, or piece for "${entry.trim()}".`);
      }
      return { name: match[1].trim(), quantity: Number(match[2]), unit: match[3].toLowerCase() };
    });
    const input = {
      availableIngredients,
      mealType: document.querySelector("#meal-type").value,
      availableCookingTools: document.querySelector("#tools").value.split(",").map((item) => item.trim()).filter(Boolean),
    };
    const response = await fetch("/api/generate-meal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Meal generation failed. Please try again.");
    renderMeal(data);
    statusMessage.textContent = "";
  } catch (error) {
    statusMessage.textContent = error.message || "Could not reach the local Meal Prepper server.";
  } finally {
    submitButton.disabled = false;
  }
});
