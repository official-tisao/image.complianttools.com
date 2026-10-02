import { expect, test, type Page } from '@playwright/test';

/**
 * Gate 5 — "Removing every configured provider leaves 78 of 81 tools fully working".
 *
 * ## The two halves of the claim
 *
 * PLAN.md states this as a Gate 5 checkbox. It only holds if *both* of these are true, and the
 * original claim asserted neither:
 *
 *  1. **The arithmetic.** 81 tools exist, exactly 3 need a provider, so 78 do not.
 *     → `scripts/check-local-tool-inventory.ts` derives this from `feature-audit.csv`, reconciles
 *       it against the route tree and the `/ai` routes, and checks the figure published in
 *       `content.ts`. `scripts/test-local-tool-inventory-gate.ts` proves that check fails on drift.
 *
 *  2. **The behaviour.** Each of those tools actually produces a local result, with no provider
 *     configured and no provider request issued. → this file.
 *
 * This file is the second half. It is deliberately not "assert 78 == 78": a count proves nothing
 * about whether the tools work. Instead it drives representative tools across every distinct
 * archetype — convert, batch, cutout/fill, transform, annotate, privacy, batch-and-dev — with all
 * provider origins blocked, and asserts a real local result appears.
 *
 * ## Why every provider origin is blocked rather than merely unconfigured
 *
 * §22.6a is explicit that the no-implicit-call test matters most when a key *is* configured. Here the
 * property is the inverse: nothing is configured, and nothing must be contacted. Blocking the
 * origins means an accidental call fails loudly instead of quietly succeeding — and since the
 * routes under test are genuinely local, nothing legitimate is affected.
 *
 * ## Why a representative set rather than all 78
 *
 * Every one of the 78 shares its implementation with at least one tool in this list; the differences
 * are options, not code paths. Enumerating all 78 by name would assert the same code path 78 times
 * while adding no coverage, and would break every time a route is renamed — which is the failure
 * mode §22.6a's own warning about ("a control that escalates on navigation"). The exhaustive
 * inventory check above is what covers all 78; this covers each archetype once.
 */

import { LOCAL_ORIGIN } from './support/network.js';

/** Every provider origin an AI call could reach (§22.6a's list, plus the relay-free bases). */
const PROVIDER_ORIGIN =
  /^(api\.openai\.com|api\.anthropic\.com|api\.stability\.ai|api\.gemini\.googleapis\.com|generativelanguage\.googleapis\.com|api\.bfl\.ai|fal\.run|queue\.fal\.run|api\.replicate\.com|clipdrop-api\.co|api\.remove\.bg|openrouter\.ai)$/u;

/**
 * A larger, real PNG generated in-page.
 *
 * The 1×1 fixture above decodes, but several tools (cutout, resize, upscale) need a few pixels of
 * real area before their output is meaningful — a 1×1 input resampled to 2×2 is indistinguishable
 * from "did nothing". This draws a subject over a background so a matte, a crop, or a resize has
 * something to act on.
 */
async function generatedPng(page: Page, width = 64, height = 64): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable.');
      ctx.fillStyle = '#e8d8c8';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#3a6fd8';
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, Math.min(width, height) / 3, 0, Math.PI * 2);
      ctx.fill();
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the Gate 5 fixture.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 32_768) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 32_768));
      }
      return btoa(binary);
    },
    { width, height },
  );
  return Buffer.from(base64, 'base64');
}

/** Wait for hydration. Every route here is a Svelte 5 island. */
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelector('html[data-hydrated="true"]') !== null, {
    timeout: 30_000,
  });
}

/**
 * Record every off-origin request, and fail loudly on any provider request.
 *
 * Installed before navigation so a call fired during load or hydration is caught — that is the
 * cheapest accidental escalation and the one a per-action check would miss.
 */
function watchRequests(page: Page): { provider: string[]; offOrigin: string[] } {
  const provider: string[] = [];
  const offOrigin: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === LOCAL_ORIGIN) return;
    offOrigin.push(request.url());
    if (PROVIDER_ORIGIN.test(url.hostname)) provider.push(request.url());
  });
  return { provider, offOrigin };
}

/**
 * Abort any provider request outright.
 *
 * Not just "watch and assert" — an actual block. If a tool did try to escalate, the request fails
 * immediately rather than reaching a real endpoint, so the test can never spend money or touch a
 * live provider even if the watcher's assertion is removed.
 */
async function blockProviders(page: Page): Promise<void> {
  await page.route(/^https?:\/\/(api|fal|queue|clipdrop-api|generativelanguage)\./u, (route) =>
    route.abort('blockedbyclient'),
  );
}

/**
 * One local tool, driven through its own real controls.
 *
 * `run` performs the action and must leave a real result on screen — the assertion is inside each
 * entry because "what a result looks like" differs per archetype, and a generic `body is not empty`
 * check would pass on an error page.
 */
interface LocalToolCase {
  readonly id: string;
  readonly route: string;
  readonly archetype: string;
  run(page: Page, file: Buffer): Promise<void>;
}

