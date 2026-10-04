const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../server");

async function startServer(t, mealGenerator) {
  const server = createServer(mealGenerator);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("serves the Meal Prepper frontend", async (t) => {
  const baseUrl = await startServer(t, async () => ({}));
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Meal Prepper/);
});

test("passes submitted user input to generateMeal and returns its result", async (t) => {
  const expected = { recipe: { recipeName: "Egg meal" }, nutrition: { totals: { protein_g: 10 } } };
  let receivedInput;
  const baseUrl = await startServer(t, async (input) => {
    receivedInput = input;
    return expected;
  });
  const input = {
    availableIngredients: [
      { name: "rice", quantity: 200, unit: "g" },
      { name: "egg", quantity: 3, unit: "piece" },
      { name: "onion", quantity: 1, unit: "piece" },
    ],
    mealType: "lunch",
    availableCookingTools: ["pan", "stove"],
  };

  const response = await fetch(`${baseUrl}/api/generate-meal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(receivedInput, input);
  assert.deepEqual(await response.json(), expected);
});

test("returns useful JSON errors when meal generation fails", async (t) => {
  const baseUrl = await startServer(t, async () => { throw new Error("Recipe rejected: missing water."); });
  const response = await fetch(`${baseUrl}/api/generate-meal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "Recipe rejected: missing water." });
});
