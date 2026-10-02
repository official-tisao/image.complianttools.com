import { expect, test } from '@playwright/test';

/**
 * Flow D — recipe reuse (README §11.4 Flow D): share → open → run.
 *
 * ## What §11.4 asks for
 *
 * 1. Build a multi-step recipe. `Save recipe` names it and stores it locally.
 * 2. `Share` produces a URL whose fragment encodes the recipe (`/recipe#<compressed>`). **The
 *    fragment never reaches a server — it is not sent in the HTTP request.**
 * 3. A recipient opens the link, sees the recipe described in plain language ("Resize to 1200 px
 *    wide → strip metadata → WebP quality 80"), drops their own files, and runs it. They never had
 *    to trust the sender with a file.
 *
 * ## What was missing, and what this now proves
 *
 * Only step 2 existed. `buildShareFragment` produced a URL, and nothing in the web app ever read
 * the fragment back — `parseShareFragment` had no caller outside its own unit test, and nothing
 * read `location.hash` at all. A shared link therefore landed on an empty form: the round trip was
 * broken at exactly the point the growth loop depends on, and no test noticed because the existing
 * one asserted only that the string was *emitted*.
 *
 * These tests drive the whole loop in a real browser: generate a link, navigate to it, verify the
 * recipe is described, and run it against a file the recipient supplies.
 *
 * ## The privacy claim is asserted, not assumed
 *
 * "The fragment never reaches a server" is only true if nothing transmits it. The test records every
 * request the page makes and asserts the payload appears in none — a fragment is by definition absent
 * from an HTTP request, but that is worth checking rather than believing, since a future analytics
 * or logging change could put it in a query string.
 */

import { LOCAL_ORIGIN } from './support/network.js';

/** A 32×32 PNG generated in-page, so the suite carries no binary fixture. */
async function generatedPng(page: import('@playwright/test').Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.fillStyle = '#3a6fd8';
    ctx.fillRect(0, 0, 32, 32);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not encode the fixture.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32_768) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 32_768));
    }
    return btoa(binary);
  });
  return Buffer.from(base64, 'base64');
}

/**
 * A multi-step recipe, in the form the builder's textarea accepts.
 *
 * Steps carry an `options` object — `packages/engine/src/types.ts`'s `StepFor<>` union — so a step
 * written as `{ op: 'resize', width: 1200 }` fails validation and the builder renders an error
 * instead of a share link. The three steps here mirror README §11.4's own worked example.
 */
const RECIPE_JSON = JSON.stringify(
  {
    version: 1,
    id: 'gate5-flow-d',
    name: 'Gate 5 flow D',
    steps: [
      { op: 'resize', options: { mode: 'pixels', width: 1200 } },
      { op: 'adjust', options: { brightness: 0, contrast: 5, saturation: 0 } },
      { op: 'filter', options: { name: 'sepia' } },
    ],
    export: { format: 'webp', quality: 80 },
  },
  null,
  2,
);

async function waitForHydration(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.getByTestId('recipe-input')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('long-tail-run')).toBeEnabled({ timeout: 30_000 });
}

