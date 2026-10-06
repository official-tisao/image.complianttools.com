/**
 * P6-03 — clipboard and drag-out. PLAN.md P6-03. README §11.5, §7.2.
 *
 * ## What these tests can and cannot prove
 *
 * Every clipboard and drag API here is replaced by a stand-in, because Node has no
 * `navigator.clipboard` and no `DataTransfer`. That is a limitation of the harness, not of the
 * code: these tests assert *our* side of the contract — that a `ClipboardItem` is constructed with
 * the output's real MIME type and bytes, that a refusal resolves to the documented fallback rather
 * than an unhandled rejection, and that a drag places a real `File` with the right name, type, and
 * contents on the `DataTransfer` instead of a URL string.
 *
 * They prove nothing about what a given OS pastes into Photoshop. The PLAN's "verified on macOS and
 * Windows against Photoshop and Figma" criterion is **not** covered here and is not implied by a
 * green run; see the manual checklist in `e2e/p6-03-clipboard-drag.spec.ts`.
 *
 * What *is* covered exhaustively is the routing logic in `transfer/paste.ts`, which is pure and
 * therefore worth testing on its own: the negative cases there are the ones that would silently
 * swallow a user's text if they regressed.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  installPasteImage,
  isTextEditingTarget,
  readClipboardImages,
  routePaste,
  type ClipboardItemLike,
} from '../src/lib/transfer/paste.ts';
import {
  copyImageToClipboard,
  supportsImageClipboard,
  writeImageToClipboard,
  type ClipboardItemLike as WrittenItem,
} from '../src/lib/transfer/clipboard.ts';
import { prepareDragOut, writeFileToTransfer } from '../src/lib/transfer/drag-out.ts';
import { markStale, publishResult } from '../src/lib/transfer/result-file.ts';
import { fileExtension, outputFilename, sanitiseFilename } from '../src/lib/transfer/filename.ts';

/** A real PNG, so "the bytes are the result's bytes" is a byte-for-byte claim. */
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0xde, 0xad, 0xbe, 0xef,
]);
const pngBlob = () => new Blob([PNG_BYTES], { type: 'image/png' });

function imageItem(type: string, file: File | null = new File([PNG_BYTES], 'x.png', { type })) {
  return { kind: 'file', type, getAsFile: () => file } satisfies ClipboardItemLike;
}

// ---------------------------------------------------------------------------------------------
// Paste routing
// ---------------------------------------------------------------------------------------------

test('an image on the clipboard is ingested', () => {
  const file = new File([PNG_BYTES], 'shot.png', { type: 'image/png' });
  const decision = routePaste({ clipboardData: { items: [imageItem('image/png', file)] } });
  assert.equal(decision.action, 'ingest');
  assert.deepEqual(decision.action === 'ingest' ? [...decision.files] : [], [file]);
});

test('a plain text paste is left to the browser, not hijacked', () => {
  // The negative case that matters most: swallowing this would be data loss in a text field.
  const decision = routePaste({
    clipboardData: { items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] },
  });
  assert.deepEqual(decision, { action: 'ignore', reason: 'no-image' });
});

test('a paste with no clipboard payload at all is ignored, not thrown', () => {
  assert.deepEqual(routePaste({}), { action: 'ignore', reason: 'no-clipboard-data' });
  assert.deepEqual(routePaste({ clipboardData: null }), {
    action: 'ignore',
    reason: 'no-clipboard-data',
  });
});

test('an empty clipboard is ignored', () => {
  assert.deepEqual(routePaste({ clipboardData: { items: [], files: [] } }), {
    action: 'ignore',
    reason: 'no-image',
  });
});

test('a non-image file on the clipboard is ignored', () => {
  const pdf = new File([new TextEncoder().encode('%PDF')], 'doc.pdf', {
    type: 'application/pdf',
  });
  assert.deepEqual(
    routePaste({
      clipboardData: { items: [{ kind: 'file', type: 'application/pdf', getAsFile: () => pdf }] },
    }),
    { action: 'ignore', reason: 'no-image' },
  );
});

test('an already-handled paste is not handled a second time', () => {
  const file = new File([PNG_BYTES], 'a.png', { type: 'image/png' });
  assert.deepEqual(
    routePaste({
      defaultPrevented: true,
      clipboardData: { items: [imageItem('image/png', file)] },
    }),
    { action: 'ignore', reason: 'already-handled' },
  );
});

