import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { pathToFileURL } from "node:url";
import { analyze, type LlmProvider } from "./agent.js";
import { assertDecisionSnapshot, ContractError, type DecisionSnapshot } from "./contracts.js";
import { GeminiProvider } from "./gemini-provider.js";

export type AgentServerConfig = {
  apiBaseUrl: string;
  serviceToken?: string;
  agentKey?: string;
  provider?: LlmProvider;
  backendTimeoutMs: number;
  modelTimeoutMs: number;
  allowInlineSnapshot: boolean;
};

export type AgentRequest = { method?: string; url?: string; headers?: Record<string, string | undefined>; body?: string };
export type AgentResponse = { status: number; payload: unknown };
type DecisionLoader = (decisionId: string, config: AgentServerConfig) => Promise<DecisionSnapshot>;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function providerFromEnvironment(): LlmProvider | undefined {
  if (process.env.AI_AGENT_PROVIDER !== "gemini") return undefined;
  const key = process.env.GEMINI_API_KEY;
  return key ? new GeminiProvider(key, process.env.GEMINI_MODEL ?? "gemini-3.8-flash") : undefined;
}

export function configFromEnvironment(): AgentServerConfig {
  return {
    apiBaseUrl: (process.env.SCRE_API_BASE_URL ?? "http://localhost:8000/api/v1").replace(/\/$/, ""),
    serviceToken: process.env.SCRE_SERVICE_TOKEN || process.env.AI_AGENT_SHARED_SECRET,
    agentKey: process.env.AI_AGENT_SHARED_SECRET,
    provider: providerFromEnvironment(),
    backendTimeoutMs: positiveInt(process.env.AI_AGENT_BACKEND_TIMEOUT_MS, 5_000),
    modelTimeoutMs: positiveInt(process.env.AI_AGENT_MODEL_TIMEOUT_MS, 10_000),
    allowInlineSnapshot: process.env.AI_AGENT_ALLOW_INLINE_SNAPSHOT === "true",
  };
}

export function parseJsonBody(body: string): Record<string, unknown> {
  if (body.length > 100_000) throw new ContractError("Request body is too large.");
  if (!body) return {};
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ContractError("Request body must be a JSON object.");
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ContractError) throw error;
    throw new ContractError("Request body must be valid JSON.");
  }
}

function reply(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function loadDecision(decisionId: string, config: AgentServerConfig): Promise<DecisionSnapshot> {
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}/decisions/${encodeURIComponent(decisionId)}`, {
      headers: config.serviceToken ? { authorization: `Bearer ${config.serviceToken}` } : {},
      signal: AbortSignal.timeout(config.backendTimeoutMs),
    });
  } catch {
    throw new Error("Decision API is unavailable or timed out.");
  }
  if (!response.ok) throw new Error(`Decision API returned ${response.status}.`);
  const payload: unknown = await response.json();
  assertDecisionSnapshot(payload);
  return payload;
}

export async function processAgentRequest(
  request: AgentRequest,
  config: AgentServerConfig,
  decisionLoader: DecisionLoader = loadDecision,
): Promise<AgentResponse> {
  try {
    if (request.method === "GET" && request.url === "/health") {
      return { status: 200, payload: { status: "ok", api_base_url: config.apiBaseUrl, provider: config.provider?.name ?? "deterministic-fallback", inline_snapshot_enabled: config.allowInlineSnapshot } };
    }
    const match = request.url?.match(/^\/v1\/decisions\/([^/?]+)\/analyze(?:\?.*)?$/);
    if (request.method !== "POST" || !match) return { status: 404, payload: { error: "Not found" } };
    if (!config.agentKey) return { status: 503, payload: { error: "Agent authentication is not configured" } };
    if (request.headers?.["x-agent-key"] !== config.agentKey) return { status: 401, payload: { error: "Unauthorized" } };

    const decisionId = decodeURIComponent(match[1]);
    const body = parseJsonBody(request.body ?? "");
    if (body.snapshot !== undefined && !config.allowInlineSnapshot) {
      throw new ContractError("Inline snapshots are disabled. The sidecar must load the backend decision API.");
    }
    const decision = body.snapshot === undefined ? await decisionLoader(decisionId, config) : body.snapshot;
    assertDecisionSnapshot(decision);
    if (decision.decision_id !== decisionId) throw new ContractError("URL decision_id does not match snapshot.decision_id.");
    const analysis = await analyze(decision, config.provider, config.modelTimeoutMs);
    return { status: 200, payload: { decision_id: decision.decision_id, event_id: decision.event_id, analysis } };
  } catch (error) {
    return { status: error instanceof ContractError ? 422 : 502, payload: { error: error instanceof Error ? error.message : "Request failed" } };
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body;
}

export function createAgentServer(config: AgentServerConfig): Server {
  return createServer(async (request, response) => {
    const result = await processAgentRequest({ method: request.method, url: request.url, headers: { "x-agent-key": request.headers["x-agent-key"] as string | undefined }, body: await readBody(request) }, config);
    reply(response, result.status, result.payload);
  });
}

function start(): void {
  const port = positiveInt(process.env.AI_AGENT_PORT, 8081);
  const config = configFromEnvironment();
  const providerState = config.provider?.name ?? "deterministic-fallback (Gemini missing or disabled)";
  createAgentServer(config).listen(port, () => console.log(`SCRE AI agent listening on :${port}; provider=${providerState}`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start();
