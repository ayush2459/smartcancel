import { Router } from 'express';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createReportsRouter(pool) {
  const router = Router();

  // Aggregate operational metrics. Impact is included only when recorded.
  router.get('/overview', async (_req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(DISTINCT e.event_id)::int AS total_cancellations,
          COUNT(DISTINCT e.event_id) FILTER (
            WHERE e.status = 'RECEIVED'
          )::int AS received_events,
          COUNT(DISTINCT d.decision_id) FILTER (
            WHERE d.status = 'PROCESSING'
          )::int AS processing_decisions,
          COUNT(DISTINCT d.decision_id) FILTER (
            WHERE d.status = 'RECOMMENDED'
          )::int AS recommended_decisions,
          COUNT(DISTINCT d.decision_id) FILTER (
            WHERE d.status = 'REVIEW_REQUIRED'
          )::int AS decisions_requiring_review,
          COUNT(DISTINCT i.impact_id)::int AS recorded_impact_records,
          COALESCE(SUM(i.cost_saved), 0) AS recorded_cost_saved,
          COALESCE(SUM(i.distance_avoided_km), 0)
            AS recorded_distance_avoided_km,
          COALESCE(SUM(i.carbon_avoided_kg), 0)
            AS recorded_carbon_avoided_kg
        FROM cancellation_events e
        LEFT JOIN decisions d ON d.event_id = e.event_id
        LEFT JOIN impact_ledger i ON i.decision_id = d.decision_id
      `);

      res.json({
        generated_at: new Date().toISOString(),
        metrics: result.rows[0],
        impact_note: 'Impact totals include recorded ledger entries only; they are not independently verified savings.',
      });
    } catch (error) {
      console.error('Reports overview failed:', error.message);
      res.status(500).json({ error: 'REPORTS_OVERVIEW_FAILED' });
    }
  });

  // Paginated cancellation history.
  router.get('/cancellations', async (req, res) => {
    const limit = Number.parseInt(req.query.limit ?? '20', 10);
    const offset = Number.parseInt(req.query.offset ?? '0', 10);

    if (
      !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(offset) || offset < 0
    ) {
      return res.status(400).json({
        error: 'INVALID_PAGINATION',
        message: 'limit must be 1-100 and offset must be zero or greater.',
      });
    }

    try {
      const result = await pool.query(`
        SELECT
          e.event_id,
          e.idempotency_key,
          e.source,
          e.reason,
          e.status AS event_status,
          e.stage_at_cancel,
          e.occurred_at,
          e.received_at,
          o.order_number,
          o.current_status AS order_status,
          o.order_value,
          o.destination_pincode,
          p.parcel_number,
          p.status AS parcel_status,
          d.decision_id,
          d.status AS decision_status,
          d.selected_action,
          d.recovery_score,
          d.scoring_version
        FROM cancellation_events e
        JOIN orders o ON o.order_id = e.order_id
        LEFT JOIN parcels p ON p.parcel_id = e.parcel_id
        LEFT JOIN decisions d ON d.event_id = e.event_id
        ORDER BY e.received_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      const countResult = await pool.query(
        'SELECT COUNT(*)::int AS total FROM cancellation_events'
      );

      res.json({
        pagination: {
          limit,
          offset,
          total: countResult.rows[0].total,
        },
        cancellations: result.rows,
      });
    } catch (error) {
      console.error('Cancellation report failed:', error.message);
      res.status(500).json({ error: 'CANCELLATION_REPORT_FAILED' });
    }
  });

  // One decision with its candidate rankings and recorded impact.
  router.get('/decisions/:decisionId', async (req, res) => {
    const { decisionId } = req.params;

    if (!UUID_PATTERN.test(decisionId)) {
      return res.status(400).json({ error: 'INVALID_DECISION_ID' });
    }

    try {
      const decisionResult = await pool.query(`
        SELECT
          d.decision_id,
          d.event_id,
          d.selected_action,
          d.status,
          d.recovery_score,
          d.model_confidence,
          d.policy_status,
          d.approval_mode,
          d.scoring_version,
          d.reasoning_summary,
          d.input_snapshot,
          d.tool_trace,
          d.created_at,
          d.updated_at,
          e.idempotency_key,
          e.reason,
          e.source,
          e.stage_at_cancel,
          o.order_number,
          o.current_status AS order_status
        FROM decisions d
        JOIN cancellation_events e ON e.event_id = d.event_id
        JOIN orders o ON o.order_id = e.order_id
        WHERE d.decision_id = $1
      `, [decisionId]);

      if (decisionResult.rowCount === 0) {
        return res.status(404).json({ error: 'DECISION_NOT_FOUND' });
      }

      const [candidateResult, impactResult] = await Promise.all([
        pool.query(`
          SELECT
            candidate_id, action, feasible, reason,
            estimated_cost, estimated_distance_km,
            estimated_carbon_kg, risk_score,
            sla_risk_score, score, created_at
          FROM recovery_candidates
          WHERE decision_id = $1
          ORDER BY score DESC NULLS LAST, action
        `, [decisionId]),
        pool.query(`
          SELECT
            baseline_cost, optimized_cost, cost_saved,
            baseline_distance_km, optimized_distance_km,
            distance_avoided_km, baseline_carbon_kg,
            optimized_carbon_kg, carbon_avoided_kg,
            baseline_handling_events, optimized_handling_events,
            created_at
          FROM impact_ledger
          WHERE decision_id = $1
        `, [decisionId]),
      ]);

      res.json({
        decision: decisionResult.rows[0],
        candidates: candidateResult.rows,
        impact: impactResult.rows[0] ?? null,
      });
    } catch (error) {
      console.error('Decision report failed:', error.message);
      res.status(500).json({ error: 'DECISION_REPORT_FAILED' });
    }
  });

  return router;
}