test('an item whose getAsFile throws is skipped rather than escaping as an error', () => {
  // Some implementations throw instead of returning null for an item they will not materialise.
  const throwing = {
    kind: 'file',
    type: 'image/png',
    getAsFile: () => {
      throw new Error('blob revoked');
    },
  } satisfies ClipboardItemLike;
  const file = new File([PNG_BYTES], 'ok.png', { type: 'image/png' });
  const files = readClipboardImages({ items: [throwing, imageItem('image/png', file)] });
  assert.deepEqual([...files], [file], 'the throwing item is dropped, the good one survives');
});

test('getAsFile returning null is skipped', () => {
  assert.deepEqual([...readClipboardImages({ items: [imageItem('image/png', null)] })], []);
});

test('clipboard files are read when the payload exposes no items', () => {
  // Reading only `items` would make paste silently do nothing on any browser that exposes the
  // payload without them, which is exactly the cross-browser failure this fallback prevents.
  const file = new File([PNG_BYTES], 'b.png', { type: 'image/png' });
  assert.deepEqual([...readClipboardImages({ files: [file] })], [file]);
});

test('every image in a multi-item clipboard is returned', () => {
  const a = new File([PNG_BYTES], 'a.png', { type: 'image/png' });
  const b = new File([PNG_BYTES], 'b.jpg', { type: 'image/jpeg' });
  const decision = routePaste({
    clipboardData: { items: [imageItem('image/png', a), imageItem('image/jpeg', b)] },
  });
  assert.equal(decision.action === 'ingest' ? decision.files.length : 0, 2);
});

test('the listener cancels the event only when it ingested an image', () => {
  const seen: { prevented: number; ingested: number } = { prevented: 0, ingested: 0 };
  const target = {
    listeners: new Map<string, (event: Event) => void>(),
    addEventListener(kind: string, handler: (event: Event) => void) {
      this.listeners.set(kind, handler);
    },
    removeEventListener(kind: string) {
      this.listeners.delete(kind);
    },
  };
  const dispose = installPasteImage({
    eventTarget: target,
    onFiles: () => {
      seen.ingested += 1;
    },
  });
  const handler = target.listeners.get('paste')!;

  const makeEvent = (clipboardData: unknown) => {
    const event = {
      clipboardData,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
        seen.prevented += 1;
      },
    };
    return event as unknown as Event;
  };

  handler(makeEvent({ items: [imageItem('image/png')] }));
  assert.equal(seen.ingested, 1, 'an image paste reaches the tool');
  assert.equal(seen.prevented, 1, 'and cancels the default, so nothing else handles it');

  handler(makeEvent({ items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] }));
  assert.equal(seen.ingested, 1, 'a text paste does not reach the tool');
  assert.equal(seen.prevented, 1, 'and is not cancelled, so normal editing behaviour survives');

  dispose();
  assert.equal(target.listeners.has('paste'), false, 'teardown removes the listener');
});

test('text-editing targets are identified', () => {
  const fake = (tagName: string, extra: Record<string, unknown> = {}) =>
    ({
      tagName,
      ...extra,
    }) as unknown as Element;
  assert.equal(isTextEditingTarget(fake('TEXTAREA')), true);
  assert.equal(isTextEditingTarget(fake('INPUT', { type: 'text' })), true);
  assert.equal(isTextEditingTarget(fake('INPUT', { type: 'file' })), false);
  assert.equal(isTextEditingTarget(fake('DIV', { isContentEditable: true })), true);
  assert.equal(isTextEditingTarget(fake('DIV', { isContentEditable: false })), false);
  assert.equal(isTextEditingTarget(null), false);
});

// ---------------------------------------------------------------------------------------------
// Clipboard writes
// ---------------------------------------------------------------------------------------------

/** Records what a real write would have received. */
function recordingClipboard(mode: 'ok' | 'reject' = 'ok') {
  const written: { types: string[]; bytes: number; type: string }[] = [];
  return {
    written,
    environment: {
      clipboard: {
        write: async (items: readonly WrittenItem[]) => {
          if (mode === 'reject')
            throw new DOMException('Write permission denied.', 'NotAllowedError');
          for (const item of items) {
            for (const type of item.types) {
              const blob = await item.getType(type);
              written.push({ types: [...item.types], bytes: blob.size, type: blob.type });
            }
          }
        },
      },
      ClipboardItemCtor: class {
        types: string[];
        #blobs: Record<string, Blob>;
        constructor(blobs: Record<string, Blob>) {
          this.#blobs = blobs;
          this.types = Object.keys(blobs);
        }
        async getType(type: string) {
          return this.#blobs[type]!;
        }
      } as unknown as new (items: Record<string, Blob>) => WrittenItem,
    },
  };
}

