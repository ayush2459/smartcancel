import { Router } from 'express';

const ACTIONS = ['STOP', 'HOLD', 'CONTINUE', 'RE_MATCH', 'TRANSFER', 'RETURN'];
const EARLY = new Set(['CREATED', 'PICKING', 'PACKED']);
const LATE = new Set(['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY']);
const TERMINAL = new Set(['DELIVERED', 'RETURNED', 'CANCELLED']);

function evaluate(context) {
  const stage = context.parcel_status || context.stage_at_cancel;
  const early = EARLY.has(stage);
  const late = LATE.has(stage);
  const terminal = TERMINAL.has(stage);
  const distance = Math.max(0, Number(context.remaining_km || 0));
  const demand = context.demand_id != null;
  const rematchAllowed = context.eligible_for_rematch === true;
  const routeAvailable = context.route_id != null;
  const intact = context.seal_intact === true && context.damaged !== true;

  const definitions = {
    STOP: {
      feasible: early && !terminal,
      reason: early ? 'Parcel has not entered the delivery network.' : 'Stopping fulfillment is not reliably feasible at this stage.',
      cost: 20, km: 0, carbon: 0, risk: 10, sla: 5,
      score: early ? 90 : 0,
    },
    HOLD: {
      feasible: !terminal && !['OUT_FOR_DELIVERY'].includes(stage),
      reason: 'A temporary hold may prevent further handling while the request is reviewed.',
      cost: 35, km: 0, carbon: 0, risk: 20, sla: 15,
      score: early ? 78 : late ? 58 : 65,
    },
    CONTINUE: {
      feasible: late && !terminal,
      reason: late ? 'The parcel is already in transit; continuing may avoid costly reversal.' : 'Continuation is considered primarily for parcels already in transit.',
      cost: Math.round(distance * 18 + 80), km: distance, carbon: Number((distance * 0.12).toFixed(3)), risk: 15, sla: 10,
      score: late ? 82 : 0,
    },
    RE_MATCH: {
      feasible: early && !terminal && rematchAllowed && demand && intact,
      reason: !early ? 'Rematching is limited to pre-dispatch parcels.' : !rematchAllowed ? 'Product is not eligible for rematching.' : !demand ? 'No matching demand signal exists for this product and destination.' : !intact ? 'Parcel condition does not qualify for rematching.' : 'Eligible product and matching demand signal are available.',
      cost: 60, km: 0, carbon: 0, risk: 25, sla: 20,
      score: early && rematchAllowed && demand && intact ? 72 : 0,
    },
    TRANSFER: {
      feasible: late && !terminal && routeAvailable,
      reason: routeAvailable ? 'A current route exists; transfer requires operational review.' : 'No current route is linked to this parcel.',
      cost: Math.round(distance * 10 + 100), km: distance, carbon: Number((distance * 0.12).toFixed(3)), risk: 45, sla: 40,
      score: late && routeAvailable ? 45 : 0,
    },
    RETURN: {
      feasible: late && !terminal,
      reason: late ? 'Return may be considered for a parcel already in transit; carrier feasibility must be confirmed.' : 'Return is not the default choice before dispatch.',
      cost: Math.round(distance * 22 + 100), km: distance, carbon: Number((distance * 0.12).toFixed(3)), risk: 35, sla: 60,
      score: late ? 48 : 0,
    },
  };

  return ACTIONS.map((action) => {
    const item = definitions[action];
    return {
      action,
      ...item,
      score: item.feasible ? item.score : null,
    };
  });
}

