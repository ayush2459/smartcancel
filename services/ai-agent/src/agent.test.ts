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

test("rejects a model attempt to override the deterministic recommendation", () => {
  const result = validateModelOutput({ recommended_action: "RETURN", evidence_keys: ["candidates"] }, snapshot, "test");
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.recommended_action, "RE_MATCH");
});

test("renders only backend facts even if the model supplies invented prose", () => {
  const result = validateModelOutput({
    recommended_action: "RE_MATCH", evidence_keys: ["recovery_score", "candidates"],
    summary: "Invented claim: 999 tonnes saved", rationale: ["Invented environmental benefit"],
  }, snapshot, "test-provider");
  assert.equal(result.provider, "test-provider");
  assert.doesNotMatch(result.summary, /999|tonnes/i);
});

test("ignores evidence keys for fields absent from the backend snapshot", () => {
  const result = validateModelOutput({
    recommended_action: "RE_MATCH",
    evidence_keys: ["model_confidence", "recovery_score"],
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
