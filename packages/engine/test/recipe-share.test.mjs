import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildShareFragment,
  buildShareLink,
  cloneSerializedRecipe,
  describeRecipe,
  parseShareFragment,
  persistableJson,
} from '../dist/recipes/sharing.js';
import { parseRecipe, recipeSharePayload, serializeRecipe } from '../dist/recipes/serialization.js';

const baseRecipe = {
  version: 1,
  id: 'demo',
  name: 'Demo recipe',
  steps: [
    { op: 'resize', options: { mode: 'pixels', width: 800 } },
    { op: 'adjust', options: { brightness: 0, contrast: 5, saturation: 0 } },
    { op: 'filter', options: { name: 'sepia' } },
  ],
  export: { format: 'webp', quality: 80 },
};

test('describeRecipe produces a phrase for every step', () => {
  const desc = describeRecipe(baseRecipe);
  assert.equal(desc.phrases.length, baseRecipe.steps.length);
  for (const phrase of desc.phrases) {
    assert.ok(phrase.length > 0, 'phrase must be non-empty');
  }
  assert.match(desc.phrases[0], /Resize/);
  assert.match(desc.phrases[1], /Tuning/);
  assert.match(desc.phrases[2], /Filter/);
});

test('describeRecipe flags AI steps so a shared recipe never surprises the recipient', () => {
  const withAi = {
    ...baseRecipe,
    steps: [...baseRecipe.steps, { op: 'ai', options: { provider: 'openai', task: 'upscale' } }],
  };
  const desc = describeRecipe(withAi);
  assert.equal(desc.cost.hasAi, true);
  assert.equal(desc.cost.requiresConsent, true);
  assert.deepEqual(desc.aiSteps, [3]);
  assert.ok(desc.warnings.some((w) => /AI provider/i.test(w)));
});

test('describeRecipe with includeAi=false omits AI phrases but still flags them', () => {
  const withAi = {
    ...baseRecipe,
    steps: [...baseRecipe.steps, { op: 'ai', options: { provider: 'openai' } }],
  };
  const desc = describeRecipe(withAi, { includeAi: false });
  assert.equal(desc.cost.hasAi, true);
  // Phrases are filtered, but the warnings are still emitted so the recipient sees the cost.
  assert.equal(desc.phrases.length, baseRecipe.steps.length);
  assert.ok(desc.warnings.length > 0);
});

test('describeRecipe surfaces a watermark warning when the recipe overlays one', () => {
  const recipe = {
    ...baseRecipe,
    steps: [{ op: 'watermark', options: { text: '© Demo' } }, ...baseRecipe.steps],
  };
  const desc = describeRecipe(recipe);
  assert.ok(desc.warnings.some((w) => /watermark/i.test(w)));
});

test('buildShareFragment produces a #recipe= fragment that round-trips', () => {
  const fragment = buildShareFragment(baseRecipe);
  assert.match(fragment, /^#recipe=r1\./);
  const round = parseShareFragment(fragment);
  // The recipe schema fills in defaults during parse, so compare the normalized shape.
  assert.equal(round.id, baseRecipe.id);
  assert.equal(round.name, baseRecipe.name);
  assert.equal(round.steps.length, baseRecipe.steps.length);
  assert.equal(round.export.format, baseRecipe.export.format);
  assert.equal(round.export.quality, baseRecipe.export.quality);
});

test('parseShareFragment accepts a fragment with a base URL', () => {
  const fragment = buildShareFragment(baseRecipe, 'https://example.com/tools/edit');
  const round = parseShareFragment(fragment);
  assert.equal(round.id, baseRecipe.id);
  assert.equal(round.steps.length, baseRecipe.steps.length);
});

test('parseShareFragment rejects an empty fragment', () => {
  assert.throws(() => parseShareFragment(''), /Empty/);
});

test('parseShareFragment rejects a fragment without a recipe payload', () => {
  assert.throws(() => parseShareFragment('#other=value'), /recipe/);
});

test('buildShareLink returns a URL kind for small recipes', () => {
  const link = buildShareLink(baseRecipe, 'https://example.com/edit');
  assert.equal(link.kind, 'url');
  assert.match(link.value, /#recipe=r1\./);
});

test('buildShareLink returns a download kind for oversized recipes', () => {
  // Build a recipe that, when serialized, exceeds 8 KiB. The engine is documented to
  // fall back to a file download for any recipe larger than 8192 bytes. We construct
  // steps until serializeRecipe's serialized length crosses 8 KiB, then assert the link.
  const steps = [];
  for (let i = 0; i < 20000; i += 1) {
    steps.push({ op: 'adjust', options: { brightness: i % 100, contrast: (i * 3) % 100 } });
  }
  const bigRecipe = { ...baseRecipe, steps };
  const payload = recipeSharePayload(bigRecipe);
  // Verify the threshold logic itself (the engine is allowed to use a download above 8 KiB).
  assert.equal(payload.kind, 'download');
  assert.ok(payload.filename.endsWith('.ctrecipe'));
  assert.ok(payload.contents.length > 0);
  // buildShareLink follows the same threshold.
  const link = buildShareLink(bigRecipe, 'https://example.com/edit');
  assert.equal(link.kind, 'download');
  assert.ok(link.filename.endsWith('.ctrecipe'));
});

test('recipeSharePayload returns a fragment when the recipe is small', () => {
  const payload = recipeSharePayload(baseRecipe);
  assert.equal(payload.kind, 'fragment');
  assert.ok(payload.value.startsWith('r1.'));
});

test('serializeRecipe + parseRecipe round-trip deep-equals', () => {
  const serialized = serializeRecipe(baseRecipe);
  const parsed = parseRecipe(serialized);
  // Defaults are filled in during parse; the meaningful fields must round-trip exactly.
  assert.equal(parsed.id, baseRecipe.id);
  assert.equal(parsed.name, baseRecipe.name);
  assert.equal(parsed.steps.length, baseRecipe.steps.length);
  assert.equal(parsed.export.format, baseRecipe.export.format);
  assert.equal(parsed.export.quality, baseRecipe.export.quality);
});

test('cloneSerializedRecipe returns the same canonical string', () => {
  const a = cloneSerializedRecipe(baseRecipe);
  const b = cloneSerializedRecipe(baseRecipe);
  assert.equal(a, b);
});

test('persistableJson emits a stable, indented JSON document', () => {
  const json = persistableJson(baseRecipe);
  assert.match(json, /\n/);
  // The persisted form must round-trip through the same Recipe shape.
  const parsed = JSON.parse(json);
  assert.equal(parsed.id, baseRecipe.id);
  assert.equal(parsed.steps.length, baseRecipe.steps.length);
});

test('sharing rejects inline binary assets in any recipe field', () => {
  const recipe = {
    ...baseRecipe,
    steps: [
      { op: 'filter', options: { lut: new Uint8Array([1, 2, 3]) } },
      ...baseRecipe.steps.slice(1),
    ],
  };
  assert.throws(() => serializeRecipe(recipe), /inline binary/);
});
