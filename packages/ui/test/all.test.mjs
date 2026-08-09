import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { compile } from 'svelte/compiler';
import { compile as compileTailwind } from 'tailwindcss';

import { resolveTheme, THEME_BOOTSTRAP_SCRIPT } from '../dist/index.js';

for (const component of ['Button', 'Slider', 'FileDrop']) {
  test(`${component} compiles as a Svelte component`, async () => {
    const source = await readFile(new URL(`../src/${component}.svelte`, import.meta.url), 'utf8');
    const result = compile(source, { filename: `${component}.svelte`, generate: 'client' });
    assert.ok(result.js.code.length > 0);
  });
}

test('theme resolution supports explicit and system preferences', () => {
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.match(THEME_BOOTSTRAP_SCRIPT, /document\.documentElement\.dataset\.theme/);
});

test('tokens contain light, dark, Tailwind, and reduced-motion definitions', async () => {
  const css = await readFile(new URL('../src/tokens.css', import.meta.url), 'utf8');
  assert.match(css, /:root\s*{/);
  assert.match(css, /:root\[data-theme='dark'\]/);
  assert.match(css, /@theme(?:\s+inline)?\s*{/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.equal((css.match(/--dur-fast: 0ms/g) ?? []).length, 1);
  const tailwind = await compileTailwind(css);
  assert.match(tailwind.build(['bg-background']), /\.bg-background[\s\S]*var\(--c-bg\)/);
});
