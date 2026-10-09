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
