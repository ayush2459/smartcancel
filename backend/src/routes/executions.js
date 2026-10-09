import { Router } from 'express';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createExecutionRouter(pool) {
  const router = Router();

  router.post('/:decisionId/execute', async (req, res, next) => {
    const { decisionId } = req.params;

    if (!UUID_PATTERN.test(decisionId)) {
      return res.status(400).json({
        error: 'INVALID_DECISION_ID',
        message: 'A valid decision UUID is required.'
      });
    }

    const actor =
      typeof req.body?.actor === 'string'
        ? req.body.actor.trim()
        : '';

    if (!actor || actor.length > 100) {
      return res.status(400).json({
        error: 'INVALID_ACTOR',
        message: 'Provide an actor between 1 and 100 characters.'
      });
    }

    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const result = await client.query(
        `SELECT d.decision_id, d.event_id, d.status,
                d.selected_action, o.version AS order_version,
                p.version AS parcel_version
         FROM decisions d
         JOIN cancellation_events ce ON ce.event_id = d.event_id
         JOIN orders o ON o.order_id = ce.order_id
         LEFT JOIN parcels p ON p.parcel_id = ce.parcel_id
         WHERE d.decision_id = $1
         FOR UPDATE OF d`,
        [decisionId]
      );

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(404).json({
          error: 'DECISION_NOT_FOUND'
        });
      }

      const decision = result.rows[0];

      const previous = await client.query(
        `SELECT execution_id, action, status, actor,
                started_at, completed_at
         FROM executions
         WHERE decision_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [decisionId]
      );

      if (previous.rowCount > 0) {
        await client.query('COMMIT');
        transactionOpen = false;

        return res.json({
          decision_id: decisionId,
          mode: 'simulation',
          reused_existing_execution: true,
          real_side_effects: false,
          execution: previous.rows[0]
        });
      }

      if (decision.status !== 'APPROVED') {
        await client.query('ROLLBACK');
        transactionOpen = false;

        return res.status(409).json({
          error: 'DECISION_NOT_APPROVED',
          current_status: decision.status,
          message: 'A decision must be approved before execution.'
        });
      }

      if (!decision.selected_action) {
        await client.query('ROLLBACK');
        transactionOpen = false;

        return res.status(409).json({
          error: 'NO_SELECTED_ACTION'
        });
      }

      const candidate = await client.query(
        `SELECT candidate_id, feasible
         FROM recovery_candidates
         WHERE decision_id = $1
           AND action = $2
           AND feasible = TRUE
         ORDER BY created_at DESC
         LIMIT 1`,
        [decisionId, decision.selected_action]
      );

      if (candidate.rowCount === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;

        return res.status(409).json({
          error: 'SELECTED_ACTION_NOT_FEASIBLE',
          selected_action: decision.selected_action
        });
      }

      const version =
        decision.parcel_version ?? decision.order_version;

      const inserted = await client.query(
        `INSERT INTO executions
          (decision_id, action, status, actor,
           expected_version, actual_version,
           started_at, completed_at)
         VALUES ($1, $2, 'SUCCEEDED', $3, $4, $4, NOW(), NOW())
         RETURNING execution_id, decision_id, action, status,
                   actor, expected_version, actual_version,
                   started_at, completed_at, created_at`,
        [
          decisionId,
          decision.selected_action,
          `simulation:${actor}`,
          version
        ]
      );

      const execution = inserted.rows[0];

      await client.query(
        `INSERT INTO audit_events
          (event_id, decision_id, execution_id, actor, action,
           from_state, to_state, details, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [
          decision.event_id,
          decisionId,
          execution.execution_id,
          `simulation:${actor}`,
          'SIMULATED_EXECUTION_SUCCEEDED',
          'APPROVED',
          'SIMULATED_SUCCEEDED',
          JSON.stringify({
            mode: 'simulation',
            selected_action: decision.selected_action,
            real_side_effects: false,
            order_or_parcel_modified: false,
            candidate_id: candidate.rows[0].candidate_id,
            version_checked: version
          }),
          execution.execution_id
        ]
      );

      await client.query('COMMIT');
      transactionOpen = false;

      return res.status(201).json({
        decision_id: decisionId,
        decision_status: 'APPROVED',
        mode: 'simulation',
        real_side_effects: false,
        order_or_parcel_modified: false,
        execution
      });
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK').catch(() => {});
      }
      return next(error);
    } finally {
      client.release();
    }
  });

  router.get('/:decisionId', async (req, res, next) => {
    const { decisionId } = req.params;

    if (!UUID_PATTERN.test(decisionId)) {
      return res.status(400).json({
        error: 'INVALID_DECISION_ID'
      });
    }

    try {
      const decision = await pool.query(
        `SELECT decision_id, status, selected_action
         FROM decisions
         WHERE decision_id = $1`,
        [decisionId]
      );

      if (decision.rowCount === 0) {
        return res.status(404).json({
          error: 'DECISION_NOT_FOUND'
        });
      }

      const executions = await pool.query(
        `SELECT execution_id, action, status, actor,
                expected_version, actual_version,
                error_code, error_message,
                started_at, completed_at, created_at
         FROM executions
         WHERE decision_id = $1
         ORDER BY created_at DESC`,
        [decisionId]
      );

      const audit = await pool.query(
        `SELECT audit_id, action, actor, from_state, to_state,
                details, correlation_id, created_at
         FROM audit_events
         WHERE decision_id = $1
           AND execution_id IS NOT NULL
         ORDER BY created_at DESC`,
        [decisionId]
      );

      return res.json({
        decision: decision.rows[0],
        executions: executions.rows,
        execution_audit: audit.rows,
        mode: 'simulation'
      });
    } catch (error) {
      return next(error);
    }
  });
  return router;
}

