import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECOVERY_ACTIONS = new Set(['STOP', 'HOLD', 'CONTINUE', 'RE_MATCH', 'TRANSFER', 'RETURN']);
const ANALYSIS_EVIDENCE_KEYS = new Set([
  'recommended_action',
  'recovery_score',
  'policy_status',
  'approval_mode',
  'candidates',
  'model_confidence',
  'decision_id',
  'event_id',
]);

export function isServiceAuthorizationValid(authorization, expectedToken) {
  if (typeof authorization !== 'string' || !expectedToken) return false;

  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match) return false;

  const suppliedDigest = createHash('sha256').update(match[1]).digest();
  const expectedDigest = createHash('sha256').update(expectedToken).digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}

export function isValidAgentAnalysis(payload, decision) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (payload.decision_id !== decision.decision_id || payload.event_id !== decision.event_id) return false;

  const analysis = payload.analysis;
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) return false;
  if (!['READY', 'INSUFFICIENT_DATA'].includes(analysis.status)) return false;
  if (!RECOVERY_ACTIONS.has(analysis.recommended_action) ||
      analysis.recommended_action !== decision.selected_action) return false;
  if (typeof analysis.summary !== 'string' || !analysis.summary.trim()) return false;
  if (!Array.isArray(analysis.rationale) ||
      !analysis.rationale.every((item) => typeof item === 'string')) return false;
  if (!Array.isArray(analysis.caveats) ||
      !analysis.caveats.every((item) => typeof item === 'string')) return false;
  if (!Array.isArray(analysis.evidence_keys) ||
      analysis.evidence_keys.length === 0 ||
      !analysis.evidence_keys.every((key) => ANALYSIS_EVIDENCE_KEYS.has(key))) return false;
  if (typeof analysis.requires_human_review !== 'boolean') return false;
  if (typeof analysis.agent_version !== 'string' || !analysis.agent_version.trim()) return false;
  if (typeof analysis.provider !== 'string' || !analysis.provider.trim()) return false;

  return true;
}

// Risk mapping from numeric scores to the LOW/MEDIUM/HIGH strings the agent contract expects.
function numericToRiskLabel(riskScore) {
  if (riskScore == null) return undefined;
  if (riskScore <= 20) return 'LOW';
  if (riskScore <= 40) return 'MEDIUM';
  return 'HIGH';
}

// Map the backend's free-text policy_status values to the exact enum the agent contract requires.
function mapPolicyStatus(policyStatus) {
  if (policyStatus === 'HUMAN_APPROVED' || policyStatus === 'RULES_EVALUATED') return 'PASSED';
  if (policyStatus === 'HUMAN_REQUIRED') return 'REVIEW_REQUIRED';
  if (policyStatus === 'NO_FEASIBLE_ACTION') return 'REJECTED';
  return 'PENDING';
}

// Map the backend's approval_mode free-text to the agent contract enum (AUTO / REVIEW / FALLBACK).
function mapApprovalMode(approvalMode) {
  if (approvalMode === 'HUMAN_APPROVED' || approvalMode === 'AUTO') return 'AUTO';
  if (approvalMode === 'HUMAN_REQUIRED' || approvalMode === 'REVIEW') return 'REVIEW';
  return 'FALLBACK';
}

