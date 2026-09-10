/**
 * P3-08 T49 Typography — stroke, shadow, curve, arc helpers.
 */

export function applyStroke(options: { width: number; color: string } | undefined): { enabled: boolean; width: number; color: string } {
  return options ? { enabled: true, width: options.width || 1, color: options.color || '#000000' } : { enabled: false, width: 0, color: '#000000' };
}

export interface ShadowOptions {
  x?: number;
  y?: number;
  blur?: number;
  color?: string;
}

export function buildShadow(options: ShadowOptions | undefined) {
  return options ? { enabled: true, ...options } : { enabled: false, x: 0, y: 0, blur: 0, color: '#000000' };
}

/** Curve helper: returns a simple quadratic curve point array for demonstration. */
export function curvePoints(start: [number, number], end: [number, number], steps = 8): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = start[0] + (end[0] - start[0]) * t;
    const y = start[1] + (end[1] - start[1]) * t;
    pts.push([Math.round(x), Math.round(y)]);
  }
  return pts;
}

/** Arc helper: returns points approximating an arc segment. */
export function arcPoints(cx: number, cy: number, r: number, startAngle: number, endAngle: number, steps = 12): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = startAngle + ((endAngle - startAngle) * i) / steps;
    const rad = (t * Math.PI) / 180;
    pts.push([Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad))]);
  }
  return pts;
}
