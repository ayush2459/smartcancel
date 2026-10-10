import { GoogleGenAI } from "@google/genai";
import type { LlmProvider } from "./agent.js";

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateJson(systemInstruction: string, input: unknown): Promise<unknown> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: JSON.stringify(input),
      config: { systemInstruction, responseMimeType: "application/json", temperature: 0 },
    });
    if (!response.text) throw new Error("Model returned no text.");
    return JSON.parse(response.text);
  }
}
