import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { validateAccessTokenSecret } from '../src/security-config.js';
import { validateAdminCredentials, hashAdminPassword } from '../src/admin-credentials.js';
import argon2 from 'argon2';

test('token secret requires a long, non-placeholder value', () => {
  for (const value of [undefined, '', 'short', 'password1234', 'development-secret', 'replace-with-at-least-32-random-bytes']) {
    assert.throws(() => validateAccessTokenSecret(value), /ACCESS_TOKEN_SECRET/);
  }
  const secret = 'a unique sufficiently long token signing key';
  assert.equal(validateAccessTokenSecret(secret), secret);
});

test('API process refuses missing and known placeholder signing secrets', () => {
  for (const secret of ['', 'password1234']) {
    const env = { ...process.env, DATABASE_URL: 'postgres://unused/unused', ACCESS_TOKEN_SECRET: secret };
    const result = spawnSync(process.execPath, ['src/server.js'], { cwd: new URL('..', import.meta.url), env, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ACCESS_TOKEN_SECRET/);
  }
});

test('bootstrap validates credentials and hashes passwords with Argon2id', async () => {
  const credentials = validateAdminCredentials({ username: ' Admin.User ', displayName: ' Clinic Admin ', password: 'a-long-user-chosen-password' });
  assert.deepEqual(credentials, { username: 'admin.user', displayName: 'Clinic Admin', password: 'a-long-user-chosen-password' });
  const hash = await hashAdminPassword(credentials.password);
  assert.notEqual(hash, credentials.password);
  assert.equal(await argon2.verify(hash, credentials.password), true);
  assert.equal(await argon2.verify(hash, 'different-user-password'), false);
  assert.throws(() => validateAdminCredentials({ ...credentials, password: 'short' }), /credentials/);
});
