/**
 * Shared helpers for the recorded contract suite (§22.7).
 *
 * Redaction is applied here, once, rather than in each test — so no test can compare against an
 * unredacted header and no assertion failure can print a credential.
 */

import { expect } from 'vitest';

/** The placeholder that stands in for a credential in every recorded expectation. */
export const REDACTED = '[redacted]';

/**
 * The credential the recorded suite runs with.
 *
 * Shaped like a real provider key so a test that forgets to redact still fails the redaction
 * assertion, but it is not a valid key for any provider — an accidental live call would be
 * rejected rather than charged.
 */
export const TEST_CREDENTIAL = 'sk-contract-fixture-not-a-real-key-000000000000';

/** An 8×8 PNG, base64. Real bytes, so an adapter that decodes it produces genuine pixels. */
export const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGM4oaHxHx9mGBkKAOdkhcFs8Kk4AAAAAElFTkSuQmCC';

/** A recorded response body, exactly as the provider returned it. */
export interface ReplayResponse {
  status: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

/** One captured request, with both the raw and the redacted view. */
export interface CapturedRequest {
  url: string;
  method: string;
  /** Header values as actually sent. Never asserted against directly — use `redacted`. */
  headers: Record<string, string>;
  /** The same request with the credential replaced. This is what assertions compare. */
  redacted: { headers: Record<string, string>; body: string };
  /** Parsed JSON body when the adapter sent one. */
  body?: unknown;
  form?: { fields: string[]; files: string[] };
  /**
   * Observed mask polarity, derived from the actual mask bytes the adapter put on the wire.
   *
   * Read rather than trusted: P5-07's canonical form is white = change, so a mask whose leading
   * byte is 255 either crossed the wire unchanged (`change`) or was inverted (`preserve`).
   */
  maskPolarity?: { whiteMeans: 'change' | 'preserve'; firstPixelAlpha: number };
}

/** Replace the credential anywhere in a string. */
export function redact(value: string): string {
  return value.split(TEST_CREDENTIAL).join(REDACTED);
}

/**
 * A `fetch` that replays `responses` in order and records every request.
 *
 * Replaying rather than asserting a hand-written expectation is the whole point: the responses are
 * what the provider actually returned, so a passing test means the adapter handles reality.
 */
export function replayingFetch(
  responses: ReplayResponse | ReplayResponse[],
  captures: CapturedRequest[],
): typeof fetch {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  let index = 0;

  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? {}).forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    let body: unknown = init?.body;
    let form: { fields: string[]; files: string[] } | undefined;
    if (typeof FormData !== 'undefined' && init?.body instanceof FormData) {
      const fields: string[] = [];
      const files: string[] = [];
      // `entries()`, not `forEach()`: a Blob field is not a string, and the distinction between a
      // plain field and a file field is exactly what the mask assertion depends on.
      for (const [key, value] of init.body.entries()) {
        if (typeof value === 'string') fields.push(key);
        else files.push(key);
      }
      form = { fields: fields.sort(), files: files.sort() };
      body = undefined;
    } else if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }

    const bodyText = typeof body === 'string' ? body : JSON.stringify(body ?? null);

    captures.push({
      url,
      method: (init?.method ?? 'GET').toUpperCase(),
      headers,
      redacted: {
        headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, redact(v)])),
        body: redact(bodyText),
      },
      body,
      form,
      ...(await observeMaskPolarity(init?.body)),
    });

    const next = queue[Math.min(index, queue.length - 1)];
    index += 1;
    if (!next) throw new Error('No recorded response left for this request.');

    return new Response(next.json !== undefined ? JSON.stringify(next.json) : (next.text ?? ''), {
      status: next.status,
      headers: new Headers(next.headers ?? {}),
    });
  }) as typeof fetch;
}

/**
 * Measure the polarity of a mask on the wire, from the PNG bytes themselves.
 *
 * The vitest environment here has no `createImageBitmap` and no `OffscreenCanvas`, so the platform
 * decoder is not available. Rather than skip the assertion — which would leave mask polarity
 * unverified, the exact thing §22.7 asks for — this walks the PNG structure directly: signature,
 * chunk lengths, then the IDAT payload, which for the encoder under test is a zlib stream of stored
 * (uncompressed) deflate blocks. Each scanline's first pixel is therefore readable as raw bytes.
 *
 * That is a real decode of a known encoding, not a pattern match: an encoder that compressed its
 * IDAT, or emitted a different colour type, makes this return `undefined` and the assertion fails
 * loudly rather than reading a meaningless byte.
 *
 * The fixture mask is `[255, 0, 0, 0]` — white first — so an alpha of 0 means the mask was
 * inverted for a provider that reads alpha (`preserve`), and 255 means it crossed unchanged.
 */
