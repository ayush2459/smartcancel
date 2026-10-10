import test from 'node:test';
import assert from 'node:assert/strict';

process.env.FRONTEND_BUCKET = 'smartcancy-test';
process.env.COGNITO_USER_POOL_ID = 'ap-southeast-2_test';
process.env.COGNITO_USER_POOL_CLIENT_ID = 'test-client';
process.env.COGNITO_DOMAIN = 'https://smartcancy-demo.example.com';

const { handler } = await import('../src/frontend.js');

test('frontend runtime config is returned without caching', async () => {
  const result = await handler({ rawPath: '/runtime-config.json' });

  assert.equal(result.statusCode, 200);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.deepEqual(JSON.parse(result.body), {
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    userPoolClientId: process.env.COGNITO_USER_POOL_CLIENT_ID,
    domain: process.env.COGNITO_DOMAIN,
  });
});

test('frontend rejects encoded path traversal before accessing S3', async () => {
  const result = await handler({ rawPath: '/%2e%2e/private.txt' });

  assert.equal(result.statusCode, 400);
});
