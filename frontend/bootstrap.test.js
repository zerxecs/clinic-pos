import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('HTML loads the ES module application entry point', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');

  assert.match(html, /<script\s+type="module"\s+src="\/app\.js"><\/script>/);
});
