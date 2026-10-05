/**
 * P6-02 route evidence — File System Access integration. README §7.2, PLAN.md P6-02.
 *
 * **What this is not:** these tests do not exercise the real filesystem. Playwright drives
 * Chromium through CDP, and neither the File System Access pickers nor the OS save dialog can be
 * opened, typed into, or confirmed from there — a headless run has no desktop to prompt. Every
 * picker below is therefore an in-page stand-in that implements exactly the surface the route
 * calls. That is enough to assert the behaviour this change is about (which API is chosen, what
 * the fallback produces, that a cancellation writes nothing), and it is *not* evidence that a
 * folder on disk is written correctly on a user's machine. The mocked T74 watch test in
 * `p6-01-tools.spec.ts` has the same limitation; a real-filesystem check needs a driver that can
 * interact with the native dialogs.
 *
 * The ZIP is verified by unpacking the downloaded bytes with `fflate` and comparing them, so
 * "one archive with both images" is a statement about the archive's contents.
 */

import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

import fflate from '../packages/engine/node_modules/fflate/lib/node.cjs';
import { denyAllNetwork } from './support/network.js';

const { unzipSync } = fflate;

async function open(page: Page, route: string) {
  await page.goto(route);
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true', { timeout: 20_000 });
}

/** A PNG generated in-page, so nothing is fetched and no fixture file is needed. */
async function generatedPng(
  page: Page,
  width: number,
  height: number,
  rgb: [number, number, number],
) {
  const base64 = await page.evaluate(
    async ({ width, height, rgb }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D context is unavailable.');
      context.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
      context.fillRect(0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode the generated PNG fixture.');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32_768)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
      return btoa(binary);
    },
    { width, height, rgb },
  );
  return Buffer.from(base64, 'base64');
}

/**
 * Installs a stand-in for `showSaveFilePicker`.
 *
 * `mode` picks the outcome: `'ok'` writes through the handle, `'cancel'` rejects with the real
 * `AbortError` the browser throws, `'throw'` rejects with a different failure to stand in for a
 * picker that exists but cannot hand back a writable.
 */
async function installSavePicker(page: Page, mode: 'ok' | 'cancel' | 'throw') {
  await page.addInitScript((mode) => {
    const state = { suggestedName: '', written: null as string | null };
    (globalThis as Record<string, unknown>)['__ctSaveState'] = state;
    (globalThis as Record<string, unknown>)['showSaveFilePicker'] = async (options: {
      suggestedName: string;
    }) => {
      state.suggestedName = options.suggestedName;
      if (mode === 'cancel') throw new DOMException('The user aborted a request.', 'AbortError');
      if (mode === 'throw') throw new TypeError('The file picker is not available.');
      return {
        createWritable: async () => ({
          write: async (blob: Blob) => {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            let binary = '';
            for (const byte of bytes) binary += String.fromCharCode(byte);
            state.written = btoa(binary);
          },
          close: async () => {},
        }),
      };
    };
  }, mode);
}

/** Removes `showSaveFilePicker` entirely, as a non-Chromium browser would present itself. */
async function removeSavePicker(page: Page) {
  await page.addInitScript(() => {
    delete (globalThis as Record<string, unknown>)['showSaveFilePicker'];
  });
}

/**
 * Skips unless the page natively exposes the directory picker.
 *
 * `installDirectoryApi` can only supply the *handle constructors* on a browser that already has
 * `showDirectoryPicker`; it cannot invent the picker itself. On Firefox and WebKit the probe
 * correctly reports no directory access, the watch controls stay hidden by design, and the
 * stand-in handles are never reached — so these tests are Chromium-only rather than skipped on
 * capability, which would hide a real regression on a browser that later gains support.
 */
async function requireNativeDirectoryPicker(page: Page) {
  const supported = await page.evaluate(
    () =>
      typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function',
  );
  test.skip(
    !supported,
    'This browser does not implement the File System Access directory API natively.',
  );
}

/** Sets up the T74 directory handles, and reports them as unsupported when `supported` is false. */
async function installDirectoryApi(page: Page, supported: boolean) {
  await page.addInitScript((supported) => {
    if (!supported) {
      delete (globalThis as Record<string, unknown>)['showDirectoryPicker'];
      delete (globalThis as Record<string, unknown>)['FileSystemDirectoryHandle'];
      delete (globalThis as Record<string, unknown>)['FileSystemWritableFileStream'];
      return;
    }
    (globalThis as Record<string, unknown>)['FileSystemDirectoryHandle'] =
      function FileSystemDirectoryHandle() {};
    (globalThis as Record<string, unknown>)['FileSystemWritableFileStream'] =
      function FileSystemWritableFileStream() {};
  }, supported);
}

test.describe('P6-02 save-as through showSaveFilePicker', () => {
  test('writes the archive to the chosen file when the picker is available', async ({
    page,
    context,
  }) => {
    await denyAllNetwork(context);
    await removeSavePicker(page);
    await installSavePicker(page, 'ok');
    await open(page, '/watch');

    const fixture = await generatedPng(page, 24, 24, [200, 40, 90]);
    await page
      .getByTestId('t74-input')
      .setInputFiles([{ name: 'first.png', mimeType: 'image/png', buffer: fixture }]);
    await expect(page.getByTestId('t74-results')).toContainText('first.webp');

    await page.getByTestId('t74-download-all').click();
    await expect(page.getByTestId('t74-status')).toContainText('folder-watcher-results.zip');

    const save = await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __ctSaveState: { suggestedName: string; written: string | null };
          }
        ).__ctSaveState,
    );
    expect(save.suggestedName).toBe('folder-watcher-results.zip');
    // The handle really received the archive bytes rather than an empty placeholder.
    expect(save.written).not.toBeNull();
    const bytes = Buffer.from(save.written!, 'base64');
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  test('falls back to an anchor download when the picker is absent', async ({ page, context }) => {
    await denyAllNetwork(context);
    await removeSavePicker(page);
    await open(page, '/watch');

    const fixture = await generatedPng(page, 24, 24, [10, 120, 200]);
    await page
      .getByTestId('t74-input')
      .setInputFiles([{ name: 'solo.png', mimeType: 'image/png', buffer: fixture }]);
    await expect(page.getByTestId('t74-results')).toContainText('solo.webp');

    // The picker is gone, so the download must still happen — this is README §7.2's stated
    // fallback, and it is the only path that works on Firefox and WebKit.
    const pending = page.waitForEvent('download');
    await page.getByTestId('t74-download-all').click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('folder-watcher-results.zip');
    const path = await download.path();
    expect(path).not.toBeNull();
    const bytes = await readFile(path!);
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  test('writes nothing and falls back to no download when the picker is cancelled', async ({
    page,
    context,
  }) => {
    await denyAllNetwork(context);
    await installSavePicker(page, 'cancel');
    await open(page, '/watch');

    const fixture = await generatedPng(page, 24, 24, [30, 30, 30]);
    await page
      .getByTestId('t74-input')
      .setInputFiles([{ name: 'declined.png', mimeType: 'image/png', buffer: fixture }]);
    await expect(page.getByTestId('t74-results')).toContainText('declined.webp');

    // A cancellation is the user declining. Re-offering the same file through an anchor would
    // defeat the point of cancelling, so nothing is downloaded at all.
    let downloaded = false;
    page.on('download', () => {
      downloaded = true;
    });
    await page.getByTestId('t74-download-all').click();
    await expect(page.getByTestId('t74-status')).toContainText('No location was chosen');
    await page.waitForTimeout(500);
    expect(downloaded).toBe(false);
  });

  test('falls back to a download when the picker fails for a reason other than cancellation', async ({
    page,
    context,
  }) => {
    await denyAllNetwork(context);
    await installSavePicker(page, 'throw');
    await open(page, '/watch');

    const fixture = await generatedPng(page, 24, 24, [90, 90, 10]);
    await page
      .getByTestId('t74-input')
      .setInputFiles([{ name: 'revoked.png', mimeType: 'image/png', buffer: fixture }]);
    await expect(page.getByTestId('t74-results')).toContainText('revoked.webp');

    // A non-AbortError is a broken picker, not a declined one, so the anchor fallback applies.
    const pending = page.waitForEvent('download');
    await page.getByTestId('t74-download-all').click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('folder-watcher-results.zip');
  });
});

test.describe('P6-02 T74 multi-file fallback downloads one ZIP', () => {
  test('produces a single archive holding every processed image', async ({ page, context }) => {
    await denyAllNetwork(context);
    // No save picker, so the anchor fallback runs — this test is about the archive's contents,
    // and a working picker would (correctly) write a file instead of downloading one.
    await removeSavePicker(page);
    await installDirectoryApi(page, false);
    await open(page, '/watch');

    // The unsupported-browser path, so this also proves the controls are hidden there.
    await expect(page.getByTestId('t74-unavailable')).toBeVisible();
    await expect(page.getByTestId('t74-choose-source')).toHaveCount(0);

    const first = await generatedPng(page, 24, 24, [255, 0, 0]);
    const second = await generatedPng(page, 24, 24, [0, 255, 0]);
    await page.getByTestId('t74-input').setInputFiles([
      { name: 'alpha.png', mimeType: 'image/png', buffer: first },
      { name: 'beta.png', mimeType: 'image/png', buffer: second },
    ]);
    await expect(page.getByTestId('t74-results')).toContainText('alpha.webp');
    await expect(page.getByTestId('t74-results')).toContainText('beta.webp');

    // README §7.2 requires "ZIP download", not a burst of separate downloads — browsers throttle
    // or block those and the user gets N save dialogs instead of one.
    let downloadCount = 0;
    page.on('download', () => {
      downloadCount += 1;
    });
    const pending = page.waitForEvent('download');
    await page.getByTestId('t74-download-all').click();
    const download = await pending;
    await download.path();

    const entries = unzipSync(new Uint8Array(await readFile((await download.path())!)));
    const names = Object.keys(entries).sort();
    expect(names).toEqual(['alpha.webp', 'beta.webp']);
    // Both entries are real encoded images, not empty placeholders.
    for (const name of names) expect(entries[name]!.length).toBeGreaterThan(0);
    expect(downloadCount).toBe(1);
  });
});

test.describe('P6-02 T74 output-folder overlap', () => {
  test('does not reprocess its own output when the output folder is also watched', async ({
    page,
    context,
  }) => {
    await denyAllNetwork(context);
    await removeSavePicker(page);
    await installDirectoryApi(page, true);
    await open(page, '/watch');
    await requireNativeDirectoryPicker(page);

    // One folder used for both roles: the exact configuration that otherwise turns every write
    // into the next sweep's new file, forever.
    await page.evaluate(() => {
      const files = new Map<
        string,
        { name: string; size: number; lastModified: number; blob: Blob }
      >();
      // Strictly increasing per write and add. Deriving the timestamp from `files.size` instead
      // would repeat whenever a write replaced an existing entry, and the sweep's diff would then
      // report the file as unchanged — which is a bug in the fake, not in the tool.
      let clock = 0;
      const makePng = async (colour: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D is unavailable.');
        context.fillStyle = colour;
        context.fillRect(0, 0, 16, 16);
        return new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
            'image/png',
          ),
        );
      };
      const handle = {
        kind: 'directory' as const,
        name: 'inbox',
        async *values() {
          for (const file of files.values())
            yield {
              kind: 'file' as const,
              handle: {
                kind: 'file' as const,
                name: file.name,
                getFile: async () =>
                  Object.assign(await file.blob, { lastModified: file.lastModified }),
              },
            };
        },
        getFileHandle: async (name: string) => {
          // `create: true` is the API's contract for a file that does not exist yet, and the route
          // relies on it for every new output. Refusing here would make each write fail instead.
          // The handle itself materializes nothing: the entry appears when the writable closes,
          // so an unfinished write is never visible to the next sweep.
          if (!files.has(name) && !name.endsWith('.webp')) throw new Error(`No such file: ${name}`);
          return {
            // Looked up per call, not captured: a later write replaces the map entry, and a
            // captured reference would keep serving the pre-write bytes.
            getFile: async () => {
              const current = files.get(name)!;
              return Object.assign(await current.blob, { lastModified: current.lastModified });
            },
            createWritable: async () => {
              let pending: Blob | undefined;
              return {
                // A real write into the same folder the watcher re-reads, which is what closes the
                // loop in production and what this test needs to observe. The entry is published
                // on close, matching the real stream: a half-written file is not visible to the
                // next sweep, and publishing it twice would look like an edit.
                write: async (blob: Blob) => {
                  pending = blob;
                },
                close: async () => {
                  if (pending)
                    files.set(name, {
                      name,
                      size: pending.size,
                      lastModified: ++clock,
                      blob: pending,
                    });
                },
              };
            },
          };
        },
      };
      (globalThis as Record<string, unknown>)['showDirectoryPicker'] = async () =>
        handle as unknown as FileSystemDirectoryHandle;
      (globalThis as Record<string, unknown>)['__ctOverlap'] = {
        add: async (name: string, colour: string) => {
          const blob = await makePng(colour);
          files.set(name, { name, size: blob.size, lastModified: ++clock, blob });
        },
        names: () => [...files.keys()],
      };
      void (async () => {
        await (
          globalThis as unknown as { __ctOverlap: { add(n: string, c: string): Promise<void> } }
        ).__ctOverlap.add('seed.png', '#00ff00');
      })();
    });

    // "Ignore files already present" so the baseline sweep only records `seed.png` instead of
    // processing it; the addition below is then the first thing the loop acts on.
    await page.locator('[data-testid="option-t74-skipExisting"] input[type=checkbox]').check();
    await page.getByTestId('t74-choose-source').click();
    await page.getByTestId('t74-choose-output').click();
    await page.getByTestId('t74-start').click();
    await expect(page.getByTestId('t74-status')).toContainText('already present', {
      timeout: 15_000,
    });

    const add = (name: string, colour: string) =>
      page.evaluate(
        ([n, c]) =>
          (
            globalThis as unknown as { __ctOverlap: { add(n: string, c: string): Promise<void> } }
          ).__ctOverlap.add(n as string, c as string),
        [name, colour] as const,
      );
    const names = () =>
      page.evaluate(() =>
        (globalThis as unknown as { __ctOverlap: { names(): string[] } }).__ctOverlap.names(),
      );

    // A genuinely new file, saved the way a person would save a photo: new name, new timestamp.
    await add('later.png', '#0000ff');
    await expect.poll(names, { timeout: 15_000 }).toContain('later.webp');

    // Several more polls at the 1 s default: enough for the loop to have run repeatedly had the
    // guard not been in place, which is exactly what an unbounded reprocess loop would do.
    await page.waitForTimeout(4_000);

    // The output was written once and never reprocessed. `later.png` is the source this test added,
    // so only the generated `.webp` is under test: a loop would leave `later-2.webp`, `-3`, and so
    // on behind, one per poll.
    const after = await names();
    expect(after).toContain('later.webp');
    expect(after.filter((name) => /^later-\d+\.webp$/u.test(name))).toEqual([]);

    await page.getByTestId('t74-stop').click();
  });

  test('keeps both images when a recursive watch produces the same basename twice', async ({
    page,
    context,
  }) => {
    await denyAllNetwork(context);
    await removeSavePicker(page);
    await installDirectoryApi(page, true);
    await open(page, '/watch');
    await requireNativeDirectoryPicker(page);

    await page.evaluate(async () => {
      const written: Record<string, number> = {};
      const makePng = async (colour: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D is unavailable.');
        context.fillStyle = colour;
        context.fillRect(0, 0, 16, 16);
        return new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))),
            'image/png',
          ),
        );
      };
      // `a/shot.png` and `b/shot.png` both encode to `shot.webp`; without disambiguation the
      // second write overwrites the first and one image is silently lost. The blobs are awaited
      // before `values()` is ever iterated: leaving them as promises hands `getFile()` a promise
      // for a blob, which the route reads as an unreadable image rather than a decode failure.
      const files = [
        { path: 'a/shot.png', lastModified: 1, blob: await makePng('#ff0000') },
        { path: 'b/shot.png', lastModified: 2, blob: await makePng('#0000ff') },
      ];
      const source = {
        kind: 'directory' as const,
        name: 'tree',
        async *values() {
          // A real recursive scan recurses through `entry.handle`, so a yielded directory has to
          // be a working handle — a bare `{ kind, name }` object makes `scanFolder` throw.
          yield { kind: 'directory' as const, handle: subdirectory('a') };
          yield { kind: 'directory' as const, handle: subdirectory('b') };
        },
        getDirectoryHandle: async (name: string) => subdirectory(name),
      };
      function subdirectory(name: string) {
        const find = () => files.find((file) => file.path === `${name}/shot.png`);
        return {
          kind: 'directory' as const,
          name,
          async *values() {
            const entry = find();
            if (!entry) return;
            yield {
              kind: 'file' as const,
              handle: {
                kind: 'file' as const,
                name: 'shot.png',
                getFile: async () =>
                  Object.assign(await entry.blob, { lastModified: entry.lastModified }),
              },
            };
          },
          // The route re-resolves a scanned path back to a handle before reading it, so a
          // subdirectory has to expose `getFileHandle` as well as `values()`.
          getFileHandle: async (fileName: string) => {
            const entry = find();
            if (!entry) throw new Error(`No such file: ${name}/${fileName}`);
            return {
              getFile: async () =>
                Object.assign(await entry.blob, { lastModified: entry.lastModified }),
            };
          },
        };
      }
      const output = {
        kind: 'directory' as const,
        name: 'out',
        async *values() {},
        getFileHandle: async (name: string) => ({
          createWritable: async () => ({
            write: async (blob: Blob) => {
              written[name] = blob.size;
            },
            close: async () => {},
          }),
        }),
      };
      let picks = 0;
      (globalThis as Record<string, unknown>)['showDirectoryPicker'] = async () =>
        (picks++ === 0 ? source : output) as unknown as FileSystemDirectoryHandle;
      (globalThis as Record<string, unknown>)['__ctWritten'] = written;
    });

    // Recursive is what pulls the subfolders in.
    await page.locator('[data-testid="option-t74-recursive"] input[type=checkbox]').check();
    await page.getByTestId('t74-choose-source').click();
    await page.getByTestId('t74-choose-output').click();
    await page.getByTestId('t74-start').click();

    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            Object.keys(
              (globalThis as unknown as { __ctWritten: Record<string, number> }).__ctWritten,
            ),
          ),
        { timeout: 15_000 },
      )
      .toEqual(['shot.webp', 'shot-2.webp']);

    // Both are real images, so disambiguation did not cost us the first one.
    const written = await page.evaluate(
      () => (globalThis as unknown as { __ctWritten: Record<string, number> }).__ctWritten,
    );
    expect(Object.keys(written).sort()).toEqual(['shot-2.webp', 'shot.webp']);
    for (const size of Object.values(written)) expect(size).toBeGreaterThan(0);

    await page.getByTestId('t74-stop').click();
  });
});

