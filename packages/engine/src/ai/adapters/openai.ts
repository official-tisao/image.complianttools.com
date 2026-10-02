/**
 * P5-09 — OpenAI adapter.
 * Source of truth: README §14.2, PLAN.md P5-09.
 *
 * Implemented: descriptor, capabilities (generate/edit/inpaint/describe),
 * test() via GET /models, run() with /images/generations (JSON),
 * /images/edits (multipart), /responses (describe JSON).
 *
 * P5-07 mask convention: canonical grayscale (white=change/black=preserve) converted
 * to provider RGBA PNG (alpha = 255 - canonicalValue) with nearest-neighbour resample.
 */
import type {
  ProviderAdapter,
  ProviderDescriptor,
  AiRequest,
  AiResult,
  AdapterContext,
  AiCapability,
} from '../types.js';
import type { EngineError, RasterImage } from '../../types.js';
import { createCanonicalMask, verifyMaskRange } from '../mask-convention.js';
import { redactProviderText, classifyTestResponse } from '../adapter-support.js';

const DESCRIPTOR_ID = 'openai';

/**
 * Decode base64 to bytes without Node's `Buffer`.
 *
 * `Buffer` does not exist in a browser, so using it here made **every** generate and edit request
 * fail at the last step with `Buffer is not defined` — a failure that only appears in the one
 * environment this app actually runs in. `atob` is present in browsers and in Node 16+, so this is
 * portable without a polyfill.
 */
