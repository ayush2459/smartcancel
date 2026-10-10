import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createAgentServer, type AgentServerConfig } from "./server.js";

const validSnapshot = {
  decision_id: "dec-1", event_id: "evt-1", recommended_action: "RE_MATCH", recovery_score: 0.92,
  policy_status: "PASSED", approval_mode: "AUTO",
  candidates: [{ action: "RE_MATCH", feasible: true }],
};

async function withServer(config: Partial<AgentServerConfig>, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createAgentServer({ apiBaseUrl: "http://127.0.0.1:9/api/v1", backendTimeoutMs: 50, modelTimeoutMs: 50, allowInlineSnapshot: true, agentKey: "test-agent-key", ...config });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = (server.address() as AddressInfo).port;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("returns a grounded fallback for a valid inline snapshot in test mode", async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/decisions/dec-1/analyze`, { method: "POST", headers: { "content-type": "application/json", "x-agent-key": "test-agent-key" }, body: JSON.stringify({ snapshot: validSnapshot }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { analysis: { recommended_action: string } }).analysis.recommended_action, "RE_MATCH");
  });
});

test("rejects malformed JSON, schema mismatches, disabled snapshots, and wrong paths", async () => {
  await withServer({ allowInlineSnapshot: false }, async (baseUrl) => {
    const headers = { "content-type": "application/json", "x-agent-key": "test-agent-key" };
    const disabled = await fetch(`${baseUrl}/v1/decisions/dec-1/analyze`, { method: "POST", headers, body: JSON.stringify({ snapshot: validSnapshot }) });
    assert.equal(disabled.status, 422);
    const malformed = await fetch(`${baseUrl}/v1/decisions/dec-1/analyze`, { method: "POST", headers, body: "{" });
    assert.equal(malformed.status, 422);
    const missing = await fetch(`${baseUrl}/v1/decisions/dec-1/analyze`, { method: "POST", headers, body: JSON.stringify({ snapshot: { ...validSnapshot, event_id: "" } }) });
    assert.equal(missing.status, 422);
    const unauthorized = await fetch(`${baseUrl}/v1/decisions/dec-1/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snapshot: validSnapshot }) });
    assert.equal(unauthorized.status, 401);
    assert.equal((await fetch(`${baseUrl}/unknown`)).status, 404);
  });
});

test("reports an unavailable backend without claiming integration success", async () => {
  await withServer({ allowInlineSnapshot: false }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/decisions/dec-1/analyze`, { method: "POST", headers: { "x-agent-key": "test-agent-key" } });
    assert.equal(response.status, 502);
  });
});

test("fails closed when agent authentication is not configured", async () => {
  await withServer({ agentKey: undefined }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/decisions/dec-1/analyze`, { method: "POST" });
    assert.equal(response.status, 503);
  });
});
