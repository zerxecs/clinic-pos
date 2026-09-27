import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from './api-client.js';

const response = (status, data = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => data });

test('simultaneous 401s share one refresh and each safe request retries once', async () => {
  let access = 'old-access';
  let refreshCount = 0;
  const resourceAttempts = new Map();
  const api = createApiClient({
    getAccessToken: () => access,
    getRefreshToken: () => 'old-refresh',
    setTokens: token => { access = token.access_token; },
    onRefreshFailure: () => assert.fail('refresh should succeed'),
    fetchImpl: async (url, options) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCount++;
        await new Promise(resolve => setTimeout(resolve, 10));
        return response(200, { access_token: 'new-access', refresh_token: 'new-refresh' });
      }
      const attempts = (resourceAttempts.get(url) || 0) + 1;
      resourceAttempts.set(url, attempts);
      return options.headers.authorization === 'Bearer new-access'
        ? response(200, { url })
        : response(401, { message: 'Expired' });
    },
  });

  const results = await Promise.all([api('/products'), api('/sales')]);
  assert.equal(refreshCount, 1);
  assert.deepEqual(results.map(item => item.url), ['/api/v1/products', '/api/v1/sales']);
  assert.deepEqual([...resourceAttempts.values()], [2, 2]);
});

test('failed shared refresh logs out and rejects every waiting request', async () => {
  let access = 'expired-access';
  let refreshCount = 0;
  let logoutCount = 0;
  const api = createApiClient({
    getAccessToken: () => access,
    getRefreshToken: () => 'expired-refresh',
    setTokens: () => assert.fail('tokens must not be set'),
    onRefreshFailure: () => { access = ''; logoutCount++; },
    fetchImpl: async url => {
      if (url.endsWith('/auth/refresh')) {
        refreshCount++;
        await new Promise(resolve => setTimeout(resolve, 10));
        return response(401, { message: 'Refresh expired' });
      }
      return response(401);
    },
  });

  const results = await Promise.allSettled([api('/products'), api('/inventory')]);
  assert.equal(refreshCount, 1);
  assert.equal(logoutCount, 1);
  assert.equal(access, '');
  assert.ok(results.every(result => result.status === 'rejected'));
});

test('does not automatically replay a non-idempotent sale request', async () => {
  let refreshCount = 0;
  let saleAttempts = 0;
  const api = createApiClient({
    getAccessToken: () => 'expired-access',
    getRefreshToken: () => 'valid-refresh',
    setTokens: () => {},
    onRefreshFailure: () => {},
    fetchImpl: async url => {
      if (url.endsWith('/auth/refresh')) refreshCount++;
      else saleAttempts++;
      return response(401, { message: 'Unauthorized' });
    },
  });

  await assert.rejects(api('/sales', { method: 'POST', headers: { 'Idempotency-Key': 'sale-key' }, body: { items: [] } }), /Unauthorized/);
  assert.equal(saleAttempts, 1);
  assert.equal(refreshCount, 0);
});

test('a safe request is retried at most once after refresh', async () => {
  let access = 'old-access';
  let attempts = 0;
  const api = createApiClient({
    getAccessToken: () => access,
    getRefreshToken: () => 'refresh',
    setTokens: token => { access = token.access_token; },
    onRefreshFailure: () => {},
    fetchImpl: async url => {
      if (url.endsWith('/auth/refresh')) return response(200, { access_token: 'new-access', refresh_token: 'new-refresh' });
      attempts++;
      return response(401, { message: 'Still unauthorized' });
    },
  });

  await assert.rejects(api('/products'), /Still unauthorized/);
  assert.equal(attempts, 2);
});

test('forbidden protected actions preserve the API authorization error', async () => {
  const api = createApiClient({
    getAccessToken: () => 'cashier-token',
    getRefreshToken: () => '',
    setTokens: () => {},
    onRefreshFailure: () => {},
    fetchImpl: async () => response(403, { code: 'FORBIDDEN', message: 'Admin access required' }),
  });

  await assert.rejects(api('/inventory/lots'), error => {
    assert.equal(error.status, 403);
    assert.equal(error.code, 'FORBIDDEN');
    assert.equal(error.message, 'Admin access required');
    return true;
  });
});

test('sale API failures are surfaced without replaying a non-idempotent request', async () => {
  let attempts = 0;
  const api = createApiClient({
    getAccessToken: () => 'cashier-token',
    getRefreshToken: () => 'refresh-token',
    setTokens: () => {},
    onRefreshFailure: () => {},
    fetchImpl: async () => {
      attempts++;
      return response(502, { code: 'API_UNAVAILABLE', message: 'The clinic API is unavailable.' });
    },
  });

  await assert.rejects(api('/sales', { method: 'POST', body: { items: [] } }), error => {
    assert.equal(error.status, 502);
    assert.equal(error.code, 'API_UNAVAILABLE');
    assert.match(error.message, /API is unavailable/);
    return true;
  });
  assert.equal(attempts, 1);
});
