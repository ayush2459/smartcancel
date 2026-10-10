import { Router } from 'express';
import { randomUUID } from 'node:crypto';

const ACTIONS = ['STOP', 'HOLD', 'CONTINUE', 'RE_MATCH', 'TRANSFER', 'RETURN'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const store = {
  events: [],
  decisions: new Map(),
  executions: new Map(),
};

function seedDemoData() {
  if (store.events.length > 0) return;

  const now = Date.now();
  const seedEvents = [
    {
      event_id: '11111111-1111-4111-8111-111111111111',
      idempotency_key: 'demo-event-1',
      order_number: 'ORD-8421',
      reason: 'Customer requested cancellation',
      source: 'CUSTOMER_APP',
      event_status: 'RECEIVED',
      stage_at_cancel: 'CREATED',
      received_at: new Date(now - 1000 * 60 * 60 * 2).toISOString(),
      order_status: 'PLACED',
      order_value: 129.99,
      destination_pincode: '560001',
      parcel_number: 'PKG-1001',
      parcel_status: 'CREATED',
      decision_id: '22222222-2222-4222-8222-222222222222',
      decision_status: 'RECOMMENDED',
      selected_action: 'STOP',
      recovery_score: 90,
      impact: { cost_saved: 118.2, distance_avoided_km: 17.5, carbon_avoided_kg: 4.3 },
      candidates: [
        { action: 'STOP', feasible: true, reason: 'Parcel has not entered the delivery network.', estimated_cost: 18, estimated_distance_km: 0, estimated_carbon_kg: 0, score: 90 },
        { action: 'HOLD', feasible: true, reason: 'Temporary hold is viable while the request is reviewed.', estimated_cost: 34, estimated_distance_km: 0, estimated_carbon_kg: 0, score: 78 },
        { action: 'RE_MATCH', feasible: true, reason: 'Demand signal and parcel condition support rematching.', estimated_cost: 62, estimated_distance_km: 0, estimated_carbon_kg: 0, score: 72 },
      ],
      model_confidence: 0.92,
      reasoning_summary: 'Best-fit route is to stop fulfillment before dispatch.',
    },
    {
      event_id: '33333333-3333-4333-8333-333333333333',
      idempotency_key: 'demo-event-2',
      order_number: 'ORD-9176',
      reason: 'Late rider assignment',
      source: 'OPERATOR',
      event_status: 'RECEIVED',
      stage_at_cancel: 'OUT_FOR_DELIVERY',
      received_at: new Date(now - 1000 * 60 * 45).toISOString(),
      order_status: 'OUT_FOR_DELIVERY',
      order_value: 274.5,
      destination_pincode: '560045',
      parcel_number: 'PKG-2040',
      parcel_status: 'OUT_FOR_DELIVERY',
      decision_id: '44444444-4444-4444-8444-444444444444',
      decision_status: 'REVIEW_REQUIRED',
      selected_action: 'TRANSFER',
      recovery_score: 60,
      impact: { cost_saved: 87.7, distance_avoided_km: 12.8, carbon_avoided_kg: 3.4 },
      candidates: [
        { action: 'CONTINUE', feasible: true, reason: 'Parcel is already in transit and continuing avoids reversal cost.', estimated_cost: 160, estimated_distance_km: 12.4, estimated_carbon_kg: 1.8, score: 82 },
        { action: 'TRANSFER', feasible: true, reason: 'Current route exists and transfer requires operational review.', estimated_cost: 118, estimated_distance_km: 8.9, estimated_carbon_kg: 1.1, score: 72 },
        { action: 'RETURN', feasible: true, reason: 'A return is possible but riskier than transfer.', estimated_cost: 190, estimated_distance_km: 15.6, estimated_carbon_kg: 2.3, score: 58 },
      ],
      model_confidence: 0.76,
      reasoning_summary: 'Transfer is feasible but needs human review because the parcel is already out for delivery.',
    },
    {
      event_id: '55555555-5555-4555-8555-555555555555',
      idempotency_key: 'demo-event-3',
      order_number: 'ORD-5924',
      reason: 'Customer changed mind',
      source: 'CUSTOMER_SUPPORT',
      event_status: 'RECEIVED',
      stage_at_cancel: 'PACKED',
      received_at: new Date(now - 1000 * 60 * 20).toISOString(),
      order_status: 'PACKED',
      order_value: 89.0,
      destination_pincode: '560082',
      parcel_number: 'PKG-3412',
      parcel_status: 'PACKED',
      decision_id: '66666666-6666-4666-8666-666666666666',
      decision_status: 'APPROVED',
      selected_action: 'HOLD',
      recovery_score: 78,
      impact: { cost_saved: 70.8, distance_avoided_km: 9.8, carbon_avoided_kg: 2.7 },
      candidates: [
        { action: 'HOLD', feasible: true, reason: 'Parcel has not entered the delivery network.', estimated_cost: 35, estimated_distance_km: 0, estimated_carbon_kg: 0, score: 78 },
        { action: 'STOP', feasible: true, reason: 'Parcel is still early enough to stop.', estimated_cost: 20, estimated_distance_km: 0, estimated_carbon_kg: 0, score: 71 },
        { action: 'RE_MATCH', feasible: true, reason: 'Demand signal exists and the parcel can be rematched.', estimated_cost: 60, estimated_distance_km: 0, estimated_carbon_kg: 0, score: 68 },
      ],
      model_confidence: 0.88,
      reasoning_summary: 'Hold is the most appropriate action before dispatch.',
    },
  ];

  for (const event of seedEvents) {
    store.events.push(event);
    store.decisions.set(event.decision_id, {
      decision_id: event.decision_id,
      event_id: event.event_id,
      status: event.decision_status,
      selected_action: event.selected_action,
      recovery_score: event.recovery_score,
      model_confidence: event.model_confidence,
      scoring_version: 'rules-v1',
      reasoning_summary: event.reasoning_summary,
      input_snapshot: { order_number: event.order_number, source: event.source },
      tool_trace: [],
      candidates: event.candidates,
      impact: event.impact,
    });
  }
}

function invalidUuidResponse(res) {
  return res.status(400).json({ error: 'INVALID_DECISION_ID' });
}

function invalidEventIdResponse(res) {
  return res.status(400).json({ error: 'INVALID_EVENT_ID' });
}

function buildOverview() {
  const total = store.events.length;
  const recommended = store.events.filter((event) => event.decision_status === 'RECOMMENDED').length;
  const reviewRequired = store.events.filter((event) => event.decision_status === 'REVIEW_REQUIRED').length;
  const costSaved = store.events.reduce((sum, event) => sum + Number(event.impact?.cost_saved ?? 0), 0);

  return {
    generated_at: new Date().toISOString(),
    metrics: {
      total_cancellations: total,
      received_events: total,
      processing_decisions: 0,
      recommended_decisions: recommended,
      decisions_requiring_review: reviewRequired,
      recorded_impact_records: total,
      recorded_cost_saved: Number(costSaved.toFixed(2)),
      recorded_distance_avoided_km: Number(store.events.reduce((sum, event) => sum + Number(event.impact?.distance_avoided_km ?? 0), 0).toFixed(2)),
      recorded_carbon_avoided_kg: Number(store.events.reduce((sum, event) => sum + Number(event.impact?.carbon_avoided_kg ?? 0), 0).toFixed(2)),
    },
    impact_note: 'Demo mode is using illustrative values until the PostgreSQL service is restored.',
  };
}

function matchDecision(decisionId) {
  for (const event of store.events) {
    if (event.decision_id === decisionId) {
      return { event, decision: store.decisions.get(decisionId) ?? {} };
    }
  }
  return null;
}

export function createDemoRouter() {
  const router = Router();

  seedDemoData();

  router.get('/overview', (_req, res) => {
    res.json(buildOverview());
  });

  router.get('/hub-inventory', (_req, res) => {
    res.json({
      generated_at: new Date().toISOString(),
      hubs: [],
      held_parcels: [],
      note: 'PostgreSQL is unavailable. Hub inventory is not available in demo fallback mode.',
    });
  });

  router.get('/pilot-roi', (_req, res) => {
    res.json({
      generated_at: new Date().toISOString(),
      pilot_id: 'BLR_DELHI_5',
      origin_city: null,
      destination_city: null,
      distance_source: null,
      road_distance_km_one_way: null,
      orders: [],
      energy_model: null,
      totals: {
        order_count: 0,
        estimated_return_distance_km: 0,
        recorded_impact_records: 0,
        recorded_cost_saved: 0,
        recorded_distance_avoided_km: 0,
        recorded_carbon_avoided_kg: 0,
      },
      note: 'PostgreSQL is unavailable. Pilot and impact data are not available in demo fallback mode.',
    });
  });

  router.get('/cancellations', (req, res) => {
    const limit = Number.parseInt(req.query.limit ?? '20', 10) || 20;
    const offset = Number.parseInt(req.query.offset ?? '0', 10) || 0;
    const items = [...store.events]
      .sort((a, b) => new Date(b.received_at) - new Date(a.received_at))
      .slice(offset, offset + limit)
      .map((event) => ({
        event_id: event.event_id,
        source: event.source,
        reason: event.reason,
        event_status: event.event_status,
        stage_at_cancel: event.stage_at_cancel,
        received_at: event.received_at,
        order_number: event.order_number,
        order_status: event.order_status,
        order_value: event.order_value,
        destination_pincode: event.destination_pincode,
        parcel_number: event.parcel_number,
        parcel_status: event.parcel_status,
        decision_id: event.decision_id,
        decision_status: event.decision_status,
        selected_action: event.selected_action,
        recovery_score: event.recovery_score,
      }));

    res.json({
      pagination: { limit, offset, total: store.events.length },
      cancellations: items,
    });
  });

  router.get('/decisions/:decisionId', (req, res) => {
    const { decisionId } = req.params;
    if (!UUID_PATTERN.test(decisionId)) return invalidUuidResponse(res);

    const match = matchDecision(decisionId);
    if (!match) return res.status(404).json({ error: 'DECISION_NOT_FOUND' });

    const { decision } = match;
    res.json({
      decision: {
        decision_id: decision.decision_id,
        status: decision.status,
        selected_action: decision.selected_action,
        recovery_score: decision.recovery_score,
        model_confidence: decision.model_confidence,
        reasoning_summary: decision.reasoning_summary,
        scoring_version: decision.scoring_version,
      },
      candidates: decision.candidates ?? [],
      impact: decision.impact ?? null,
    });
  });

  router.post('/', (req, res) => {
    const body = req.body ?? {};
    const orderNumber = String(body.order_number ?? body.order_id ?? '').trim();
    const reason = String(body.reason ?? '').trim();
    const source = String(body.source ?? 'OPERATOR');
    const idempotencyKey = String(req.get('Idempotency-Key') ?? body.idempotency_key ?? randomUUID());

    if (!orderNumber || !reason || reason.length > 100 || !['CUSTOMER_APP', 'CUSTOMER_SUPPORT', 'SYSTEM', 'OPERATOR'].includes(source)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Provide valid cancellation fields.' });
    }

    const duplicate = store.events.find((event) => event.idempotency_key === idempotencyKey);
    if (duplicate) {
      return res.status(200).json({ event_id: duplicate.event_id, status: 'RECEIVED', decision_status: duplicate.decision_status, duplicate: true });
    }

    const stage = ['CREATED', 'PACKED', 'OUT_FOR_DELIVERY'][Math.floor(Math.random() * 3)];
    const action = stage === 'OUT_FOR_DELIVERY' ? 'TRANSFER' : stage === 'CREATED' ? 'STOP' : 'HOLD';
    const eventId = randomUUID();
    const decisionId = randomUUID();
    const createdAt = new Date().toISOString();
    const candidates = [
      { action, feasible: true, reason: 'Demo policy selected this recovery action.', estimated_cost: 60, estimated_distance_km: 0, estimated_carbon_kg: 0, score: 82 },
      { action: 'HOLD', feasible: true, reason: 'Fallback action.', estimated_cost: 50, estimated_distance_km: 0, estimated_carbon_kg: 0, score: 74 },
    ];
    const event = {
      event_id: eventId,
      idempotency_key: idempotencyKey,
      order_number: orderNumber,
      reason,
      source,
      event_status: 'RECEIVED',
      stage_at_cancel: stage,
      received_at: createdAt,
      order_status: 'PLACED',
      order_value: 149.0,
      destination_pincode: '560100',
      parcel_number: `PKG-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      parcel_status: stage,
      decision_id: decisionId,
      decision_status: 'RECOMMENDED',
      selected_action: action,
      recovery_score: 82,
      impact: { cost_saved: 96.5, distance_avoided_km: 13.4, carbon_avoided_kg: 2.9 },
      candidates,
      model_confidence: 0.9,
      reasoning_summary: 'Demo mode selected a recovery action based on the parcel stage and item context.',
    };

    store.events.unshift(event);
    store.decisions.set(decisionId, {
      decision_id: decisionId,
      event_id: eventId,
      status: 'RECOMMENDED',
      selected_action: action,
      recovery_score: 82,
      model_confidence: 0.9,
      scoring_version: 'rules-v1',
      reasoning_summary: event.reasoning_summary,
      input_snapshot: { order_number: orderNumber, source },
      tool_trace: [],
      candidates,
      impact: event.impact,
    });

    return res.status(201).json({ event_id: eventId, status: 'RECEIVED', decision_status: 'RECOMMENDED', duplicate: false });
  });

  router.post('/:eventId/evaluate', (req, res) => {
    const { eventId } = req.params;
    if (!UUID_PATTERN.test(eventId)) return invalidEventIdResponse(res);

    const event = store.events.find((item) => item.event_id === eventId);
    if (!event) return res.status(404).json({ error: 'CANCELLATION_EVENT_NOT_FOUND' });

    const action = event.stage_at_cancel === 'OUT_FOR_DELIVERY' ? 'TRANSFER' : event.stage_at_cancel === 'CREATED' ? 'STOP' : 'HOLD';
    const decision = store.decisions.get(event.decision_id) ?? {};
    event.selected_action = action;
    event.decision_status = 'RECOMMENDED';
    event.recovery_score = 84;
    decision.status = 'RECOMMENDED';
    decision.selected_action = action;
    decision.recovery_score = 84;
    decision.model_confidence = 0.91;
    decision.reasoning_summary = `Demo decision: ${action} aligns with the parcel stage ${event.stage_at_cancel}.`;
    decision.candidates = ACTIONS.map((candidate) => ({
      action: candidate,
      feasible: candidate === action,
      reason: candidate === action ? 'Selected by the demo policy.' : 'Lower-priority fallback.',
      estimated_cost: candidate === action ? 60 : 90,
      estimated_distance_km: candidate === action ? 0 : 4,
      estimated_carbon_kg: candidate === action ? 0 : 0.6,
      score: candidate === action ? 84 : 58,
    }));

    res.json({ status: 'RECOMMENDED', selected_action: action, decision_id: event.decision_id });
  });

  router.post('/:decisionId/approve', (req, res) => {
    const { decisionId } = req.params;
    if (!UUID_PATTERN.test(decisionId)) return invalidUuidResponse(res);

    const match = matchDecision(decisionId);
    if (!match) return res.status(404).json({ error: 'DECISION_NOT_FOUND' });
    match.event.decision_status = 'APPROVED';
    match.decision.status = 'APPROVED';
    res.json({ decision_id: decisionId, status: 'APPROVED' });
  });

  router.post('/:decisionId/reject', (req, res) => {
    const { decisionId } = req.params;
    if (!UUID_PATTERN.test(decisionId)) return invalidUuidResponse(res);

    const match = matchDecision(decisionId);
    if (!match) return res.status(404).json({ error: 'DECISION_NOT_FOUND' });
    match.event.decision_status = 'REJECTED';
    match.decision.status = 'REJECTED';
    res.json({ decision_id: decisionId, status: 'REJECTED' });
  });

  router.post('/:decisionId/execute', (req, res) => {
    const { decisionId } = req.params;
    if (!UUID_PATTERN.test(decisionId)) return invalidUuidResponse(res);

    const match = matchDecision(decisionId);
    if (!match) return res.status(404).json({ error: 'DECISION_NOT_FOUND' });

    const execution = {
      decision_id: req.params.decisionId,
      mode: 'simulation',
      real_side_effects: false,
      order_or_parcel_modified: false,
      execution: {
        execution_id: randomUUID(),
        action: match.decision.selected_action ?? 'HOLD',
        status: 'SUCCEEDED',
        actor: req.body?.actor ?? 'OPERATOR',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      },
    };
    store.executions.set(req.params.decisionId, execution);
    res.status(201).json(execution);
  });

  router.get('/:decisionId', (req, res) => {
    const { decisionId } = req.params;
    if (!UUID_PATTERN.test(decisionId)) return invalidUuidResponse(res);

    const execution = store.executions.get(decisionId);
    if (!execution) return res.status(404).json({ error: 'EXECUTION_NOT_FOUND' });
    res.json(execution);
  });

  return router;
}
