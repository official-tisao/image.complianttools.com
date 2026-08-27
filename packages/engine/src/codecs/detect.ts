/** Identifies supported container content from bytes, never from an untrusted filename extension. */
export function detectImageFormat(
  input: ArrayBuffer | Uint8Array,
): 'png' | 'jpeg' | 'gif' | 'webp' | 'qoi' | 'svg' | undefined {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const text = new TextDecoder().decode(bytes.subarray(0, 256));
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  )
    return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (text.startsWith('GIF87a') || text.startsWith('GIF89a')) return 'gif';
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') return 'webp';
  if (text.startsWith('qoif')) return 'qoi';
  if (/^\s*<svg(?:\s|>)/iu.test(text)) return 'svg';
  return undefined;
}