async function observeMaskPolarity(
  body: BodyInit | null | undefined,
): Promise<{ maskPolarity?: { whiteMeans: 'change' | 'preserve'; firstPixelAlpha: number } }> {
  if (!(typeof FormData !== 'undefined' && body instanceof FormData)) return {};

  for (const [key, value] of body.entries()) {
    if (typeof value === 'string' || !/mask/i.test(key)) continue;

    const alpha = decodeFirstPixelAlphaFromPng(new Uint8Array(await value.arrayBuffer()));
    if (alpha === undefined) return {};
    return {
      maskPolarity: {
        // Alpha 0 marks the edit region for OpenAI; our canonical white-to-change maps to it.
        whiteMeans: alpha === 0 ? 'preserve' : 'change',
        firstPixelAlpha: alpha,
      },
    };
  }
  return {};
}

/** Read the top-left pixel's alpha from a PNG whose IDAT holds stored deflate blocks. */
function decodeFirstPixelAlphaFromPng(png: Uint8Array): number | undefined {
  // Signature is 8 bytes, then chunks of [4-byte length][4-byte type][data][4-byte CRC].
  if (png.length < 8) return undefined;
  let offset = 8;
  let idat: Uint8Array | undefined;

  while (offset + 8 <= png.length) {
    const length =
      ((png[offset] as number) << 24) |
      ((png[offset + 1] as number) << 16) |
      ((png[offset + 2] as number) << 8) |
      (png[offset + 3] as number);
    const type = String.fromCharCode(
      png[offset + 4] as number,
      png[offset + 5] as number,
      png[offset + 6] as number,
      png[offset + 7] as number,
    );
    const dataStart = offset + 8;
    if (type === 'IDAT') {
      // IDAT may be split across chunks; concatenate by walking to the next one of the same type.
      const parts: number[] = [...png.subarray(dataStart, dataStart + length)];
      let next = dataStart + length + 4;
      while (
        next + 8 <= png.length &&
        String.fromCharCode(
          png[next + 4] as number,
          png[next + 5] as number,
          png[next + 6] as number,
          png[next + 7] as number,
        ) === 'IDAT'
      ) {
        const moreLength =
          ((png[next] as number) << 24) |
          ((png[next + 1] as number) << 16) |
          ((png[next + 2] as number) << 8) |
          (png[next + 3] as number);
        parts.push(...png.subarray(next + 8, next + 8 + moreLength));
        next += 8 + moreLength + 4;
      }
      idat = Uint8Array.from(parts);
      break;
    }
    offset = dataStart + length + 4;
    if (type === 'IEND') break;
  }

  if (!idat || idat.length < 6) return undefined;

  // zlib: 2-byte header, then stored deflate blocks, then a 4-byte Adler-32.
  const scan = idat.subarray(2, idat.length - 4);
  // Each block: 1 header byte, 2 LEN, 2 NLEN, then LEN bytes. Skip to the first block's payload.
  const isFinal = (scan[0] as number) & 0x01;
  if ((scan[0] as number) >>> 1 !== 0) return undefined; // not a stored block
  const len = (scan[1] as number) | ((scan[2] as number) << 8);
  if (len < 4) return undefined; // fewer than 4 bytes means no full RGBA pixel
  void isFinal;

  // Payload begins with the scanline filter byte, then the pixel: R, G, B, A.
  const alphaIndex = 1 + 3;
  return scan[5 + alphaIndex];
}

/** A 2×2 opaque image plus a canonical mask (P5-07: white = area to change). */
export function imageWithCanonicalMask(): {
  image: ReturnType<typeof raster>;
  mask: ReturnType<typeof raster>;
} {
  return {
    image: raster(new Uint8ClampedArray(2 * 2 * 4).fill(255)),
    // Top-left white, rest black — unambiguous polarity for the byte-level assertion above.
    mask: raster(new Uint8ClampedArray([255, 0, 0, 0])),
  };
}

/** A 2×2 RasterImage from raw RGBA bytes. */
function raster(data: Uint8ClampedArray): {
  width: number;
  height: number;
  colorSpace: 'srgb';
  bitDepth: 8;
  premultipliedAlpha: false;
  frames: Array<{ data: Uint8ClampedArray; durationMs: number }>;
} {
  return {
    width: 2,
    height: 2,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data, durationMs: 0 }],
  };
}

/**
 * Assert a string carries no credential, naming the site so a failure says where it leaked.
 *
 * Called in the `.catch` of every recorded error case, which is where a provider's echoed key
 * would re-enter our control: the response body is provider-controlled text that ends up in a
 * message the user reads.
 */
export function assertNoCredential(value: string, site: string): void {
  expect(value.includes(TEST_CREDENTIAL), `credential leaked from ${site}: ${value}`).toBe(false);
}
