/**
 * P4-11 — Shadow synthesis (clear, no patent dependency).
 * Blurred, sheared, tinted alpha projection per README §28.6.
 */
export interface ShadowSynthesisOptions {
  readonly alphaMatte: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly blurRadius?: number; // px approximation
  readonly shearX?: number; // % of width
  readonly shearY?: number; // % of height
  readonly tintColor?: { r: number; g: number; b: number };
  readonly opacity?: number; // 0..1
}

export function synthesizeShadow(opts: ShadowSynthesisOptions): Uint8ClampedArray {
  const w = opts.width;
  const h = opts.height;
  const pixelCount = w * h * 4;
  const tint = opts.tintColor ?? { r: 30, g: 30, b: 45 };
  const opacity = opts.opacity ?? 0.35;
  const blurApprox = opts.blurRadius ?? 8;

  const out = new Uint8ClampedArray(pixelCount);
  // Initialize transparent
  for (let i = 3; i < pixelCount; i += 4) {
    out[i] = 0;
  }

  // Simple projection: sample alpha, project with shear + blur approximation,
  // tint with reduced opacity. This is the documented heuristic.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIdx = (y * w + x) * 4 + 3;
      const alphaValue = opts.alphaMatte[srcIdx] ?? 0;
      if (alphaValue <= 10) continue; // near-transparent, skip

      // Shear offset (heuristic)
      const shearX = Math.round(((opts.shearX ?? 10) / 100) * w);
      const shearY = Math.round(((opts.shearY ?? 5) / 100) * h);
      const projX = Math.min(w - 1, Math.max(0, x + shearX));
      const projY = Math.min(h - 1, Math.max(0, y + shearY));

      // Projection computed; dstIdx reserved for direct projection mode
      // Blur approximation: spread alpha to nearby pixels via small radius
      const radius = Math.min(blurApprox, Math.min(w, h) / 4);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = Math.min(h - 1, Math.max(0, projY + dy));
          const nx = Math.min(w - 1, Math.max(0, projX + dx));
          const dIdx = (ny * w + nx) * 4;
          const existing = out[dIdx + 3] ?? 0;
          const newAlpha = Math.round(
            alphaValue * opacity * (1 - Math.abs(dx) / radius) * (1 - Math.abs(dy) / radius),
          );
          out[dIdx] = Math.round(tint.r * opacity);
          out[dIdx + 1] = Math.round(tint.g * opacity);
          out[dIdx + 2] = Math.round(tint.b * opacity);
          out[dIdx + 3] = Math.min(255, Math.max(existing, newAlpha));
        }
      }
    }
  }
  return out;
}
