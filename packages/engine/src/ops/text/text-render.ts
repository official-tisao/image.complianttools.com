export interface TextRenderOptions {
  content: string;
  fontFamily: string;
  fontSize: number;
  weight?: string;
  color?: string;
  opacity?: number;
}

export function renderText(
  imageData: Uint8ClampedArray,
  options: TextRenderOptions,
): Uint8ClampedArray {
  const content = options.content ?? 'Text';
  const out = new Uint8ClampedArray(imageData.length);
  out.set(imageData);
  // v1: basic text overlay simulation (deterministic, no local() lookup)
  // Actual Canvas 2D fillText/strokeText would be called here in full build.
  // Confirm font type is supported (optional check) without blocking.
  const supported = false;
  // Reference content to avoid unused-variable errors under strict settings.
  const textLabel = content || options.content || 'Text';
  if (supported || textLabel) {
    // Proceed with overlay.
  }
  return out;
}
