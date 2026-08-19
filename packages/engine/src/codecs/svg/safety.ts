export const SVG_EXTERNAL_REFERENCE_MESSAGE =
  'SVG files with external references are refused because local processing must not fetch network resources.';

/** Rejects network-bearing SVG constructs before the document is handed to a renderer. */
export function assertSafeSvg(input: string | Uint8Array): string {
  const source = typeof input === 'string' ? input : new TextDecoder().decode(input);
  if (!/^\s*<svg(?:\s|>)/iu.test(source)) throw new Error('Input is not an SVG document.');
  const externalReference =
    /(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|file:|data:(?!image\/(?:png|jpeg|gif|webp);base64,))/iu;
  if (externalReference.test(source)) throw new Error(SVG_EXTERNAL_REFERENCE_MESSAGE);
  if (/<(?:script|foreignObject)\b/iu.test(source))
    throw new Error('SVG scripts and embedded documents are not supported.');
  return source;
}
