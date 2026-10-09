import { Router } from 'express';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createApprovalRouter(pool) {
  const router = Router();

  async function processApproval(req, res, next, approved) {
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

    const reason =
      typeof req.body?.reason === 'string'
        ? req.body.reason.trim()
        : '';

    if (!actor || actor.length > 100) {
      return res.status(400).json({
        error: 'INVALID_ACTOR',
        message: 'Provide an actor between 1 and 100 characters.'
      });
    }

    if (reason.length > 1000) {
      return res.status(400).json({
        error: 'INVALID_REASON',
        message: 'Reason must not exceed 1000 characters.'
      });
    }

    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const result = await client.query(
        `SELECT decision_id, event_id, status, selected_action,
                approval_mode
         FROM decisions
         WHERE decision_id = $1
         FOR UPDATE`,
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

      if (approved && decision.status === 'APPROVED') {
        await client.query('COMMIT');
        transactionOpen = false;
        return res.json({
          decision_id: decisionId,
          status: 'APPROVED',
          reused_existing_decision: true
        });
      }

      if (!approved && decision.status === 'REJECTED') {
        await client.query('COMMIT');
        transactionOpen = false;
        return res.json({
          decision_id: decisionId,
          status: 'REJECTED',
          reused_existing_decision: true
        });
      }

      if (decision.status !== 'RECOMMENDED' &&
          decision.status !== 'REVIEW_REQUIRED') {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(409).json({
          error: 'DECISION_NOT_AWAITING_APPROVAL',
          current_status: decision.status,
          message: 'Only recommended or review-required decisions can be approved or rejected.'
        });
      }

      if (approved && !decision.selected_action) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(409).json({
          error: 'NO_SELECTED_ACTION',
          message: 'The decision has no selected recovery action.'
        });
      }

      const nextStatus = approved ? 'APPROVED' : 'REJECTED';
      const approvalMode = approved
        ? 'HUMAN_APPROVED'
        : 'HUMAN_REJECTED';

      await client.query(
        `UPDATE decisions
         SET status = $2,
             approval_mode = $3,
             policy_status = $4,
             reasoning_summary = COALESCE(reasoning_summary, '') ||
               $5,
             updated_at = NOW()
         WHERE decision_id = $1`,
        [
          decisionId,
          nextStatus,
          approvalMode,
          approvalMode,
          reason
            ? ` Human ${approved ? 'approval' : 'rejection'} by ${actor}: ${reason}`
            : ` Human ${approved ? 'approval' : 'rejection'} by ${actor}.`
        ]
      );

      await client.query(
        `INSERT INTO audit_events
          (event_id, decision_id, actor, action, from_state,
           to_state, details, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          decision.event_id,
          decisionId,
          actor,
          approved ? 'DECISION_APPROVED' : 'DECISION_REJECTED',
          decision.status,
          nextStatus,
          JSON.stringify({
            selected_action: decision.selected_action,
            reason: reason || null,
            execution_performed: false
          }),
          decisionId
        ]
      );

      await client.query('COMMIT');
      transactionOpen = false;

      return res.json({
        decision_id: decisionId,
        status: nextStatus,
        selected_action: decision.selected_action,
        approval_mode: approvalMode,
        execution_performed: false
      });
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK').catch(() => {});
      }
      return next(error);
    } finally {
      client.release();
    }
  }

  router.post('/:decisionId/approve', (req, res, next) =>
    processApproval(req, res, next, true)
  );

  router.post('/:decisionId/reject', (req, res, next) =>
    processApproval(req, res, next, false)
  );

  return router;
}
