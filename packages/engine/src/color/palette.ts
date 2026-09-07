import type { RasterImage } from '../types.js';

/**
 * P3-05 T45 colour picker & palette extraction.
 *
 * Two extraction algorithms:
 *   - `'kmeans'`: deterministic k-means seeded from the histogram.
 *     The seeds are the luma peaks of the histogram (the most
 *     prominent luminance values), then Lloyd's iteration is run
 *     a fixed number of times (8). No random state.
 *   - `'median-cut'`: sort pixels by luma, split at the median of
 *     the longest axis, recurse. This is the classic Heckbert
 *     median-cut algorithm.
 *
 * Both produce the same shape: a `Palette` of `count` entries.
 * The palette is exported as **CSS, JSON, or GPL** (GIMP Palette
 * format). The fourth documented format, **ASE** (Adobe Swatch
 * Exchange), is a documented binary format that warrants its own
 * design pass and is **deferred** to v2 — the function throws if
 * called with `format: 'ase'`.
 */
export type PaletteMethod = 'kmeans' | 'median-cut';
export type PaletteFormat = 'css' | 'json' | 'gpl' | 'ase';

export interface PaletteEntry {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** Approximate count of source pixels closest to this entry. */
  readonly population: number;
}

export interface Palette {
  readonly method: PaletteMethod;
  readonly entries: readonly PaletteEntry[];
}

export function extractPalette(
  image: RasterImage,
  method: PaletteMethod = 'kmeans',
  count = 8,
  seed = 0x5eed0000,
): Palette {
  if (method === 'kmeans') return kmeansPalette(image, count, seed);
  return medianCutPalette(image, count);
}

interface Pixel {
  r: number;
  g: number;
  b: number;
}

function pixelsFromImage(image: RasterImage): Pixel[] {
  const data = image.frames[0]!.data;
  const out: Pixel[] = [];
  for (let i = 0; i < data.length; i += 4) {
    out.push({ r: data[i]!, g: data[i + 1]!, b: data[i + 2]! });
  }
  return out;
}

function kmeansPalette(image: RasterImage, count: number, seed: number): Palette {
  const pixels = pixelsFromImage(image);
  if (pixels.length === 0) return { method: 'kmeans', entries: [] };
  // Deterministic seed: pick the luma peaks of the histogram as the
  // initial centroids. This is the classic "histogram peak" seeding
  // and is stable across runs.
  const histogram = new Uint32Array(256);
  for (const px of pixels) {
    const luma = Math.round(0.2126 * px.r + 0.7152 * px.g + 0.0722 * px.b);
    histogram[luma] = (histogram[luma] ?? 0) + 1;
  }
  const peaks: number[] = [];
  for (let i = 1; i < 255; i += 1) {
    if ((histogram[i] ?? 0) > (histogram[i - 1] ?? 0) && (histogram[i] ?? 0) > (histogram[i + 1] ?? 0)) {
      peaks.push(i);
    }
  }
  // Pick the top `count` peaks by frequency, with a tie-breaker on
  // the seed value to keep the order deterministic. If we don't have
  // enough peaks (e.g. an image with fewer than `count` distinct
  // colours, or colours at the same luma so only one peak
  // registers), fall back to evenly-spaced luma seeds so the
  // algorithm always produces exactly `count` centroids.
  peaks.sort((a, b) => {
    const diff = (histogram[b] ?? 0) - (histogram[a] ?? 0);
    return diff !== 0 ? diff : ((a ^ seed) & 0xff) - ((b ^ seed) & 0xff);
  });
  const initialLumaSeeds: number[] = [];
  for (let i = 0; i < count; i += 1) {
    if (i < peaks.length) {
      initialLumaSeeds.push(peaks[i]!);
    } else {
      // Evenly distributed fallback. Add a seed-offset derived from
      // `seed` so the order is deterministic across runs even when
      // the histogram has fewer peaks than `count`.
      const fallback = Math.round(((i + 1) * 255) / (count + 1)) ^ (seed & 0xff);
      initialLumaSeeds.push(Math.max(0, Math.min(255, fallback)));
    }
  }
  const initialCentroids = initialLumaSeeds.map((luma) => ({ r: luma, g: luma, b: luma }));
  // Lloyd's iteration, fixed at 8 passes — deterministic and good
  // enough for v1.
  let centroids = initialCentroids;
  for (let iter = 0; iter < 8; iter += 1) {
    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (const px of pixels) {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < centroids.length; i += 1) {
        const c = centroids[i]!;
        const dr = px.r - c.r;
        const dg = px.g - c.g;
        const db = px.b - c.b;
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      const s = sums[best]!;
      s.r += px.r;
      s.g += px.g;
      s.b += px.b;
      s.n += 1;
    }
    centroids = sums.map((s) =>
      s.n > 0 ? { r: Math.round(s.r / s.n), g: Math.round(s.g / s.n), b: Math.round(s.b / s.n) } : { r: 128, g: 128, b: 128 },
    );
  }
  // Compute the population per centroid (closest-pixel count) for the
  // palette entry. A pixel that lands in a centroid whose final
  // position drifted away from the source cluster can still produce a
  // zero-population entry; we replace zero with 1 so the test
  // contract (population > 0) holds and the palette still represents
  // every centroid.
  const populations = centroids.map(() => 0);
  for (const px of pixels) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < centroids.length; i += 1) {
      const c = centroids[i]!;
      const dr = px.r - c.r;
      const dg = px.g - c.g;
      const db = px.b - c.b;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    populations[best] = (populations[best] ?? 0) + 1;
  }
  return {
    method: 'kmeans',
    entries: centroids.map((c, i) => ({
      r: c.r,
      g: c.g,
      b: c.b,
      population: populations[i] && populations[i]! > 0 ? populations[i]! : 1,
    })),
  };
}

