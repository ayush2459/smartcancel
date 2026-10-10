import assert from "node:assert/strict";
import test from "node:test";
import { analyze, validateModelOutput, type LlmProvider } from "./agent.js";
import { assertDecisionSnapshot, ContractError, type DecisionSnapshot } from "./contracts.js";

const snapshot: DecisionSnapshot = {
  decision_id: "dec-1", event_id: "evt-1", recommended_action: "RE_MATCH", recovery_score: 0.92,
  policy_status: "PASSED", approval_mode: "AUTO",
  candidates: [{ action: "RE_MATCH", feasible: true, cost: 31, risk: "LOW" }, { action: "RETURN", feasible: true, cost: 84, risk: "LOW" }],
};

test("uses a deterministic fallback when no provider is configured", async () => {
  const result = await analyze(snapshot);
  assert.equal(result.recommended_action, "RE_MATCH");
  assert.equal(result.provider, "deterministic-fallback");
  assert.match(result.summary, /RE_MATCH/);
});

test("accepts a Gemini-shaped response without changing deterministic facts", async () => {
  const gemini: LlmProvider = {
    name: "gemini",
    generateJson: async () => ({
      recommended_action: "RE_MATCH",
      evidence_keys: ["recommended_action", "recovery_score", "model_confidence", "made_up_score"],
      requires_human_review: false,
    }),
  };

  const result = await analyze({
    ...snapshot,
    policy_status: "REVIEW_REQUIRED",
    approval_mode: "REVIEW",
  }, gemini);

  assert.equal(result.status, "READY");
  assert.equal(result.provider, "gemini");
  assert.equal(result.recommended_action, "RE_MATCH");
  assert.deepEqual(result.evidence_keys, ["recommended_action", "recovery_score"]);
  assert.equal(result.requires_human_review, true);
  assert.doesNotMatch(JSON.stringify(result), /made_up_score/);
});

test("rejects a model attempt to override the deterministic recommendation", () => {
  const result = validateModelOutput({ recommended_action: "RETURN", evidence_keys: ["candidates"] }, snapshot, "test");
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.recommended_action, "RE_MATCH");
});

test("logs only validation rule and field names when model output is rejected", () => {
  const originalWarn = console.warn;
  const lines: string[] = [];
  console.warn = (message?: unknown) => { lines.push(String(message)); };
  try {
    const result = validateModelOutput({
      recommended_action: "RETURN",
      evidence_keys: ["candidates"],
      private_customer_detail: "must-not-be-logged",
    }, snapshot, "test");
    assert.equal(result.status, "INSUFFICIENT_DATA");
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(lines, [
    "[ai-agent] model output rejected rule=recommended_action_mismatch_or_infeasible fields=recommended_action",
  ]);
  assert.doesNotMatch(lines.join("\n"), /RETURN|must-not-be-logged/);
});

test("renders only backend facts even if the model supplies invented prose", () => {
  const result = validateModelOutput({
    recommended_action: "RE_MATCH", evidence_keys: ["recovery_score", "candidates"],
    requires_human_review: false,
    summary: "Invented claim: 999 tonnes saved", rationale: ["Invented environmental benefit"],
  }, snapshot, "test-provider");
  assert.equal(result.provider, "test-provider");
  assert.doesNotMatch(result.summary, /999|tonnes/i);
});

test("ignores evidence keys for fields absent from the backend snapshot", () => {
  const result = validateModelOutput({
    recommended_action: "RE_MATCH",
    evidence_keys: ["model_confidence", "recovery_score"],
    requires_human_review: false,
  }, snapshot, "test-provider");
  assert.deepEqual(result.evidence_keys, ["recovery_score"]);
});

test("rejects backend snapshots with missing or inconsistent fields", () => {
  assert.throws(() => assertDecisionSnapshot({ ...snapshot, event_id: "" }), ContractError);
  assert.throws(() => assertDecisionSnapshot({ ...snapshot, recovery_score: "0.92" }), ContractError);
  assert.throws(() => assertDecisionSnapshot({ ...snapshot, recommended_action: "STOP" }), ContractError); // STOP not present in candidates
  assert.throws(() => assertDecisionSnapshot({ ...snapshot, policy_status: "UNKNOWN" }), ContractError);
});

test("falls back after provider failure or timeout", async () => {
  const failing: LlmProvider = { name: "failing", generateJson: async () => { throw new Error("network failure"); } };
  const slow: LlmProvider = { name: "slow", generateJson: () => new Promise(() => {}) };
  assert.equal((await analyze(snapshot, failing)).status, "INSUFFICIENT_DATA");
  assert.equal((await analyze(snapshot, slow, 5)).status, "INSUFFICIENT_DATA");
});

test("logs a safe diagnostic when the Gemini request times out", async () => {
  const slowGemini: LlmProvider = { name: "gemini", generateJson: () => new Promise(() => {}) };
  const originalError = console.error;
  const lines: string[] = [];
  console.error = (message?: unknown) => { lines.push(String(message)); };
  try {
    assert.equal((await analyze(snapshot, slowGemini, 5)).status, "INSUFFICIENT_DATA");
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(lines, [
    "[ai-agent] Gemini request failed http_status=unavailable code=timeout",
  ]);
});
