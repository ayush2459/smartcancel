import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import {
  createDecisionRouter,
  isServiceAuthorizationValid,
  isValidAgentAnalysis,
} from '../src/routes/decisions.js';

const decision = {
  decision_id: 'decision-1',
  event_id: 'event-1',
  selected_action: 'RE_MATCH',
};

const analysis = {
  status: 'READY',
  recommended_action: 'RE_MATCH',
  summary: 'Recommendation: RE_MATCH.',
  rationale: ['The deterministic engine selected RE_MATCH.'],
  caveats: ['AI explanation does not authorize execution.'],
  evidence_keys: ['recommended_action', 'recovery_score'],
  requires_human_review: false,
  agent_version: '1.0.0',
  provider: 'deterministic-fallback',
};

test('service authorization requires the expected bearer token', () => {
  assert.equal(isServiceAuthorizationValid(undefined, 'secret'), false);
  assert.equal(isServiceAuthorizationValid('Basic secret', 'secret'), false);
  assert.equal(isServiceAuthorizationValid('Bearer wrong', 'secret'), false);
  assert.equal(isServiceAuthorizationValid('Bearer secret', undefined), false);
  assert.equal(isServiceAuthorizationValid('Bearer secret', 'secret'), true);
});

test('decision snapshot route rejects requests without service authorization', async () => {
  const previousServiceToken = process.env.SCRE_SERVICE_TOKEN;
  const previousAgentKey = process.env.AI_AGENT_SHARED_SECRET;
  delete process.env.SCRE_SERVICE_TOKEN;
  process.env.AI_AGENT_SHARED_SECRET = 'unit-token-alpha';

  const app = express();
  let queryCount = 0;
  app.use('/api/v1/decisions', createDecisionRouter({
    query: async () => {
      queryCount += 1;
      return { rowCount: 0, rows: [] };
    },
  }));

  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1/decisions/not-a-uuid`;

    assert.equal((await fetch(baseUrl)).status, 401);
    assert.equal((await fetch(baseUrl, {
      headers: { authorization: 'Bearer unit-token-beta' },
    })).status, 401);
    assert.equal((await fetch(baseUrl, {
      headers: { authorization: 'Bearer unit-token-alpha' },
    })).status, 400);
    assert.equal(queryCount, 0);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previousServiceToken === undefined) delete process.env.SCRE_SERVICE_TOKEN;
    else process.env.SCRE_SERVICE_TOKEN = previousServiceToken;
    if (previousAgentKey === undefined) delete process.env.AI_AGENT_SHARED_SECRET;
    else process.env.AI_AGENT_SHARED_SECRET = previousAgentKey;
  }
});

test('agent response must match the persisted decision and analysis contract', () => {
  const payload = { decision_id: decision.decision_id, event_id: decision.event_id, analysis };
  assert.equal(isValidAgentAnalysis(payload, decision), true);
  assert.equal(isValidAgentAnalysis({ ...payload, decision_id: 'other' }, decision), false);
  assert.equal(isValidAgentAnalysis({ ...payload, event_id: 'other' }, decision), false);
  assert.equal(isValidAgentAnalysis({
    ...payload,
    analysis: { ...analysis, recommended_action: 'RETURN' },
  }, decision), false);
  assert.equal(isValidAgentAnalysis({
    ...payload,
    analysis: { ...analysis, evidence_keys: ['made_up_score'] },
  }, decision), false);
  assert.equal(isValidAgentAnalysis({
    ...payload,
    analysis: { ...analysis, requires_human_review: 'false' },
  }, decision), false);
});
