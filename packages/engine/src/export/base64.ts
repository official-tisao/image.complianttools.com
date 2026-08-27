import type { EngineError } from '../types.js';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export const DEFAULT_BASE64_MAX_BYTES = 10 * 1024 * 1024;
const decodeTable = new Int16Array(128).fill(-1);
for (let index = 0; index < alphabet.length; index += 1)
  decodeTable[alphabet.charCodeAt(index)] = index;

function encodeBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = '';
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset]!;
    const second = bytes[offset + 1];
    const third = bytes[offset + 2];
    chunk += alphabet[first >>> 2];
    chunk += alphabet[((first & 3) << 4) | ((second ?? 0) >>> 4)];
    chunk += second === undefined ? '=' : alphabet[((second & 15) << 2) | ((third ?? 0) >>> 6)];
    chunk += third === undefined ? '=' : alphabet[third & 63];
    if (chunk.length >= 32_768) {
      parts.push(chunk);
      chunk = '';
    }
  }
  parts.push(chunk);
  return parts.join('');
}

/** Encodes bounded local bytes as a data URL without DOM or platform Base64 globals. */
export function encodeBase64DataUrl(
  input: ArrayBuffer | Uint8Array,
  mimeType = 'application/octet-stream',
  maxBytes = DEFAULT_BASE64_MAX_BYTES,
): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
    throw new RangeError('Base64 byte limit must be a non-negative safe integer.');
  if (!/^[a-z][a-z0-9!#$&^_.+-]*\/[a-z0-9!#$&^_.+-]+$/iu.test(mimeType))
    throw {
      kind: 'unsupported-format',
      format: mimeType,
      remedy: 'Choose a file with a valid MIME media type, or use application/octet-stream.',
    } satisfies EngineError;
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > maxBytes)
    throw {
      kind: 'dimension-limit',
      limit: maxBytes,
      actual: bytes.byteLength,
      remedy: `Choose a file no larger than ${maxBytes.toLocaleString('en-US')} bytes.`,
    } satisfies EngineError;
  return `data:${mimeType};base64,${encodeBase64(bytes)}`;
}

export interface DecodedBase64DataUrl {
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

/** Strictly decodes a bounded Base64 data URL without accepting whitespace or noncanonical padding. */
export function decodeBase64DataUrl(
  dataUrl: string,
  maxBytes = DEFAULT_BASE64_MAX_BYTES,
): DecodedBase64DataUrl {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
    throw new RangeError('Base64 byte limit must be a non-negative safe integer.');
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/u.exec(dataUrl);
  if (!match || match[2]!.length % 4 !== 0)
    throw {
      kind: 'decode-failed',
      format: 'base64-data-url',
      detail: 'The value is not a canonical Base64 data URL.',
      remedy: 'Paste a complete data:<mime>;base64,... URL with no spaces or line breaks.',
    } satisfies EngineError;
  const mimeType = match[1]!;
  if (!/^[a-z][a-z0-9!#$&^_.+-]*\/[a-z0-9!#$&^_.+-]+$/iu.test(mimeType))
    throw {
      kind: 'unsupported-format',
      format: mimeType,
      remedy: 'Use a data URL with a valid MIME media type.',
    } satisfies EngineError;
  const payload = match[2]!;
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  const decodedLength = (payload.length / 4) * 3 - padding;
  if (decodedLength > maxBytes)
    throw {
      kind: 'dimension-limit',
      limit: maxBytes,
      actual: decodedLength,
      remedy: `Paste a data URL that decodes to no more than ${maxBytes.toLocaleString('en-US')} bytes.`,
    } satisfies EngineError;
  const bytes = new Uint8Array(decodedLength);
  let target = 0;
  for (let offset = 0; offset < payload.length; offset += 4) {
    const a = decodeTable[payload.charCodeAt(offset)]!;
    const b = decodeTable[payload.charCodeAt(offset + 1)]!;
    const c = payload[offset + 2] === '=' ? 0 : decodeTable[payload.charCodeAt(offset + 2)]!;
    const d = payload[offset + 3] === '=' ? 0 : decodeTable[payload.charCodeAt(offset + 3)]!;
    if (
      a < 0 ||
      b < 0 ||
      c < 0 ||
      d < 0 ||
      (offset + 4 < payload.length && payload.includes('=', offset))
    )
      throw {
        kind: 'decode-failed',
        format: 'base64-data-url',
        detail: 'The Base64 payload contains invalid characters or padding.',
        remedy: 'Paste an unmodified Base64 data URL and try again.',
      } satisfies EngineError;
    if (target < bytes.length) bytes[target++] = (a << 2) | (b >>> 4);
    if (target < bytes.length) bytes[target++] = ((b & 15) << 4) | (c >>> 2);
    if (target < bytes.length) bytes[target++] = ((c & 3) << 6) | d;
  }
  if (
    (padding === 2 && (decodeTable[payload.charCodeAt(payload.length - 3)]! & 15) !== 0) ||
    (padding === 1 && (decodeTable[payload.charCodeAt(payload.length - 2)]! & 3) !== 0)
  )
    throw {
      kind: 'decode-failed',
      format: 'base64-data-url',
      detail: 'The Base64 payload has noncanonical padding bits.',
      remedy: 'Regenerate the Base64 data URL from the original file.',
    } satisfies EngineError;
  return { mimeType, bytes };
}

export function base64DataUrlSnippets(dataUrl: string): {
  readonly html: string;
  readonly css: string;
} {
  // Validation constrains the string to a quote-free data URL before it is embedded in snippets.
  decodeBase64DataUrl(dataUrl);
  return {
    html: `<img src="${dataUrl}" alt="">`,
    css: `background-image: url("${dataUrl}");`,
  };
}
