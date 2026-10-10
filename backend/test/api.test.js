import test from 'node:test';
import assert from 'node:assert/strict';

const baseUrl = (process.env.API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { response, body: await response.json() };
}

test('liveness endpoint returns ok', async () => {
  const { response, body } = await requestJson('/api/health/live');
  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'smartcancy-backend');
});

test('database health confirms PostgreSQL connectivity', async () => {
  const { response, body } = await requestJson('/api/health');
  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.database.status, 'connected');
  assert.equal(body.database.name, 'smartcancy');
});

test('hub inventory report returns PostgreSQL-shaped data', async () => {
  const { response, body } = await requestJson('/api/v1/reports/hub-inventory');
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.hubs));
  assert.ok(Array.isArray(body.held_parcels));
  assert.equal(typeof body.note, 'string');
  for (const hub of body.hubs) {
    assert.equal(typeof hub.capacity, 'number');
    assert.equal(typeof hub.held_parcels, 'number');
  }
});

test('pilot report totals match its persisted order and impact rows', async () => {
  const { response, body } = await requestJson('/api/v1/reports/pilot-roi');
  assert.equal(response.status, 200);
  assert.equal(body.pilot_id, 'BLR_DELHI_5');
  assert.ok(Array.isArray(body.orders));
  assert.equal(body.totals.order_count, body.orders.length);
  assert.equal(typeof body.totals.recorded_impact_records, 'number');
  assert.equal(typeof body.totals.estimated_return_distance_km, 'number');
  assert.ok(body.energy_model);
  assert.equal(
    body.energy_model.potential_fuel_cost_inr,
    Number((
      body.energy_model.modeled_local_return_distance_km /
      body.energy_model.assumptions.bike_mileage_km_per_liter *
      body.energy_model.assumptions.petrol_price_inr_per_liter
    ).toFixed(2))
  );
  assert.match(body.energy_model.note, /Conditional estimate/);
  assert.equal(typeof body.note, 'string');
});

test('cancellation intake rejects a missing payload', async () => {
  const { response, body } = await requestJson('/api/v1/cancellations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 400);
  assert.equal(body.error, 'VALIDATION_ERROR');
});

test('approval endpoint rejects malformed decision UUIDs', async () => {
  const { response, body } = await requestJson('/api/v1/approvals/not-a-uuid/approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actor: 'smoke-test' }),
  });
  assert.equal(response.status, 400);
  assert.equal(body.error, 'INVALID_DECISION_ID');
});

test('execution endpoint rejects malformed decision UUIDs', async () => {
  const { response, body } = await requestJson('/api/v1/executions/not-a-uuid/execute', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actor: 'smoke-test' }),
  });
  assert.equal(response.status, 400);
  assert.equal(body.error, 'INVALID_DECISION_ID');
});