test('a result is written as a ClipboardItem with its real MIME type and bytes', async () => {
  const { written, environment } = recordingClipboard('ok');
  const blob = pngBlob();
  const result = await writeImageToClipboard(blob, environment);

  assert.deepEqual(result, { outcome: 'copied' });
  assert.equal(written.length, 1, 'exactly one clipboard item was written');
  assert.equal(written[0]?.type, 'image/png', 'the MIME type is the produced format, not a guess');
  assert.equal(written[0]?.bytes, blob.size, 'the bytes are the result bytes, unmodified');
});

test('a browser without image clipboard support reports unavailable rather than throwing', async () => {
  // Firefox and any browser without `ClipboardItem`. Resolving, not rejecting, is what lets the
  // caller render the fallback instead of leaving a button spinning.
  const result = await writeImageToClipboard(pngBlob(), {});
  assert.deepEqual(result, { outcome: 'unavailable', failure: 'unavailable' });
  assert.equal(supportsImageClipboard({}), false);
});

test('a clipboard present without ClipboardItem is treated as unsupported', async () => {
  const environment = { clipboard: { write: async () => {} } };
  assert.equal(supportsImageClipboard(environment), false);
  assert.deepEqual(await writeImageToClipboard(pngBlob(), environment), {
    outcome: 'unavailable',
    failure: 'unavailable',
  });
});

test('a denied write reports `rejected`, so the caller can name the cause', async () => {
  const { environment } = recordingClipboard('reject');
  const result = await writeImageToClipboard(pngBlob(), environment);
  assert.equal(result.outcome, 'unavailable');
  assert.equal(result.failure, 'rejected');
  assert.ok(result.error instanceof DOMException);
});

test('a failed copy falls back to a download rather than dead-ending', async () => {
  // README §7.2 names the fallback. The fallback is injected here because Node has no document,
  // so this asserts the *decision and the arguments*, not the anchor mechanics (the Playwright
  // spec covers those against a real page).
  const { environment } = recordingClipboard('reject');
  const delivered: { filename: string; bytes: number }[] = [];
  const result = await copyImageToClipboard(
    pngBlob(),
    'photo.png',
    environment,
    (blob, filename) => void delivered.push({ filename, bytes: blob.size }),
  );
  assert.equal(result.outcome, 'downloaded', 'the user gets a file rather than an error');
  assert.deepEqual(delivered, [{ filename: 'photo.png', bytes: PNG_BYTES.byteLength }]);
});

test('an absent clipboard also reaches the fallback, not a dead end', async () => {
  const delivered: string[] = [];
  const result = await copyImageToClipboard(
    pngBlob(),
    'photo.png',
    {},
    (_blob, filename) => void delivered.push(filename),
  );
  assert.equal(result.outcome, 'downloaded');
  assert.deepEqual(delivered, ['photo.png']);
});

test('a successful copy does not trigger the fallback', async () => {
  const { environment } = recordingClipboard('ok');
  let fallbackCalls = 0;
  const result = await copyImageToClipboard(pngBlob(), 'photo.png', environment, () => {
    fallbackCalls += 1;
  });
  assert.deepEqual(result, { outcome: 'copied' });
  assert.equal(fallbackCalls, 0, 'the fallback must not run when the copy succeeded');
});

// ---------------------------------------------------------------------------------------------
// Drag-out
// ---------------------------------------------------------------------------------------------

/** Captures what a drag placed on the transfer, the way a drop target would read it. */
function recordingTransfer() {
  const added: File[] = [];
  const text: string[] = [];
  return {
    added,
    text,
    transfer: {
      items: {
        add: (file: File) => added.push(file),
        clear: () => {
          added.length = 0;
        },
      },
      setData: (_format: string, data: string) => void text.push(data),
    },
  };
}