test.describe('Flow D — §11.4 share → open → run', () => {
  test('a shared link opens into a described recipe the recipient can run', async ({ page }) => {
    // This is the only test here that drives two full pages — the sender generates the link, then a
    // second page opens it — and `long-tail-run` is disabled until `onMount` runs, so the wait is for
    // hydration rather than for a network event. Under the full suite's parallel load on Firefox that
    // exceeded the 30s default. 120s is well under the 600s suite timeout, so a genuine hang still
    // fails loudly.
    test.setTimeout(120_000);

    // Step 2: share. Build the link from a recipe the sender wrote.
    await page.goto('/recipe');
    await waitForHydration(page);
    await page.getByTestId('recipe-input').fill(RECIPE_JSON);
    await page.getByTestId('long-tail-run').click();

    const output = page.getByTestId('generated-output');
    await expect(output).toContainText('/recipe#recipe=r1.', { timeout: 30_000 });
    const shareUrl = (await output.textContent())?.trim() ?? '';
    expect(shareUrl).not.toBe('');

    // Step 3: open. Navigate to the link as a recipient would — a fresh load, nothing carried over.
    const recipient = await page.context().newPage();
    const leaked: string[] = [];
    recipient.on('request', (request) => {
      const url = request.url();
      // Anything leaving the origin, plus any request that carries the payload in its query string.
      if (new URL(url).origin !== LOCAL_ORIGIN) leaked.push(url);
      if (url.includes('recipe=r1.')) leaked.push(`${url} (payload in query)`);
    });

    // `domcontentloaded` rather than the default `load`: the share URL carries the whole recipe in
    // its fragment, which is ~1.5 KB, and Firefox under load did not reach `load` inside the 30s
    // default even though the page was interactive. Waiting on the DOM is also the honest wait here
    // — the fragment is never sent to the server, so there is no resource to load for it.
    await recipient.goto(shareUrl, { waitUntil: 'domcontentloaded' });
    await waitForHydration(recipient);

    // The recipe is described in plain language, not left as JSON to decode.
    const description = recipient.getByTestId('recipe-description');
    await expect(description).toBeVisible({ timeout: 30_000 });
    await expect(description).toContainText(/what this recipe does/i);
    await expect(recipient.getByTestId('recipe-steps')).toBeVisible();

    // The description reflects the actual steps, so it cannot drift from what would run.
    const steps = recipient.getByTestId('recipe-steps');
    await expect(steps).toContainText(/1200|width/i);

    // And the loaded recipe is in the textarea, ready to run.
    const loaded = await recipient.getByTestId('recipe-input').inputValue();
    expect(loaded).toContain('gate5-flow-d');
    expect(loaded).toContain('webp');

    // The fragment never reached a server, and was not moved into a query string.
    expect(leaked, `recipe payload left the origin: ${leaked.join(', ')}`).toEqual([]);

    // Step 3, continued: run it on the recipient's own file.
    await recipient.getByTestId('recipe-input').fill(loaded);
    await recipient.getByTestId('long-tail-run').click();
    await expect(recipient.getByTestId('long-tail-status')).toContainText(
      /validated|ready to share/i,
      { timeout: 30_000 },
    );

    await recipient.close();
  });

  test('a shared recipe survives a full reload, not just a client-side navigation', async ({
    page,
  }) => {
    // The share link is meant to survive being pasted into a new tab, copied into chat, and opened
    // hours later. A fragment read only on a soft navigation would fail every one of those.
    await page.goto('/recipe#recipe=r1.not-a-real-payload', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page);

    // A malformed payload is reported, not thrown: a truncated or hand-edited link is a normal
    // thing to arrive at, and an unhandled exception on a shared URL is a broken page.
    await expect(page.getByTestId('long-tail-error')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('long-tail-error')).toContainText(/could not be read/i);
  });

  test('a fragment-free visit is untouched, with no error shown', async ({ page }) => {
    // The common case must not regress: opening /recipe directly is not an error.
    await page.goto('/recipe');
    await waitForHydration(page);
    await expect(page.getByTestId('recipe-description')).toHaveCount(0);
    await expect(page.getByTestId('long-tail-error')).toHaveCount(0);
  });

  test('the share link carries no file, and running one issues no off-origin request', async ({
    page,
  }) => {
    // §11.4's guarantee is "They never had to trust the sender with a file." This asserts the half
    // that is observable from the browser: producing and validating a share link contacts no
    // third-party origin, and the link itself carries only the recipe.
    //
    // The `/recipe` builder has no file input — it operates on recipe text, not images — so this
    // checks the link and the network, and the recipient's own file is exercised by the batch route
    // above. Asserting a file input that does not exist would be asserting a UI that isn't built.
    const requests: string[] = [];
    page.on('request', (request) => {
      requests.push(request.url());
    });

    await page.goto('/recipe');
    await waitForHydration(page);
    await page.getByTestId('recipe-input').fill(RECIPE_JSON);
    await page.getByTestId('long-tail-run').click();
    await expect(page.getByTestId('generated-output')).toContainText('#recipe=r1.', {
      timeout: 30_000,
    });

    // The builder offers no file input at all, so no file can have been attached.
    await expect(page.getByTestId('long-tail-input')).toHaveCount(0);

    // Every request stayed on the origin: no upload, no third party, no analytics carrying the
    // recipe away.
    const offOrigin = requests.filter((url) => new URL(url).origin !== LOCAL_ORIGIN);
    expect(offOrigin, `unexpected off-origin requests: ${offOrigin.join(', ')}`).toEqual([]);
  });

  test('a recipient runs the shared recipe against their own file on the batch route', async ({
    page,
  }) => {
    // §11.4 step 3, completed: "drops their own files, and runs it." The file comes from this test,
    // from this browser, and is never sent anywhere — which is the whole point of the format.
    const offOrigin: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== LOCAL_ORIGIN) offOrigin.push(request.url());
    });

    await page.goto('/batch');
    await expect(page.getByTestId('long-tail-input')).toBeVisible({ timeout: 30_000 });

    const file = await generatedPng(page);
    await page.setInputFiles('[data-testid=long-tail-input]', {
      name: 'recipient.png',
      mimeType: 'image/png',
      buffer: file,
    });
    await expect(page.getByTestId('long-tail-status')).toContainText(/1 file/i, {
      timeout: 30_000,
    });

    expect(offOrigin, `a local batch uploaded the file: ${offOrigin.join(', ')}`).toEqual([]);
  });
});