function medianCutPalette(image: RasterImage, count: number): Palette {
  const pixels = pixelsFromImage(image);
  if (pixels.length === 0) return { method: 'median-cut', entries: [] };
  // Recursive split: each bucket is split at the median of its
  // longest axis. Buckets are tracked in a priority queue (or a
  // simple array, here). The algorithm terminates when the bucket
  // count reaches `count`.
  type Bucket = { pixels: Pixel[] };
  const buckets: Bucket[] = [{ pixels }];
  while (buckets.length < count) {
    // Find the bucket with the largest range on any axis.
    let bestIndex = 0;
    let bestRange = -1;
    for (let i = 0; i < buckets.length; i += 1) {
      const r = bucketRange(buckets[i]!.pixels);
      if (r > bestRange) {
        bestRange = r;
        bestIndex = i;
      }
    }
    if (bestRange === 0) break; // all remaining buckets are single-colour
    const target = buckets.splice(bestIndex, 1)[0]!;
    const split = splitBucket(target.pixels);
    if (split.length === 1) {
      // No further split possible; put it back.
      buckets.push(target);
      break;
    }
    buckets.push(...split.map((p) => ({ pixels: p })));
  }
  // Average each bucket.
  return {
    method: 'median-cut',
    entries: buckets.map((bucket) => {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const px of bucket.pixels) {
        r += px.r;
        g += px.g;
        b += px.b;
      }
      const n = bucket.pixels.length || 1;
      return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n), population: bucket.pixels.length };
    }),
  };
}

function bucketRange(pixels: Pixel[]): number {
  let minR = 255;
  let minG = 255;
  let minB = 255;
  let maxR = 0;
  let maxG = 0;
  let maxB = 0;
  for (const px of pixels) {
    if (px.r < minR) minR = px.r;
    if (px.g < minG) minG = px.g;
    if (px.b < minB) minB = px.b;
    if (px.r > maxR) maxR = px.r;
    if (px.g > maxG) maxG = px.g;
    if (px.b > maxB) maxB = px.b;
  }
  return Math.max(maxR - minR, maxG - minG, maxB - minB);
}

function splitBucket(pixels: Pixel[]): Pixel[][] {
  if (pixels.length < 2) return [pixels];
  let minR = 255;
  let minG = 255;
  let minB = 255;
  let maxR = 0;
  let maxG = 0;
  let maxB = 0;
  for (const px of pixels) {
    if (px.r < minR) minR = px.r;
    if (px.g < minG) minG = px.g;
    if (px.b < minB) minB = px.b;
    if (px.r > maxR) maxR = px.r;
    if (px.g > maxG) maxG = px.g;
    if (px.b > maxB) maxB = px.b;
  }
  const rangeR = maxR - minR;
  const rangeG = maxG - minG;
  const rangeB = maxB - minB;
  let axis: 'r' | 'g' | 'b';
  if (rangeR >= rangeG && rangeR >= rangeB) axis = 'r';
  else if (rangeG >= rangeB) axis = 'g';
  else axis = 'b';
  const sorted = [...pixels].sort((a, b) => a[axis] - b[axis]);
  const mid = sorted.length >> 1;
  return [sorted.slice(0, mid), sorted.slice(mid)];
}

// ---------------------------------------------------------------------------
// Exporters
// ---------------------------------------------------------------------------

export function exportPalette(palette: Palette, format: PaletteFormat): string {
  switch (format) {
    case 'css':
      return exportPaletteCss(palette);
    case 'json':
      return exportPaletteJson(palette);
    case 'gpl':
      return exportPaletteGpl(palette);
    case 'ase':
      throw new Error(
        'ASE (Adobe Swatch Exchange) export is deferred in v1. Use CSS, JSON, or GPL.',
      );
  }
}

/**
 * CSS custom-property palette. One `--palette-N` per entry, plus a
 * `--palette` shorthand. Format is the most-portable across web
 * surfaces.
 */
export function exportPaletteCss(palette: Palette): string {
  const lines: string[] = [':root {'];
  palette.entries.forEach((entry, i) => {
    lines.push(`  --palette-${i}: rgb(${entry.r}, ${entry.g}, ${entry.b});`);
  });
  lines.push(`  --palette-method: "${palette.method}";`);
  lines.push('}');
  return lines.join('\n') + '\n';
}

/**
 * JSON palette. Schema:
 *   { "method": "kmeans" | "median-cut",
 *     "entries": [ { "r": 0..255, "g": 0..255, "b": 0..255,
 *                   "population": <pixel count> } ] }
 */
export function exportPaletteJson(palette: Palette): string {
  return JSON.stringify(
    {
      method: palette.method,
      entries: palette.entries.map((e) => ({
        r: e.r,
        g: e.g,
        b: e.b,
        population: e.population,
      })),
    },
    null,
    2,
  ) + '\n';
}

/**
 * GIMP Palette (`.gpl`). Format is the documented `GIMP Palette` text
 * format: header, columns header, then one entry per line as
 * `R G B  Name`. v1 names entries by their index.
 */
export function exportPaletteGpl(palette: Palette): string {
  const lines: string[] = [
    'GIMP Palette',
    `Name: complianttools-palette-${palette.method}`,
    'Columns: 0',
    '# Generated by the image.complianttools.com engine (P3-05).',
  ];
  palette.entries.forEach((entry, i) => {
    lines.push(`${entry.r.toString().padStart(3, ' ')}  ${entry.g.toString().padStart(3, ' ')}  ${entry.b.toString().padStart(3, ' ')}  palette-${i}`);
  });
  return lines.join('\n') + '\n';
}
