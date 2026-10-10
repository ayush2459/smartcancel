import { GoogleGenAI } from "@google/genai";
import type { LlmProvider } from "./agent.js";

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;

  constructor(private readonly apiKey: string, private readonly model: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateJson(systemInstruction: string, input: unknown): Promise<unknown> {
    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.model,
        contents: JSON.stringify(input),
        config: { systemInstruction, responseMimeType: "application/json", temperature: 0 },
      });
    } catch (error) {
      logGeminiFailure(error, this.apiKey);
      throw error;
    }
    if (!response.text) {
      console.error("[ai-agent] Gemini response rejected code=empty_response");
      throw new Error("Model returned no text.");
    }
    try {
      return JSON.parse(response.text);
    } catch {
      console.error("[ai-agent] Gemini response rejected code=invalid_json");
      throw new Error("Model returned invalid JSON.");
    }
  }
}

function logGeminiFailure(error: unknown, apiKey: string): void {
  const details = isRecord(error) ? error : {};
  const response = isRecord(details.response) ? details.response : {};
  const responseData = isRecord(response.data) ? response.data : {};
  const serializedApiError = typeof details.message === "string" ? parseApiError(details.message) : undefined;
  const nestedError = isRecord(details.error)
    ? details.error
    : isRecord(responseData.error)
      ? responseData.error
      : serializedApiError ?? {};
  const status = typeof details.status === "number"
    ? details.status
    : typeof details.statusCode === "number"
      ? details.statusCode
      : typeof response.status === "number" ? response.status : "unavailable";
  const rawCode = safeField(nestedError.code) ?? safeField(details.code) ?? safeField(nestedError.status) ?? "unavailable";
  const rawMessage = typeof nestedError.message === "string"
    ? nestedError.message
    : "Gemini request failed.";
  const code = sanitize(rawCode, apiKey);
  const message = sanitize(rawMessage, apiKey);
  console.error(`[ai-agent] Gemini request failed http_status=${status} code=${code} message="${message}"`);
}

function parseApiError(message: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(message);
    return isRecord(parsed) && isRecord(parsed.error) ? parsed.error : undefined;
  } catch {
    return undefined;
  }
}

function sanitize(value: string, apiKey: string): string {
  return (apiKey ? value.replaceAll(apiKey, "[redacted]") : value)
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(?:api[_-]?key|access[_-]?token|password)\s*[:=]\s*["']?[^"' \t,;]+/gi, "[redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 240);
}

function safeField(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value).replace(/[\r\n\t ]/g, "").slice(0, 80) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