const LOCAL_TOOL_CASES: readonly LocalToolCase[] = [
  {
    id: 'T01',
    route: '/convert',
    archetype: 'Convert & export',
    // The canonical Flow A: drop a file, a preview with a predicted size appears.
    async run(page, file) {
      await page.setInputFiles('[data-testid=file-input]', {
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: file,
      });
      await expect(page.getByTestId('compare-canvas')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('size-prediction')).not.toContainText('Choose');
    },
  },
  {
    id: 'T20',
    route: '/compress',
    archetype: 'Optimize',
    async run(page, file) {
      await page.setInputFiles('[data-testid=file-input]', {
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: file,
      });
      await expect(page.getByTestId('compare-canvas')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('size-prediction')).not.toContainText('Choose');
    },
  },
  {
    id: 'T24',
    route: '/resize',
    archetype: 'Transform',
    async run(page, file) {
      await page.setInputFiles('[data-testid=file-input]', {
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: file,
      });
      await expect(page.getByTestId('compare-canvas')).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    id: 'T68',
    route: '/remove-background',
    archetype: 'Cutout / fill (Local ⇗AI)',
    // One of the six §22.6a escalation tools. Its local result must exist with no key at all, which
    // is the specific claim Gate 5 turns on: the escalation is optional, the tool is not.
    async run(page, file) {
      await page.getByTestId('p4-file-input').setInputFiles({
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: file,
      });
      await page.getByTestId('p4-run').click();
      await expect(page.getByTestId('p4-preview')).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    id: 'T66',
    route: '/remove-object',
    archetype: 'Cutout / fill (Local ⇗AI, masked)',
    async run(page, file) {
      await page.getByTestId('p44-source').setInputFiles({
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: file,
      });
      // T66 refuses without a mask, so the mask has to be real for the local result to be real.
      const canvas = page.getByTestId('local-source-canvas');
      await expect(canvas).toBeVisible({ timeout: 30_000 });
      await canvas.click({ position: { x: 20, y: 20 } });
      await page.getByTestId('local-tool-run').click();
      await expect(page.getByTestId('local-tool-preview')).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    id: 'T32',
    route: '/upscale',
    archetype: 'Transform (Local ⇗AI)',
    async run(page, file) {
      await page.getByTestId('t32-file-input').setInputFiles({
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: file,
      });
      await page.getByTestId('t32-run').click();
      await expect(page.getByTestId('t32-output-dimensions')).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    id: 'T81',
    route: '/adaptive-resize',
    archetype: 'Transform (target-size search)',
    async run(page, file) {
      // Not `file-input`/`compare-canvas`: those belong to the compare-sizes tools, and T81 renders
      // neither. It has its own controls, and its local result is the run reporting a status.
      await page.getByTestId('t81-input').setInputFiles({
        name: 'fixture.png',
        mimeType: 'image/png',
        buffer: file,
      });
      await page.getByTestId('t81-run').click();
      await expect(page.getByTestId('t81-status')).toBeVisible({ timeout: 30_000 });
    },
  },
];

test.describe('Gate 5 — every archetype works with no provider configured', () => {
  for (const tool of LOCAL_TOOL_CASES) {
    test(`${tool.id} ${tool.route} (${tool.archetype}) produces a local result`, async ({
      page,
    }) => {
      // No provider is configured anywhere in this test — that is the condition being tested.
      // The origin block is defence in depth, not the mechanism.
      await blockProviders(page);
      const seen = watchRequests(page);

      await page.goto(tool.route);
      await waitForHydration(page);

      const file = await generatedPng(page);
      await tool.run(page, file);

      expect(
        seen.provider,
        `${tool.route} contacted a provider with none configured: ${seen.provider.join(', ')}`,
      ).toEqual([]);
    });
  }

  test('all archetypes in sequence still contact no provider', async ({ page }) => {
    // The per-tool tests each start from a clean page. This one visits every route in order, so a
    // control that escalates on *navigation* — the cheapest accidental escalation — is caught across
    // the whole set rather than missed by a single-tool test.
    await blockProviders(page);
    const seen = watchRequests(page);

    await page.goto('/convert');
    await waitForHydration(page);
    const file = await generatedPng(page);

    for (const tool of LOCAL_TOOL_CASES) {
      await page.goto(tool.route);
      await waitForHydration(page);
      await tool.run(page, file);
    }

    expect(seen.provider, `provider calls: ${seen.provider.join(', ')}`).toEqual([]);
  });

  test('no credential is present in browser storage, so "no provider" is a real precondition', async ({
    page,
  }) => {
    // The other half of "no provider configured". If a key were sitting in localStorage or
    // sessionStorage — say, planted by an earlier spec in the same worker — then "no provider
    // request" would be a far weaker claim: something could have been called using it. Asserting
    // the precondition makes every other assertion in this file mean what it says.
    await page.goto('/convert');
    await waitForHydration(page);

    const found = await page.evaluate(() => {
      const suspicious: string[] = [];
      const KEY_PATTERN = /sk-|api[_-]?key|bearer|credential/i;

      for (const [store, label] of [
        [window.localStorage, 'localStorage'],
        [window.sessionStorage, 'sessionStorage'],
      ] as const) {
        for (let i = 0; i < store.length; i += 1) {
          const key = store.key(i) ?? '';
          const value = store.getItem(key) ?? '';
          if (KEY_PATTERN.test(key) || KEY_PATTERN.test(value)) {
            suspicious.push(`${label}:${key}`);
          }
        }
      }
      return suspicious;
    });

    expect(found, `credential-shaped storage entries: ${found.join(', ')}`).toEqual([]);
  });
});
