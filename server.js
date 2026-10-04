const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { generateMeal } = require("./mealFlow");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const STATIC_FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
};
const MAX_BODY_BYTES = 16 * 1024;

function sendJson(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      const error = new Error("Request is too large. Please reduce the input and try again.");
      error.statusCode = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function createServer(mealGenerator = generateMeal) {
  return http.createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;

    if (request.method === "GET" && STATIC_FILES[pathname]) {
      const [fileName, contentType] = STATIC_FILES[pathname];
      try {
        const contents = await fs.readFile(path.join(PUBLIC_DIR, fileName));
        response.writeHead(200, { "Content-Type": contentType });
        response.end(contents);
      } catch {
        sendJson(response, 500, { error: "The app files could not be loaded." });
      }
      return;
    }

    if (request.method === "POST" && pathname === "/api/generate-meal") {
      try {
        const input = await readJsonBody(request);
        const result = await mealGenerator(input);
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, error.statusCode || 422, {
          error: error.message || "Meal generation failed. Check Ollama and try again.",
        });
      }
      return;
    }

    sendJson(response, 404, { error: "Not found." });
  });
}

if (require.main === module) {
  createServer().listen(PORT, "127.0.0.1", () => {
    console.log(`Meal Prepper is running at http://127.0.0.1:${PORT}`);
  });
}

module.exports = { createServer };
