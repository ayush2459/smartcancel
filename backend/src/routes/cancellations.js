import { Router } from 'express';

const SOURCES = new Set([
  'CUSTOMER_APP',
  'CUSTOMER_SUPPORT',
  'SYSTEM',
  'OPERATOR',
]);

const TERMINAL_ORDER_STATES = new Set([
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
]);

function sameRequest(existing, requested) {
  return (
    existing.order_number === requested.orderNumber &&
    existing.reason === requested.reason &&
    existing.source === requested.source &&
    new Date(existing.occurred_at).getTime() ===
      new Date(requested.occurredAt).getTime()
  );
}

export function createCancellationRouter(pool) {
  const router = Router();

  router.post('/', async (req, res) => {
    const body = req.body ?? {};

    // order_id is accepted as an alias for the public order number
    // used in the project blueprint, e.g. ORD-8421.
    const orderNumber = body.order_number ?? body.order_id;
    const reason = body.reason;
    const source = body.source;
    const idempotencyKey = req.get('Idempotency-Key') ??
      body.idempotency_key;

    if (
      typeof orderNumber !== 'string' ||
      !orderNumber.trim() ||
      orderNumber.length > 50
    ) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'order_number is required and must be at most 50 characters.',
      });
    }

    if (
      typeof reason !== 'string' ||
      !reason.trim() ||
      reason.length > 100
    ) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'reason is required and must be at most 100 characters.',
      });
    }

    if (typeof source !== 'string' || !SOURCES.has(source)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `source must be one of: ${[...SOURCES].join(', ')}.`,
      });
    }

    if (
      typeof idempotencyKey !== 'string' ||
      !idempotencyKey.trim() ||
      idempotencyKey.length > 150
    ) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Provide an Idempotency-Key header or idempotency_key field (max 150 characters).',
      });
    }

    let occurredAt = new Date();

    if (body.requested_at !== undefined) {
      if (
        typeof body.requested_at !== 'string' ||
        !Number.isFinite(Date.parse(body.requested_at))
      ) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'requested_at must be a valid date-time string.',
        });
      }
      occurredAt = new Date(body.requested_at);
    }

    const requested = {
      orderNumber: orderNumber.trim(),
      reason: reason.trim(),
      source,
      occurredAt,
    };

    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      // Fast path for already-recorded requests.
      const prior = await client.query(
        `SELECT ce.event_id, ce.order_id, ce.reason, ce.source,
                ce.occurred_at, o.order_number, d.status AS decision_status
         FROM cancellation_events ce
         JOIN orders o ON o.order_id = ce.order_id
         LEFT JOIN decisions d ON d.event_id = ce.event_id
         WHERE ce.idempotency_key = $1`,
        [idempotencyKey.trim()],
      );

      if (prior.rowCount > 0) {
        const existing = prior.rows[0];

        if (!sameRequest(existing, requested)) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return res.status(409).json({
            error: 'IDEMPOTENCY_KEY_REUSED',
            message: 'This idempotency key was already used for a different request.',
          });
        }

        await client.query('COMMIT');
        transactionOpen = false;

        return res.status(200).json({
          event_id: existing.event_id,
          status: 'RECEIVED',
          decision_status: existing.decision_status ?? 'PROCESSING',
          duplicate: true,
        });
      }

      // Lock the order so concurrent cancellation requests for the
      // same order cannot both perform the initial state transition.
      const orderResult = await client.query(
        `SELECT order_id, order_number, current_status, version
         FROM orders
         WHERE order_number = $1
         FOR UPDATE`,
        [requested.orderNumber],
      );

      if (orderResult.rowCount === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(404).json({
          error: 'ORDER_NOT_FOUND',
          message: 'No order exists with that order number.',
        });
      }

      const order = orderResult.rows[0];

      if (TERMINAL_ORDER_STATES.has(order.current_status)) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(409).json({
          error: 'ORDER_NOT_CANCELLABLE',
          message: `The order is already in terminal state ${order.current_status}.`,
          current_status: order.current_status,
        });
      }

      // Recheck after locking the order to handle concurrent requests
      // that use the same key for the same order.
      const recheck = await client.query(
        `SELECT ce.event_id, ce.reason, ce.source, ce.occurred_at,
                o.order_number, d.status AS decision_status
         FROM cancellation_events ce
         JOIN orders o ON o.order_id = ce.order_id
         LEFT JOIN decisions d ON d.event_id = ce.event_id
         WHERE ce.idempotency_key = $1`,
        [idempotencyKey.trim()],
      );

      if (recheck.rowCount > 0) {
        const existing = recheck.rows[0];

        if (!sameRequest(existing, requested)) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return res.status(409).json({
            error: 'IDEMPOTENCY_KEY_REUSED',
            message: 'This idempotency key was already used for a different request.',
          });
        }

        await client.query('COMMIT');
        transactionOpen = false;

        return res.status(200).json({
          event_id: existing.event_id,
          status: 'RECEIVED',
          decision_status: existing.decision_status ?? 'PROCESSING',
          duplicate: true,
        });
      }

      const parcelResult = await client.query(
        `SELECT parcel_id, status
         FROM parcels
         WHERE order_id = $1`,
        [order.order_id],
      );

      const parcel = parcelResult.rows[0] ?? null;
      const stageAtCancel = parcel?.status ?? 'CREATED';

      const eventResult = await client.query(
        `INSERT INTO cancellation_events (
           idempotency_key, order_id, parcel_id, source, reason,
           stage_at_cancel, occurred_at, payload
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING event_id`,
        [
          idempotencyKey.trim(),
          order.order_id,
          parcel?.parcel_id ?? null,
          source,
          requested.reason,
          stageAtCancel,
          occurredAt,
          JSON.stringify({
            order_number: requested.orderNumber,
            reason: requested.reason,
            source,
            requested_at: occurredAt.toISOString(),
          }),
        ],
      );

      // A request using the same key could have arrived concurrently
      // for a different order. The unique constraint remains the
      // final guard against duplicate event creation.
      if (eventResult.rowCount === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;

        const conflict = await pool.query(
          `SELECT ce.reason, ce.source, ce.occurred_at, o.order_number
           FROM cancellation_events ce
           JOIN orders o ON o.order_id = ce.order_id
           WHERE ce.idempotency_key = $1`,
          [idempotencyKey.trim()],
        );

        if (
          conflict.rowCount === 1 &&
          sameRequest(conflict.rows[0], requested)
        ) {
          return res.status(200).json({
            status: 'RECEIVED',
            decision_status: 'PROCESSING',
            duplicate: true,
          });
        }

        return res.status(409).json({
          error: 'IDEMPOTENCY_KEY_REUSED',
          message: 'This idempotency key was concurrently used by a different request.',
        });
      }

      const eventId = eventResult.rows[0].event_id;

      await client.query(
        `INSERT INTO decisions (event_id, status, policy_status, approval_mode)
         VALUES ($1, 'PROCESSING', 'PENDING', 'PENDING')`,
        [eventId],
      );

      const previousStatus = order.current_status;

      if (previousStatus !== 'CANCELLATION_REQUESTED') {
        await client.query(
          `UPDATE orders
           SET current_status = 'CANCELLATION_REQUESTED',
               version = version + 1
           WHERE order_id = $1`,
          [order.order_id],
        );
      }

      await client.query(
        `INSERT INTO audit_events (
           event_id, actor, action, from_state, to_state,
           details, correlation_id
         )
         VALUES ($1, $2, 'CANCELLATION_RECEIVED', $3,
                 'CANCELLATION_REQUESTED', $4::jsonb, $5)`,
        [
          eventId,
          source,
          previousStatus,
          JSON.stringify({
            order_number: order.order_number,
            reason: requested.reason,
            source,
            parcel_id: parcel?.parcel_id ?? null,
            stage_at_cancel: stageAtCancel,
          }),
          idempotencyKey.trim(),
        ],
      );

      await client.query('COMMIT');
      transactionOpen = false;

      return res.status(201).json({
        event_id: eventId,
        status: 'RECEIVED',
        decision_status: 'PROCESSING',
        duplicate: false,
      });
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK').catch(() => {});
      }

      console.error('Cancellation ingestion failed:', error.message);

      return res.status(500).json({
        error: 'CANCELLATION_INGESTION_FAILED',
        message: 'The cancellation request could not be persisted.',
      });
    } finally {
      client.release();
    }
  });

  return router;
}
