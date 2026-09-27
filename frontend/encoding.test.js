import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const chars = (...codes) => String.fromCodePoint(...codes);
const mojibakeMarkers = [
  chars(0x00e2, 0x2020), chars(0x00e2, 0x02dc), chars(0x00e2, 0x0153),
  chars(0x00e2, 0x02c6), chars(0x00e2, 0x20ac), chars(0x00e2, 0x2013),
  chars(0x00e2, 0x2014), chars(0x00e2, 0x2122), chars(0x00c3, 0x2014),
  chars(0x00c2, 0x00b7)
];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(?:js|html|css|svg)$/.test(entry.name) ? [fullPath] : [];
  }));
  return nested.flat();
}

test('frontend source has no known mojibake signatures', async () => {
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, 'utf8');
    for (const marker of mojibakeMarkers) {
      assert.equal(source.includes(marker), false, `${path.relative(root, file)} contains a mojibake marker`);
    }
  }
});

test('UI icons resolve from the local SVG sprite and the document is UTF-8', async () => {
  const [html, app, sprite] = await Promise.all([
    readFile(path.join(root, 'index.html'), 'utf8'),
    readFile(path.join(root, 'app.js'), 'utf8'),
    readFile(path.join(root, 'icons.svg'), 'utf8')
  ]);
  assert.match(html, /<meta charset="utf-8">/i);
  assert.match(app, /href="\/icons\.svg#/);
  assert.match(sprite, /<symbol id="menu"/);
  assert.match(sprite, /<symbol id="close"/);
  assert.match(sprite, /<symbol id="logout"/);
});

test('runtime frontend assets do not use external URLs', async () => {
  for (const file of await sourceFiles(root)) {
    const source = await readFile(file, 'utf8');
    const urls = source.match(/https?:\/\/[^\s"'<>`)]+/gi) ?? [];
    for (const url of urls) {
      assert.match(
        url,
        /^https?:\/\/(?:(?:localhost|127\.0\.0\.1)(?=[:/]|$)|www\.w3\.org\/2000\/svg(?:\/|$))/i,
        `${path.relative(root, file)} contains an external runtime URL: ${url}`
      );
    }
  }
});
