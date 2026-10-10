import assert from "node:assert/strict";
import test from "node:test";
import { GeminiProvider } from "./gemini-provider.js";

test("logs structured Gemini API failure details without logging the full error body or API key", async () => {
  const provider = new GeminiProvider("test-secret", "test-model");
  const apiError = Object.assign(new Error(JSON.stringify({
    error: { code: 404, message: "Model not found; api_key=test-secret" },
  })), { status: 404 });
  Object.defineProperty(provider, "client", {
    configurable: true,
    value: { models: { generateContent: async () => { throw apiError; } } },
  });

  const originalError = console.error;
  const lines: string[] = [];
  console.error = (message?: unknown) => { lines.push(String(message)); };
  try {
    await assert.rejects(provider.generateJson("do not log this prompt", { customer: "do not log this snapshot" }));
  } finally {
    console.error = originalError;
  }

  assert.equal(lines.length, 1);
  assert.match(lines[0], /http_status=404 code=404 message="Model not found/);
  assert.doesNotMatch(lines[0], /test-secret|do not log|customer|\"error\"/);
});
