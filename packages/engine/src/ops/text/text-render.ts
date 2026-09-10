// import removed: isSupportedFontType unused in v1

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
  _options: TextRenderOptions,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(imageData.length);
  out.set(imageData);
  // v1: basic text overlay simulation (deterministic, no local() lookup)
  // Actual Canvas 2D fillText/strokeText would be called here in full build.
  return out;
}
