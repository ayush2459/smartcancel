import {
  type DecisionSnapshot,
  type GroundedAnalysis,
  isRecoveryAction,
} from "./contracts.js";

export const AGENT_VERSION = "1.0.0";

export interface LlmProvider {
  readonly name: string;
  generateJson(systemInstruction: string, input: unknown): Promise<unknown>;
}

const SYSTEM_INSTRUCTION = `You are SCRE Explain, a read-only operations assistant for a cancellation recovery engine.
Use only the supplied decision snapshot. The deterministic engine is the authority for feasibility,
score, policy, and selected action. Never invent operational facts, never choose an action outside
the feasible candidates, never request execution, and never mention customer PII.
Return JSON only with summary, rationale, caveats, evidence_keys, and requires_human_review.
evidence_keys can only contain fields present in the snapshot: recommended_action, recovery_score,
policy_status, approval_mode, candidates, model_confidence, decision_id, event_id.`;

export function fallback(snapshot: DecisionSnapshot, status: GroundedAnalysis["status"] = "READY"): GroundedAnalysis {
  const selected = snapshot.candidates.find((item) => item.action === snapshot.recommended_action);
  const rationale = [
    `The deterministic engine selected ${snapshot.recommended_action}.`,
    `Recovery score: ${snapshot.recovery_score.toFixed(2)}; policy status: ${snapshot.policy_status}.`,
  ];
  if (selected?.risk) rationale.push(`Selected candidate risk: ${selected.risk}.`);
  if (selected?.reasons?.length) rationale.push(...selected.reasons.slice(0, 2));

  return {
    status,
    recommended_action: snapshot.recommended_action,
    summary: `Recommendation: ${snapshot.recommended_action}. This explanation is based on the deterministic decision snapshot.`,
    rationale,
    caveats: [
      "AI explanation does not authorize execution.",
      ...(snapshot.policy_status !== "PASSED" ? ["Policy has not passed; do not execute automatically."] : []),
    ],
    evidence_keys: ["recommended_action", "recovery_score", "policy_status", "approval_mode", "candidates"],
    requires_human_review: snapshot.approval_mode === "REVIEW" || snapshot.policy_status !== "PASSED",
    agent_version: AGENT_VERSION,
    provider: "deterministic-fallback",
  };
}

function asStringList(value: unknown, allowed: readonly string[]): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && allowed.includes(item)).slice(0, 8)
    : [];
}

/**
 * The model can select evidence, but it cannot supply factual prose. We always render the
 * visible explanation from the validated backend snapshot. This makes a hallucinated score,
 * status, action, or environmental saving impossible to return from this component.
 */
export function validateModelOutput(raw: unknown, snapshot: DecisionSnapshot, provider: string): GroundedAnalysis {
  if (!raw || typeof raw !== "object") return fallback(snapshot, "INSUFFICIENT_DATA");
  const value = raw as Record<string, unknown>;
  const feasible = new Set(snapshot.candidates.filter((candidate) => candidate.feasible).map((candidate) => candidate.action));
  const action = value.recommended_action;
  const allowedEvidence = ["recommended_action", "recovery_score", "policy_status", "approval_mode", "candidates", "model_confidence", "decision_id", "event_id"];

  // The agent may explain only the backend-selected action; it cannot re-rank the backend result.
  if (!isRecoveryAction(action) || action !== snapshot.recommended_action || !feasible.has(action)) {
    return fallback(snapshot, "INSUFFICIENT_DATA");
  }
  const evidence = asStringList(
    value.evidence_keys,
    allowedEvidence.filter((key) => Object.hasOwn(snapshot, key)),
  );
  if (evidence.length === 0) return fallback(snapshot, "INSUFFICIENT_DATA");
  return { ...fallback(snapshot), evidence_keys: evidence, provider };
}

export async function analyze(snapshot: DecisionSnapshot, provider?: LlmProvider, timeoutMs = 10_000): Promise<GroundedAnalysis> {
  if (!provider) return fallback(snapshot);
  try {
    const raw = await Promise.race([
      provider.generateJson(SYSTEM_INSTRUCTION, snapshot),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Model timed out.")), timeoutMs)),
    ]);
    return validateModelOutput(raw, snapshot, provider.name);
  } catch {
    // An LLM outage must never block deterministic cancellation recovery.
    return fallback(snapshot, "INSUFFICIENT_DATA");
  }
}
