import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const listed = [...sw.matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]);

test('service worker precaches every app file', () => {
  const files = ['js', 'css', 'icons'].flatMap((d) => walk(join(root, d))).map((p) => relative(root, p));
  for (const f of files) assert.ok(listed.includes(f), `${f} is missing from sw.js ASSETS`);
  for (const f of listed) if (f !== './') assert.ok(existsSync(join(root, f)), `${f} in sw.js does not exist`);
});

test('manifest is installable: name, start_url, standalone, 192 and 512 icons', () => {
  const m = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.ok(m.name && m.short_name);
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const i of m.icons) assert.ok(existsSync(join(root, i.src)), `${i.src} missing`);
});

test('all paths are relative so the app works under a GitHub Pages subpath', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.ok(!/(?:href|src)="\//.test(html), 'absolute path in index.html');
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /name="theme-color"/);
});