test.describe('P6-02 picker availability', () => {
  test('hides the watch controls and offers the ZIP fallback where the directory API is absent', async ({
    page,
    context,
  }) => {
    await denyAllNetwork(context);
    await removeSavePicker(page);
    await installDirectoryApi(page, false);
    await open(page, '/watch');

    await expect(page.getByTestId('t74-unavailable')).toBeVisible();
    await expect(page.getByTestId('t74-choose-source')).toHaveCount(0);
    await expect(page.getByTestId('t74-start')).toHaveCount(0);

    // README §7.2: hidden where unsupported, `<input type=file>` + ZIP download elsewhere.
    const fixture = await generatedPng(page, 20, 20, [70, 130, 200]);
    await page
      .getByTestId('t74-input')
      .setInputFiles([{ name: 'photo.png', mimeType: 'image/png', buffer: fixture }]);
    await expect(page.getByTestId('t74-results')).toContainText('photo.webp');
    await expect(page.getByTestId('t74-download-all')).toBeVisible();

    const pending = page.waitForEvent('download');
    await page.getByTestId('t74-download-all').click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe('folder-watcher-results.zip');
    const entries = unzipSync(new Uint8Array(await readFile((await download.path())!)));
    expect(Object.keys(entries)).toEqual(['photo.webp']);
  });

  test('reports directory and save picker support distinctly on the capabilities page', async ({
    page,
    context,
  }) => {
    await denyAllNetwork(context);
    await removeSavePicker(page);
    await installDirectoryApi(page, true);
    await open(page, '/debug/capabilities');

    // README §7.2 gives each API its own fallback, so a single combined flag would hide which
    // one is missing. The rows are asserted on every browser; only the *values* need the API to
    // exist natively, so the expected verdict is derived rather than assumed.
    const read = async (label: string) => {
      const term = page.locator('dt', { hasText: label }).first();
      return (await term.locator('xpath=following-sibling::dd[1]').innerText()).trim();
    };
    await expect(page.locator('dt', { hasText: 'directory picker' }).first()).toBeVisible();
    await expect(page.locator('dt', { hasText: 'showSaveFilePicker' }).first()).toBeVisible();

    const native = await page.evaluate(
      () =>
        typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function',
    );
    expect(await read('File System Access (directory picker)')).toBe(
      native ? 'Available' : 'Unavailable',
    );
    // `showSaveFilePicker` was deleted above, so this row is the honest one either way.
    expect(await read('showSaveFilePicker')).toBe('Unavailable');
  });

  test('passes axe', async ({ page, context }) => {
    await denyAllNetwork(context);
    await open(page, '/watch');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