export function createRecoveryRouter(pool) {
  const router = Router();

  router.post('/:eventId/evaluate', async (req, res) => {
    const { eventId } = req.params;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) {
      return res.status(400).json({ error: 'INVALID_EVENT_ID' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(`
        SELECT
          e.event_id, e.order_id, e.parcel_id, e.stage_at_cancel, e.reason,
          d.decision_id, d.status AS decision_status, d.selected_action,
          o.order_number, o.current_status, o.order_value, o.quantity,
          o.destination_pincode, o.product_id,
          p.eligible_for_rematch,
          pa.status AS parcel_status, pa.seal_intact, pa.damaged,
          pa.current_route_id AS route_id,
          r.remaining_km,
          ds.demand_id
        FROM cancellation_events e
        JOIN decisions d ON d.event_id = e.event_id
        JOIN orders o ON o.order_id = e.order_id
        JOIN products p ON p.product_id = o.product_id
        LEFT JOIN parcels pa ON pa.parcel_id = e.parcel_id
        LEFT JOIN routes r ON r.route_id = pa.current_route_id
        LEFT JOIN demand_signals ds
          ON ds.pincode = o.destination_pincode
         AND ds.product_id = o.product_id
        WHERE e.event_id = $1
        FOR UPDATE OF d, o
      `, [eventId]);

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'CANCELLATION_EVENT_NOT_FOUND' });
      }

      const context = result.rows[0];

      if (context.decision_status !== 'PROCESSING') {
        const saved = await client.query(`
          SELECT action, feasible, reason, estimated_cost,
                 estimated_distance_km, estimated_carbon_kg,
                 risk_score, sla_risk_score, score
          FROM recovery_candidates
          WHERE decision_id = $1
          ORDER BY score DESC NULLS LAST, action
        `, [context.decision_id]);

        await client.query('COMMIT');
        return res.json({
          event_id: eventId,
          decision_id: context.decision_id,
          status: context.decision_status,
          selected_action: context.selected_action,
          reused_existing_decision: true,
          candidates: saved.rows,
        });
      }

      const candidates = evaluate(context);
      const feasible = candidates
        .filter((candidate) => candidate.feasible)
        .sort((a, b) => b.score - a.score);

      await client.query(
        'DELETE FROM recovery_candidates WHERE decision_id = $1',
        [context.decision_id]
      );

      for (const candidate of candidates) {
        await client.query(`
          INSERT INTO recovery_candidates (
            decision_id, action, feasible, reason, estimated_cost,
            estimated_distance_km, estimated_carbon_kg,
            risk_score, sla_risk_score, score
          )
          VALUES ($1, $2::recovery_action, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          context.decision_id,
          candidate.action,
          candidate.feasible,
          candidate.reason,
          candidate.cost,
          candidate.km,
          candidate.carbon,
          candidate.risk,
          candidate.sla,
          candidate.score,
        ]);
      }

      const best = feasible[0] || null;
      const needsReview = !best ||
        ['TRANSFER', 'RETURN'].includes(best.action) ||
        context.parcel_status === 'OUT_FOR_DELIVERY';

      const decisionStatus = needsReview ? 'REVIEW_REQUIRED' : 'RECOMMENDED';
      const policyStatus = best ? 'RULES_EVALUATED' : 'NO_FEASIBLE_ACTION';

      await client.query(`
        UPDATE decisions
        SET selected_action = $2::recovery_action,
            status = $3::decision_status,
            recovery_score = $4,
            model_confidence = $5,
            policy_status = $6,
            approval_mode = 'HUMAN_REQUIRED',
            scoring_version = 'rules-v1',
            reasoning_summary = $7,
            input_snapshot = $8::jsonb,
            tool_trace = $9::jsonb
        WHERE decision_id = $1
      `, [
        context.decision_id,
        best?.action ?? null,
        decisionStatus,
        best?.score ?? null,
        best ? 1.0 : 0.0,
        policyStatus,
        best
          ? `${best.action} ranked highest under deterministic rules for parcel stage ${context.parcel_status || context.stage_at_cancel}. Estimates are illustrative; human approval is required.`
          : 'No feasible action was found by the current rules. Manual review is required.',
        JSON.stringify({
          event_id: eventId,
          order_number: context.order_number,
          parcel_status: context.parcel_status || context.stage_at_cancel,
          eligible_for_rematch: context.eligible_for_rematch,
          matching_demand_found: context.demand_id != null,
          route_available: context.route_id != null,
        }),
        JSON.stringify({
          engine: 'deterministic-rules',
          version: 'rules-v1',
          actions_evaluated: ACTIONS,
          estimates_are_calibrated: false,
          execution_performed: false,
        }),
      ]);

      await client.query(`
        INSERT INTO audit_events (
          event_id, decision_id, actor, action, from_state, to_state,
          details, correlation_id
        )
        SELECT e.event_id, $2, 'RECOVERY_ENGINE', 'RECOVERY_EVALUATED',
               'PROCESSING', $3, $4::jsonb, e.idempotency_key
        FROM cancellation_events e
        WHERE e.event_id = $1
      `, [
        eventId,
        context.decision_id,
        decisionStatus,
        JSON.stringify({
          selected_action: best?.action ?? null,
          feasible_actions: feasible.map((candidate) => candidate.action),
          scoring_version: 'rules-v1',
          execution_performed: false,
        }),
      ]);

      await client.query('COMMIT');

      return res.status(200).json({
        event_id: eventId,
        decision_id: context.decision_id,
        status: decisionStatus,
        selected_action: best?.action ?? null,
        approval_mode: 'HUMAN_REQUIRED',
        execution_performed: false,
        scoring_version: 'rules-v1',
        candidates,
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Recovery evaluation failed:', error.message);
      return res.status(500).json({ error: 'RECOVERY_EVALUATION_FAILED' });
    } finally {
      client.release();
    }
  });

  return router;
}