export function createDecisionRouter(pool) {
  const router = Router();

  /**
   * GET /api/v1/decisions/:decisionId
   *
   * Read-only DecisionSnapshot endpoint consumed by the AI agent sidecar.
   * Returns only the fields the agent contract requires. Does NOT expose PII,
   * credentials, or internal implementation details.
   *
   * The agent never calls approval, execution, or write endpoints; it only
   * calls this endpoint to fetch a snapshot, then returns a grounded analysis.
   */
  router.get('/:decisionId', async (req, res) => {
    const { decisionId } = req.params;
    const serviceToken = process.env.SCRE_SERVICE_TOKEN || process.env.AI_AGENT_SHARED_SECRET;

    if (!serviceToken) {
      return res.status(503).json({ error: 'SERVICE_AUTH_NOT_CONFIGURED' });
    }
    if (!isServiceAuthorizationValid(req.get('authorization'), serviceToken)) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    if (!UUID_PATTERN.test(decisionId)) {
      return res.status(400).json({ error: 'INVALID_DECISION_ID' });
    }

    try {
      const decisionResult = await pool.query(
        `SELECT
           d.decision_id,
           d.event_id,
           d.selected_action AS recommended_action,
           d.recovery_score,
           d.model_confidence,
           d.policy_status,
           d.approval_mode,
           d.created_at,
           ce.idempotency_key AS correlation_id,
           o.order_number AS order_id
         FROM decisions d
         JOIN cancellation_events ce ON ce.event_id = d.event_id
         JOIN orders o ON o.order_id = ce.order_id
         WHERE d.decision_id = $1`,
        [decisionId]
      );

      if (decisionResult.rowCount === 0) {
        return res.status(404).json({ error: 'DECISION_NOT_FOUND' });
      }

      const d = decisionResult.rows[0];

      // A decision with no selected_action cannot yet produce a valid agent snapshot.
      if (!d.recommended_action) {
        return res.status(409).json({
          error: 'DECISION_NOT_READY',
          message: 'The decision has not yet produced a recommended action.',
        });
      }

      const candidateResult = await pool.query(
        `SELECT action, feasible, estimated_cost AS cost,
                estimated_carbon_kg AS carbon_kg,
                estimated_distance_km AS distance_km,
                risk_score, reason
         FROM recovery_candidates
         WHERE decision_id = $1
         ORDER BY score DESC NULLS LAST, action`,
        [decisionId]
      );

      // Map candidates to the agent contract schema.
      const candidates = candidateResult.rows.map((c) => ({
        action: c.action,
        feasible: c.feasible,
        ...(c.cost != null ? { cost: Number(c.cost) } : {}),
        ...(c.carbon_kg != null ? { carbon_kg: Number(c.carbon_kg) } : {}),
        ...(c.distance_km != null ? { distance_km: Number(c.distance_km) } : {}),
        ...(c.risk_score != null ? { risk: numericToRiskLabel(Number(c.risk_score)) } : {}),
        ...(c.reason ? { reasons: [c.reason] } : {}),
      }));

      // Guard: recommended_action must be present as a feasible candidate.
      const feasibleSet = new Set(candidates.filter((c) => c.feasible).map((c) => c.action));
      if (!feasibleSet.has(d.recommended_action)) {
        return res.status(409).json({
          error: 'RECOMMENDED_ACTION_NOT_FEASIBLE',
          message: 'The recommended action is not listed as feasible. Trigger a recovery re-evaluation.',
        });
      }

      return res.json({
        decision_id: d.decision_id,
        event_id: d.event_id,
        order_id: d.order_id,
        recommended_action: d.recommended_action,
        recovery_score: d.recovery_score != null ? Number(d.recovery_score) : 0,
        model_confidence: d.model_confidence != null ? Number(d.model_confidence) : null,
        policy_status: mapPolicyStatus(d.policy_status),
        approval_mode: mapApprovalMode(d.approval_mode),
        candidates,
        generated_at: d.created_at,
        correlation_id: d.correlation_id,
      });
    } catch (error) {
      console.error('Decision snapshot failed:', error.message);
      return res.status(500).json({ error: 'DECISION_SNAPSHOT_FAILED' });
    }
  });

  /**
   * POST /api/v1/decisions/:decisionId/ai-analyze
   *
   * Backend-triggered AI analysis. The backend calls this after a recovery
   * evaluation has produced a recommended_action. The handler:
   *   1. Verifies the decision is in RECOMMENDED or REVIEW_REQUIRED state.
   *   2. Forwards to the AI agent sidecar (if configured via AI_AGENT_URL).
   *   3. Validates the sidecar response at a high level.
   *   4. Records the analysis in the audit_events table.
   *   5. Returns the analysis (or deterministic fallback) to the caller.
   *
   * AI failure is NEVER fatal. If the sidecar is unreachable, times out,
   * or returns an error, a deterministic fallback is returned and recorded.
   */
  router.post('/:decisionId/ai-analyze', async (req, res) => {
    const { decisionId } = req.params;

    if (!UUID_PATTERN.test(decisionId)) {
      return res.status(400).json({ error: 'INVALID_DECISION_ID' });
    }

    const agentUrl = process.env.AI_AGENT_URL;
    const agentKey = process.env.AI_AGENT_SHARED_SECRET;
    const agentTimeoutMs = Number(process.env.AI_AGENT_TIMEOUT_MS) || 12000;

    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT d.decision_id, d.event_id, d.status, d.selected_action,
                d.policy_status, d.approval_mode
         FROM decisions d
         WHERE d.decision_id = $1`,
        [decisionId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'DECISION_NOT_FOUND' });
      }

      const decision = result.rows[0];

      if (!['RECOMMENDED', 'REVIEW_REQUIRED'].includes(decision.status)) {
        return res.status(409).json({
          error: 'DECISION_NOT_READY_FOR_ANALYSIS',
          current_status: decision.status,
          message: 'AI analysis is only available for decisions in RECOMMENDED or REVIEW_REQUIRED state.',
        });
      }

      let analysis = null;
      let agentProvider = 'deterministic-fallback';
      let agentError = null;

      if (agentUrl) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), agentTimeoutMs);
          const headers = {
            'content-type': 'application/json',
            ...(agentKey ? { 'x-agent-key': agentKey } : {}),
          };
          const agentResponse = await fetch(
            `${agentUrl}/v1/decisions/${encodeURIComponent(decisionId)}/analyze`,
            { method: 'POST', headers, body: JSON.stringify({}), signal: controller.signal }
          );
          clearTimeout(timer);

          if (agentResponse.ok) {
            const payload = await agentResponse.json();
            if (isValidAgentAnalysis(payload, decision)) {
              analysis = payload.analysis;
              agentProvider = payload.analysis.provider ?? 'gemini';
            } else {
              agentError = 'Agent returned an incompatible or invalid analysis.';
            }
          } else {
            agentError = `Agent returned HTTP ${agentResponse.status}.`;
          }
        } catch (err) {
          agentError = err.name === 'AbortError'
            ? 'Agent timed out.'
            : `Agent unreachable: ${err.message}`;
        }
      } else {
        agentError = 'AI_AGENT_URL is not configured; using deterministic fallback.';
      }

      // Deterministic fallback: always safe, always consistent with the backend decision.
      if (!analysis) {
        analysis = {
          status: 'INSUFFICIENT_DATA',
          recommended_action: decision.selected_action,
          summary: `Recommendation: ${decision.selected_action}. AI analysis was unavailable (${agentError ?? 'no provider'}).`,
          rationale: [`The deterministic engine selected ${decision.selected_action}.`],
          caveats: ['AI explanation does not authorize execution.', agentError ?? 'No AI provider configured.'],
          evidence_keys: ['recommended_action', 'policy_status'],
          requires_human_review: ['REVIEW_REQUIRED', 'REVIEW'].includes(decision.status) || decision.status !== 'RECOMMENDED',
          agent_version: 'backend-fallback',
          provider: 'deterministic-fallback',
        };
      }

      // Persist the analysis in the audit log — never block the response on audit failures.
      client.query(
        `INSERT INTO audit_events
           (event_id, decision_id, actor, action, from_state, to_state, details, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          decision.event_id,
          decisionId,
          `ai-agent:${agentProvider}`,
          'AI_ANALYSIS_COMPLETED',
          decision.status,
          decision.status,
          JSON.stringify({
            agent_provider: agentProvider,
            analysis_status: analysis.status,
            requires_human_review: analysis.requires_human_review,
            agent_error: agentError ?? null,
          }),
          decisionId,
        ]
      ).catch((err) => console.error('AI analysis audit record failed:', err.message));

      return res.json({
        decision_id: decisionId,
        event_id: decision.event_id,
        analysis,
        agent_provider: agentProvider,
        agent_error: agentError ?? null,
      });
    } catch (error) {
      console.error('AI analysis request failed:', error.message);
      return res.status(500).json({ error: 'AI_ANALYSIS_FAILED' });
    } finally {
      client.release();
    }
  });

  return router;
}