test('a drag publishes a real File, not a URL string', async () => {
  // The core of README §11.5's "writes the processed file to the OS (DataTransfer with a real
  // File)". A `text/uri-list` of an object URL would drop a link, not an image.
  const result = publishResult(pngBlob(), { sourceName: 'photo', extension: 'png' });
  const { added, transfer } = recordingTransfer();
  const decision = prepareDragOut({ result, busy: false, transfer });

  assert.equal(decision.action, 'export');
  const refused = writeFileToTransfer(
    transfer,
    decision.action === 'export' ? decision.file : new File([]),
    decision.action === 'export' ? decision.result.filename : undefined,
  );
  assert.equal(refused, undefined);
  assert.equal(added.length, 1, 'a File was added to dataTransfer.items');
  assert.ok(added[0] instanceof File, 'and it is a real File, not a string');
  assert.equal(added[0]?.name, 'photo.png');
  assert.equal(added[0]?.type, 'image/png');
  assert.equal(added[0]?.size, PNG_BYTES.byteLength, 'carrying the processed bytes');
  assert.deepEqual(
    [...new Uint8Array(await added[0]!.arrayBuffer())],
    [...PNG_BYTES],
    'byte-for-byte the result, not a re-encode',
  );
});

test('a stale result is refused', () => {
  // README: stale output must not be copied or dragged after the options change.
  const result = markStale(publishResult(pngBlob(), { sourceName: 'photo', extension: 'png' }));
  assert.equal(result.stale, true);
  const { transfer } = recordingTransfer();
  assert.deepEqual(prepareDragOut({ result, busy: false, transfer }), {
    action: 'skip',
    reason: 'stale',
  });
});

test('a busy tool refuses to drag out', () => {
  const result = publishResult(pngBlob(), { sourceName: 'photo', extension: 'png' });
  const { transfer } = recordingTransfer();
  assert.deepEqual(prepareDragOut({ result, busy: true, transfer }), {
    action: 'skip',
    reason: 'busy',
  });
});

test('no result refuses to drag out', () => {
  const { transfer } = recordingTransfer();
  assert.deepEqual(prepareDragOut({ result: null, busy: false, transfer }), {
    action: 'skip',
    reason: 'no-result',
  });
});

test('a transfer with no items falls back to text and says so', () => {
  // Some engines only allow `text/plain` on a drag they consider valid. The user gets the
  // filename rather than nothing, and the caller is told the File did not travel.
  const text: string[] = [];
  const refused = writeFileToTransfer(
    { setData: (_f, d) => void text.push(d) },
    new File([PNG_BYTES], 'photo.png', { type: 'image/png' }),
    'photo.png',
  );
  assert.equal(refused, 'no-file-items');
  assert.deepEqual(text, ['photo.png']);
});

test('a transfer that throws is reported, not propagated into an unhandled error', () => {
  const refused = writeFileToTransfer(
    {
      setData: () => {
        throw new Error('InvalidStateError');
      },
    },
    new File([PNG_BYTES], 'photo.png', { type: 'image/png' }),
  );
  assert.equal(refused, 'dragstart-threw');
});

// ---------------------------------------------------------------------------------------------
// Filenames — the one name copy, drag, and download must all agree on
// ---------------------------------------------------------------------------------------------

test('the output name is derived from the source and the produced format', () => {
  assert.equal(outputFilename('photo.jpg', 'webp'), 'photo.webp');
  assert.equal(outputFilename('photo', '.webp'), 'photo.webp');
  assert.equal(outputFilename('my.photo.jpg', 'png'), 'my.photo.png');
});

test('a name with no usable stem still produces a usable file', () => {
  assert.equal(outputFilename('', 'png'), 'image.png');
  assert.equal(outputFilename('.png', 'png'), 'image.png');
});

test('path separators and illegal characters cannot escape the filename', () => {
  assert.equal(sanitiseFilename('../../etc/passwd'), '-..-etc-passwd');
  assert.equal(outputFilename('a\\b:c*d?.png', 'webp'), 'a-b-c-d-.webp');
});

test('hyphens and underscores survive, so existing download names do not change', () => {
  assert.equal(outputFilename('my-photo_final', 'png'), 'my-photo_final.png');
});

test('control characters are stripped', () => {
  assert.equal(sanitiseFilename('photo\u0000\u001f.png'), 'photo.png');
});

test('the extension helper reads a trailing extension only', () => {
  assert.equal(fileExtension('photo.webp'), 'webp');
  assert.equal(fileExtension('photo.WEBP'), 'webp');
  assert.equal(fileExtension('photo'), '');
});
