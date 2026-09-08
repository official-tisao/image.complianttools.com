import type { BlendMode } from './types.js';

export function blendPixels(
  base: Uint8ClampedArray,
  overlay: Uint8ClampedArray,
  blend: BlendMode,
  opacity: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(base.length);
  const a = Math.max(0, Math.min(1, opacity));
  for (let i = 0; i < base.length; i += 4) {
    const rb = base[i];
    const gb = base[i + 1];
    const bb = base[i + 2];
    const ro = overlay[i];
    const go = overlay[i + 1];
    const bo = overlay[i + 2];
    let r = rb, g = gb, bVal = bb;
    switch (blend) {
      case 'multiply':
        r = (rb * ro) / 255; g = (gb * go) / 255; bVal = (bb * bo) / 255;
        break;
      case 'screen':
        r = 255 - ((255 - rb) * (255 - ro)) / 255;
        g = 255 - ((255 - gb) * (255 - go)) / 255;
        bVal = 255 - ((255 - bb) * (255 - bo)) / 255;
        break;
      case 'overlay':
        r = rb < 128 ? (2 * rb * ro) / 255 : 255 - (2 * (255 - rb) * (255 - ro)) / 255;
        g = gb < 128 ? (2 * gb * go) / 255 : 255 - (2 * (255 - gb) * (255 - go)) / 255;
        bVal = bb < 128 ? (2 * bb * bo) / 255 : 255 - (2 * (255 - bb) * (255 - bo)) / 255;
        break;
      case 'soft-light':
        r = ro < 128 ? (rb * ro) / 255 + (rb * (255 - ro)) / 510 : 255 - ((255 - rb) * (255 - ro)) / 255;
        g = go < 128 ? (gb * go) / 255 + (gb * (255 - go)) / 510 : 255 - ((255 - gb) * (255 - go)) / 255;
        bVal = bo < 128 ? (bb * bo) / 255 + (bb * (255 - bo)) / 510 : 255 - ((255 - bb) * (255 - bo)) / 255;
        break;
      case 'difference':
        r = Math.abs(rb - ro);
        g = Math.abs(gb - go);
        bVal = Math.abs(bb - bo);
        break;
      case 'normal':
      default:
        r = ro; g = go; bVal = bo;
        break;
    }
    // Apply opacity blend (simple lerp for v1)
    const rf = Math.round(r * a + rb * (1 - a));
    const gf = Math.round(g * a + gb * (1 - a));
    const bf = Math.round(bVal * a + bb * (1 - a));
    out[i] = Math.min(255, Math.max(0, Math.round(rf)));
    out[i + 1] = Math.min(255, Math.max(0, Math.round(gf)));
    out[i + 2] = Math.min(255, Math.max(0, Math.round(bf)));
    out[i + 3] = base[i + 3]; // preserve alpha for v1
  }
  return out;
}