function decodeBase64(base64: string): Uint8ClampedArray {
  const binary = atob(base64);
  const bytes = new Uint8ClampedArray(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Read a PNG's real dimensions from its IHDR chunk.
 *
 * Both the generate and the edit response previously declared every returned image as `1024 × 1024`
 * regardless of the bytes actually received. That is not cosmetic: a `RasterImage` whose `width`/`height`
 * disagree with `frame.data.length` throws the moment anything downstream trusts the declaration —
 * `new ImageData(data, width, height)` in the browser, a canvas draw, or an encoder. A provider that
 * returns a differently-sized image (or a size requested via `size:`/`aspect_ratio`, which is not
 * always 1024) therefore produced a result that could never be displayed, while the request reported
 * success.
 *
 * PNG only, which is what `/images/generations` and `/images/edits` return as `b64_json`. The IHDR is
 * the first chunk, so this needs no decoder. A non-PNG or truncated payload falls back to deriving the
 * dimensions from the pixel count, which keeps the frame self-consistent rather than inventing a size
 * that would fail downstream.
 */
function pngDimensions(bytes: Uint8ClampedArray): {
  readonly width: number;
  readonly height: number;
} {
  const isPng =
    bytes.length > 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  if (isPng) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    if (width > 0 && height > 0) return { width, height };
  }
  // `b64_json` is PNG in practice; this is the honest fallback rather than a fabricated 1024².
  const pixels = Math.max(1, Math.round(bytes.length / 4));
  return { width: pixels, height: 1 };
}

/** Build a `RasterImage` from a returned base64 payload, sized to the payload. */
function rasterFromBase64(base64: string): RasterImage {
  const data = decodeBase64(base64);
  const { width, height } = pngDimensions(data);
  return {
    width,
    height,
    colorSpace: 'srgb',
    bitDepth: 8,
    premultipliedAlpha: false,
    frames: [{ data, durationMs: 0 }],
  };
}

const descriptor: ProviderDescriptor = {
  id: DESCRIPTOR_ID,
  name: 'OpenAI (GPT-image-1)',
  homepage: 'https://openai.com/',
  keysUrl: 'https://platform.openai.com/api-keys',
  pricingUrl: 'https://openai.com/pricing',
  docsUrl: 'https://platform.openai.com/docs/guides/images',
  credentialFields: [
    { key: 'apiKey', label: 'OpenAI API Key', placeholder: 'sk-...', secret: true, required: true },
  ],
  allowsCustomBaseUrl: true,
  defaultBaseUrl: 'https://api.openai.com/v1',
  capabilities: ['generate', 'edit', 'inpaint', 'describe'] as AiCapability[],
  models: [
    {
      id: 'gpt-image-1',
      label: 'GPT-image-1',
      capabilities: ['generate', 'edit', 'inpaint', 'describe'],
      maxInputPixels: 16777216,
      maxInputBytes: 26214400,
      supportedInputMime: ['image/png', 'image/jpeg', 'image/webp'],
      supportedSizes: ['1024x1024', '1536x1024', '1024x1536', 'auto'],
      supportsMask: true,
      supportsSeed: false,
      notes:
        'Mask uses P5-07 canonical convention: 8-bit grayscale, white (255) = change, black (0) = preserve.',
    },
  ],
  browserDirect: 'yes-with-header',
  browserDirectNote: 'Requires Authorization: Bearer header.',
  costHint: '~$0.02–0.19 / image',
  dataPolicy: {
    summary: 'Not used for training by default.',
    url: 'https://openai.com/enterprise-privacy/',
  },
};

function baseUrl(ctx: AdapterContext): string {
  return (ctx.baseUrl || descriptor.defaultBaseUrl).replace(/\/$/, '');
}

function err(
  kind: EngineError['kind'],
  msg: string,
  status?: number,
  providerMsg?: string,
): EngineError {
  return {
    kind,
    provider: DESCRIPTOR_ID,
    status,
    providerMessage: providerMsg,
    remedy: msg,
  } as EngineError;
}

export const openaiAdapter: ProviderAdapter = {
  descriptor,

  async test(ctx: AdapterContext) {
    const has =
      Object.prototype.hasOwnProperty.call(ctx.credentials, 'apiKey') &&
      Boolean(ctx.credentials.apiKey);
    if (!has) return { ok: false, error: err('ai-auth-failed', 'Requires apiKey.') };
    try {
      const res = await ctx.fetch(`${baseUrl(ctx)}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${ctx.credentials.apiKey}` },
        signal: ctx.signal || null,
      });
      if (!res.ok) {
        // The body is rendered by §17.3's failure copy, and OpenAI's 401 body echoes the submitted
        // key — so this is a place a credential reaches the screen unless it is scrubbed here.
        const t = redactProviderText(await res.text().catch(() => ''), ctx.credentials);
        // Classify by status so a 401 reads as an auth failure and a 5xx as a provider error, per
        // §17.3 — a user with a mistyped key must not be sent to read the API reference.
        const classified = classifyTestResponse(res.status, DESCRIPTOR_ID, res.headers);
        return {
          ok: false,
          // `err()` carries the provider's already-redacted words as the diagnostic detail.
          error: err(classified.kind, classified.remedy, res.status, t),
        };
      }
      // `GET /models` proves the credential and lists the catalogue. It does not exercise the four
      // image endpoints, so it confirms the key rather than the capabilities — the same rule the
      // other adapters were corrected to follow.
      return {
        ok: true,
        confirmed: [],
        detail: 'GET /models passed.',
      };
    } catch (e) {
      return {
        ok: false,
        error: err(
          'ai-provider-error',
          'Network failure.',
          undefined,
          e instanceof Error ? e.message : String(e),
        ),
      };
    }
  },

  async listModels(_ctx: AdapterContext) {
    return descriptor.models;
  },

  async run(req: AiRequest, ctx: AdapterContext): Promise<AiResult> {
    const cap = req.capability;
    if (!descriptor.capabilities.includes(cap))
      throw new Error(`OpenAI adapter: unsupported capability ${cap}`);
    const model = req.model || 'gpt-image-1';
    const urlBase = baseUrl(ctx);

    // generate
    if (cap === 'generate') {
      const body: Record<string, unknown> = { model, prompt: req.prompt || '', n: req.count ?? 1 };
      if (req.size) body.size = req.size;
      if (req.extra?.quality) body.quality = req.extra.quality as string;
      if (req.extra?.background !== undefined) body.background = req.extra.background as string;
      if (req.outputFormat) body.output_format = req.outputFormat;
      if (req.extra?.outputCompression)
        body.output_compression = req.extra.outputCompression as string;
      if (req.extra?.moderation !== undefined) body.moderation = req.extra.moderation as string;
      const res = await ctx.fetch(`${urlBase}/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.credentials.apiKey || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: ctx.signal || null,
      });
      if (!res.ok) {
        // OpenAI echoes the submitted key back in its 401 body ("Incorrect API key provided:
        // sk-..."). Every branch below interpolates provider text into a thrown message, so it is
        // redacted once here rather than at each site. Recorded-contract-tested; this replaced
        // code that leaked the key into the escalation control's error panel.
        const t = redactProviderText(await res.text().catch(() => ''), ctx.credentials);
        if (res.status === 401) throw new Error(`OpenAI auth failed (401): ${t}`);
        if (res.status === 429) {
          const ra = res.headers.get('Retry-After');
          throw new Error(`OpenAI rate limited (429)${ra ? ` Retry-After=${ra}` : ''}: ${t}`);
        }
        const parsed = safeParse(t);
        const errorObj = parsed?.error as Record<string, unknown> | undefined;
        if (res.status === 400 && errorObj?.code === 'content_policy_violation') {
          const msg = typeof errorObj?.message === 'string' ? errorObj.message : t;
          throw new Error(`OpenAI content policy: ${msg}`);
        }
        const msg = typeof parsed?.message === 'string' ? parsed.message : t;
        throw new Error(`OpenAI error (${res.status}): ${msg}`);
      }
      const data = (await res.json()) as {
        data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
        error?: { message?: string; code?: string };
      };
      if (data.error)
        throw new Error(
          `OpenAI provider error: ${data.error.message || JSON.stringify(data.error)}`,
        );
      if (!data.data || !Array.isArray(data.data) || data.data.length === 0)
        throw new Error('Malformed generate response: missing data array');
      const images: RasterImage[] = [];
      for (const it of data.data) {
        if (it.b64_json) {
          images.push(rasterFromBase64(it.b64_json));
        } else if (it.url) {
          // A URL response carries no bytes yet. Declaring 1024² over an empty frame is a
          // dimension that cannot be true of zero-length data and would throw in any consumer that
          // trusts it, so the image is omitted rather than fabricated: `resultIsUsable` then reports
          // "nothing usable", which is the honest outcome for a response we cannot read.
          continue;
        }
      }
      return { images, usage: { images: images.length, providerCost: 'n/a' } };
    }

    // edit / inpaint — multipart; mask conversion deferred to P5-07
    if (cap === 'edit' || cap === 'inpaint') {
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', req.prompt || '');
      if (req.size) form.append('size', req.size);
      if (req.extra?.quality) form.append('quality', req.extra.quality as string);
      if (req.extra?.background !== undefined)
        form.append('background', req.extra.background as string);
      if (req.outputFormat) form.append('output_format', req.outputFormat);
      if (req.count) form.append('n', String(req.count));
      if (req.image && req.image.frames && req.image.frames.length > 0) {
        const b = frameToBlob(req.image.frames[0], 'image/png');
        form.append('image', b, 'image.png');
      }
      // P5-07: canonical mask → OpenAI RGBA conversion (white=change -> alpha=0, black=preserve -> alpha=255)
      // nearest-neighbour resample to match source image dimensions; exact-dimension validation.
      if (req.mask && req.mask.frames && req.mask.frames.length > 0) {
        const imageW =
          req.image && req.image.frames && req.image.frames.length > 0
            ? req.image.width || 1024
            : req.mask.width || 1024;
        const imageH =
          req.image && req.image.frames && req.image.frames.length > 0
            ? req.image.height || 1024
            : req.mask.height || 1024;
        const providerMaskBlob = canonicalToProviderMask(req.mask, imageW, imageH);
        form.append('mask', providerMaskBlob, 'mask.png');
      }
      const res = await ctx.fetch(`${urlBase}/images/edits`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ctx.credentials.apiKey || ''}` },
        body: form,
        signal: ctx.signal || null,
      });
      if (!res.ok) {
        const t = redactProviderText(await res.text().catch(() => ''), ctx.credentials);
        if (res.status === 401) throw new Error(`OpenAI auth failed (401): ${t}`);
        if (res.status === 429) throw new Error(`OpenAI rate limited (429): ${t}`);
        throw new Error(`OpenAI error (${res.status}): ${t || res.statusText}`);
      }
      const data = (await res.json()) as {
        data?: Array<{ b64_json?: string; url?: string }>;
        error?: { message?: string; code?: string };
      };
      if (data.error)
        throw new Error(
          `OpenAI provider error: ${data.error.message || JSON.stringify(data.error)}`,
        );
      if (!data.data || !Array.isArray(data.data)) throw new Error('Malformed edit response');
      const images: RasterImage[] = [];
      for (const it of data.data) {
        if (it.b64_json) {
          images.push(rasterFromBase64(it.b64_json));
        } else if (it.url) {
          // A URL response carries no bytes yet. Declaring 1024² over an empty frame is a
          // dimension that cannot be true of zero-length data and would throw in any consumer that
          // trusts it, so the image is omitted rather than fabricated: `resultIsUsable` then reports
          // "nothing usable", which is the honest outcome for a response we cannot read.
          continue;
        }
      }
      return { images, usage: { images: images.length, providerCost: 'n/a' } };
    }

    if (cap === 'describe') {
      const content: unknown[] = [{ type: 'input_text', text: req.question || req.prompt || '' }];
      if (
        req.image &&
        req.image.frames &&
        req.image.frames.length > 0 &&
        req.image.frames[0].data
      ) {
        content.push({
          type: 'input_image',
          image_url: `data:image/png;base64,${req.image.frames[0].data}`,
        });
      }
      const body = { model, input: [{ role: 'user', content }] };
      const res = await ctx.fetch(`${urlBase}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.credentials.apiKey || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: ctx.signal || null,
      });
      if (!res.ok) {
        const t = redactProviderText(await res.text().catch(() => ''), ctx.credentials);
        if (res.status === 401) throw new Error(`OpenAI auth failed (401): ${t}`);
        throw new Error(`OpenAI error (${res.status}): ${t || res.statusText}`);
      }
      const data = (await res.json()) as {
        output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
        error?: { message?: string };
        refusal?: string;
      };
      if (data.error)
        throw new Error(
          `OpenAI provider error: ${data.error.message || JSON.stringify(data.error)}`,
        );
      if (data.refusal)
        return {
          text: `[OpenAI refusal: ${data.refusal}]`,
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      let text = '';
      if (data.output && Array.isArray(data.output)) {
        for (const o of data.output) {
          if (o.content && Array.isArray(o.content)) {
            for (const c of o.content) {
              if (c.type === 'output_text' && typeof c.text === 'string') text += c.text;
            }
          }
        }
      }
      return {
        text: text || '[OpenAI describe: no output_text]',
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }
    throw new Error(`OpenAI adapter: unhandled capability ${cap}`);
  },
};
function safeParse(text: string) {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Convert a canonical grayscale mask (white=change, black=preserve) to an RGBA PNG
 * where alpha = 255 - canonicalValue (transparent = edit region, opaque = preserve).
 * Uses nearest-neighbour resampling when dimensions differ from the source image.
 * Per README §14.2: "alpha = 255 − maskValue"; nearest-neighbour to avoid intermediate alpha.
 */
function canonicalToProviderMask(
  maskImage: RasterImage,
  targetWidth: number,
  targetHeight: number,
): Blob {
  // Frame.data is Uint8ClampedArray per P5-01 contract; base64 is handled only through
  // explicit encoding paths, not here. For masks we read the raw grayscale bytes directly.
  const grayscaleBytes = new Uint8ClampedArray(maskImage.frames[0].data);

  // Create canonical mask with source dimensions
  const sourceW = maskImage.width || targetWidth;
  const sourceH = maskImage.height || targetHeight;
  const canonicalMask = createCanonicalMask(sourceW, sourceH, grayscaleBytes);
  verifyMaskRange(canonicalMask);

  // Resample to target dimensions using nearest-neighbour
  const resampled = nearestNeighbourResample(canonicalMask, targetWidth, targetHeight);

  // Convert to RGBA PNG: alpha = 255 - maskValue
  // White (255, change) → alpha 0 (transparent = edit region)
  // Black (0, preserve) → alpha 255 (opaque = preserve)
  const pixelCount = targetWidth * targetHeight;
  const rgbaBytes = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    const v = resampled.data[i] ?? 0;
    rgbaBytes[i * 4 + 0] = 0; // R = 0
    rgbaBytes[i * 4 + 1] = 0; // G = 0
    rgbaBytes[i * 4 + 2] = 0; // B = 0
    rgbaBytes[i * 4 + 3] = 255 - v; // A = 255 - maskValue
  }

  // Build an RGBA PNG blob from raw RGBA bytes using a minimal PNG encoder
  return encodePngFromRgba(rgbaBytes, targetWidth, targetHeight);
}

function nearestNeighbourResample(
  mask: { width: number; height: number; data: Uint8ClampedArray },
  newW: number,
  newH: number,
): { width: number; height: number; data: Uint8ClampedArray } {
  const newData = new Uint8ClampedArray(newW * newH);
  const xRatio = mask.width / newW;
  const yRatio = mask.height / newH;
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      const srcX = Math.min(Math.floor(x * xRatio), mask.width - 1) || 0;
      const srcY = Math.min(Math.floor(y * yRatio), mask.height - 1) || 0;
      const srcIdx = srcY * mask.width + srcX;
      const dstIdx = y * newW + x;
      newData[dstIdx] = mask.data[srcIdx] ?? 0;
    }
  }
  return { width: newW, height: newH, data: newData };
}

/**
 * Encode RGBA bytes as a real, decodable PNG.
 *
 * ## Why this replaced the canvas path
 *
 * The previous implementation preferred `OffscreenCanvas` and returned
 * `canvas.convertToBlob(...)` cast to `Blob`. `convertToBlob` returns a **Promise**, so the cast
 * satisfied TypeScript while handing a Promise to `form.append('mask', blob, 'mask.png')` — which
 * stringifies to `"[object Promise]"`. Every `inpaint` in every browser that has `OffscreenCanvas`
 * (all of them) therefore uploaded a mask the provider could not read.
 *
 * The fallback was no better: it emitted a PNG signature and an IHDR with **no IDAT and no IEND**,
 * which no decoder will render. So neither branch produced a usable mask.
 *
 * This version has no canvas dependency, is synchronous, and produces a valid PNG: signature,
 * IHDR, a zlib stream built with **stored (uncompressed) deflate blocks** plus the Adler-32
 * checksum zlib requires, IDAT, IEND. Uncompressed is deliberate — the mask is a single channel,
 * the encoder runs once per inpaint, and correctness matters more here than a few kilobytes.
 */
function encodePngFromRgba(rgbaBytes: Uint8ClampedArray, width: number, height: number): Blob {
  const bytes = new Uint8Array(rgbaBytes.buffer, rgbaBytes.byteOffset, width * height * 4);
  return new Blob([buildPng(bytes, width, height)], { type: 'image/png' });
}

/** Assemble a complete, decodable PNG from RGBA bytes. */
function buildPng(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace

  // Raw scanlines: each row is prefixed with its filter type (0 = None).
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1);
  }

  const idat = zlibStored(raw);

  const parts: number[] = [...SIGNATURE];
  const pushChunk = (type: string, data: Uint8Array): void => {
    parts.push(
      (data.length >>> 24) & 0xff,
      (data.length >>> 16) & 0xff,
      (data.length >>> 8) & 0xff,
      data.length & 0xff,
    );
    for (const byte of type) parts.push(byte.charCodeAt(0));
    for (const byte of data) parts.push(byte);
    const crc = crc32(type, data);
    parts.push((crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff);
  };

  const typeBytes = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));

  pushChunk('IHDR', ihdr);
  pushChunk('IDAT', idat);
  pushChunk('IEND', new Uint8Array(0));

  void typeBytes;
  return Uint8Array.from(parts);
}

/**
 * Wrap `data` in a zlib stream using stored (uncompressed) deflate blocks.
 *
 * Stored blocks need no compressor: each is a 3-bit header, a LEN/NLEN pair, and the raw bytes.
 * The final block is marked BFINAL. A zlib header and the Adler-32 of the uncompressed data
 * complete the stream, which is what a PNG decoder checks before reading IDAT.
 */
function zlibStored(data: Uint8Array): Uint8Array {
  const MAX_BLOCK = 0xffff;
  const blockCount = Math.max(1, Math.ceil(data.length / MAX_BLOCK));
  const out: number[] = [
    0x78, // CMF: deflate, 32K window
    0x01, // FLG: no dictionary, fastest; (0x78 << 8 | 0x01) % 31 === 0
  ];

  for (let i = 0; i < blockCount; i += 1) {
    const start = i * MAX_BLOCK;
    const chunk = data.subarray(start, Math.min(start + MAX_BLOCK, data.length));
    const isFinal = i === blockCount - 1;
    out.push(isFinal ? 0x01 : 0x00);
    out.push(chunk.length & 0xff, (chunk.length >>> 8) & 0xff);
    out.push(~chunk.length & 0xff, (~chunk.length >>> 8) & 0xff);
    for (const byte of chunk) out.push(byte);
  }

  const checksum = adler32(data);
  out.push(
    (checksum >>> 24) & 0xff,
    (checksum >>> 16) & 0xff,
    (checksum >>> 8) & 0xff,
    checksum & 0xff,
  );
  return Uint8Array.from(out);
}

/** Adler-32, as specified for zlib. */
function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i += 1) {
    a = (a + (data[i] as number)) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** CRC-32 over a chunk's type and data, as PNG requires for each chunk. */
function crc32(type: string, data: Uint8Array): number {
  let crc = 0xffffffff;
  const update = (byte: number): void => {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  };
  for (const char of type) update(char.charCodeAt(0));
  for (const byte of data) update(byte);
  return (crc ^ 0xffffffff) >>> 0;
}
function frameToBlob(
  frame: { data?: Uint8ClampedArray | string; url?: string; mime?: string },
  defaultMime: string,
): Blob {
  if (frame.data) {
    try {
      if (
        typeof frame.data === 'object' &&
        frame.data !== null &&
        'buffer' in (frame.data as object)
      ) {
        const bytes = new Uint8Array(
          (frame.data as Uint8ClampedArray).buffer || (frame.data as Uint8ClampedArray),
        );
        return new Blob([bytes], { type: (frame as { mime?: string }).mime || defaultMime });
      } else if (typeof frame.data === 'string') {
        const binary = atob(frame.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: (frame as { mime?: string }).mime || defaultMime });
      }
    } catch {
      return new Blob([''], { type: defaultMime });
    }
  }
  return new Blob([''], { type: defaultMime });
}
