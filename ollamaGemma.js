const OLLAMA_GENERATE_URL = "http://127.0.0.1:11434/api/generate";
const MODEL = "gemma4:e4b";
const PROMPT = "In one short sentence, suggest a simple meal using eggs.";

async function main() {
  let response;

  try {
    response = await fetch(OLLAMA_GENERATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, prompt: PROMPT, stream: false }),
    });
  } catch (error) {
    throw new Error(
      `Could not connect to Ollama at ${OLLAMA_GENERATE_URL}: ${error.message}`,
    );
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Ollama returned HTTP ${response.status}: ${details}`);
  }

  const result = await response.json();
  if (typeof result.response !== "string") {
    throw new Error("Ollama response did not include generated text.");
  }

  process.stdout.write(`${result.response.trim()}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
