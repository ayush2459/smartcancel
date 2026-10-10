export const ACTIONS = ["STOP", "HOLD", "CONTINUE", "RE_MATCH", "TRANSFER", "RETURN"] as const;
export type RecoveryAction = (typeof ACTIONS)[number];

export type Candidate = {
  action: RecoveryAction;
  feasible: boolean;
  cost?: number;
  carbon_kg?: number;
  distance_km?: number;
  risk?: "LOW" | "MEDIUM" | "HIGH";
  reasons?: string[];
};

/** The minimum read-only snapshot the deterministic backend must expose to AI. */
export type DecisionSnapshot = {
  decision_id: string;
  event_id: string;
  order_id?: string;
  recommended_action: RecoveryAction;
  recovery_score: number;
  model_confidence?: number;
  policy_status: "PASSED" | "REVIEW_REQUIRED" | "REJECTED" | "PENDING";
  approval_mode: "AUTO" | "REVIEW" | "FALLBACK";
  candidates: Candidate[];
  generated_at?: string;
  correlation_id?: string;
};

export type GroundedAnalysis = {
  status: "READY" | "INSUFFICIENT_DATA";
  recommended_action: RecoveryAction;
  summary: string;
  rationale: string[];
  caveats: string[];
  evidence_keys: string[];
  requires_human_review: boolean;
  agent_version: string;
  provider: string;
};

export class ContractError extends Error {}

export function isRecoveryAction(value: unknown): value is RecoveryAction {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

export function assertDecisionSnapshot(value: unknown): asserts value is DecisionSnapshot {
  const snapshot = value as Partial<DecisionSnapshot>;
  if (!snapshot || typeof snapshot !== "object") {
    throw new ContractError("Decision response must be an object.");
  }
  if (typeof snapshot.decision_id !== "string" || !snapshot.decision_id.trim()) {
    throw new ContractError("Decision response must contain a non-empty decision_id.");
  }
  if (typeof snapshot.event_id !== "string" || !snapshot.event_id.trim()) {
    throw new ContractError("Decision response must contain a non-empty event_id.");
  }
  if (!isRecoveryAction(snapshot.recommended_action)) {
    throw new ContractError("Decision response has an unsupported recommended_action.");
  }
  if (typeof snapshot.recovery_score !== "number" || !Number.isFinite(snapshot.recovery_score)) {
    throw new ContractError("Decision response must contain a finite numeric recovery_score.");
  }
  if (!["PASSED", "REVIEW_REQUIRED", "REJECTED", "PENDING"].includes(snapshot.policy_status ?? "")) {
    throw new ContractError("Decision response has an unsupported policy_status.");
  }
  if (!["AUTO", "REVIEW", "FALLBACK"].includes(snapshot.approval_mode ?? "")) {
    throw new ContractError("Decision response has an unsupported approval_mode.");
  }
  if (!Array.isArray(snapshot.candidates) || snapshot.candidates.length === 0) {
    throw new ContractError("Decision response must contain at least one candidate.");
  }
  for (const candidate of snapshot.candidates) {
    if (!candidate || !isRecoveryAction(candidate.action) || typeof candidate.feasible !== "boolean") {
      throw new ContractError("Every candidate needs action and feasible fields.");
    }
  }
  if (!snapshot.candidates.some((candidate) => candidate.action === snapshot.recommended_action && candidate.feasible)) {
    throw new ContractError("recommended_action must match a feasible candidate.");
  }
}
