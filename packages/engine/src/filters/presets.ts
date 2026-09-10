import type { RasterImage } from '../types.js';
import { getFilter } from './framework.js';

/**
 * A single step in a preset. It names a registered filter and a partial set of options to
 * override the filter's `defaultOptions`. Filters not registered at preset-apply time
 * produce a thrown error — the test in `filters.test.ts` ensures every reference resolves.
 */
export interface FilterStep {
  readonly filter: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * A named filter preset. The 24 presets listed in README §6.5 are declared here as
 * declarative stacks of primitives — none reproduces a specific commercial LUT. Each
 * preset is named for its effect (e.g. "Warm Film", "Cool Film"), not for a brand.
 *
 * `description` is a one-line plain-language explanation that the UI shows before
 * anything runs (P3-13's "plain-language description rendered before anything runs"
 * requirement).
 */
export interface FilterPreset {
  readonly name: string;
  readonly description: string;
  readonly steps: readonly FilterStep[];
}

/** Registry, analogous to the filter framework's `registerFilter` / `getFilter`. */
const presetRegistry = new Map<string, FilterPreset>();

export function registerPreset(preset: FilterPreset): void {
  presetRegistry.set(preset.name, preset);
}

export function getPreset(name: string): FilterPreset | undefined {
  return presetRegistry.get(name);
}

export function getAllPresets(): readonly FilterPreset[] {
  return Array.from(presetRegistry.values());
}

export function getRegisteredPresetNames(): readonly string[] {
  return Array.from(presetRegistry.keys());
}

/**
 * Apply a preset to an image. Iterates the preset's `steps` in order, looking up each
 * filter by name and calling its `apply` function. Throws when a step references an
 * unknown filter — the test suite guards against that.
 */
export function applyPreset(image: RasterImage, preset: FilterPreset): RasterImage {
  let current = image;
  for (const step of preset.steps) {
    const filter = getFilter(step.filter);
    if (!filter) {
      throw new Error(
        `Filter preset "${preset.name}" references unregistered filter "${step.filter}".`,
      );
    }
    current = filter.apply(current, { ...filter.defaultOptions, ...(step.options ?? {}) });
  }
  return current;
}

// ---------------------------------------------------------------------------
// 24 named presets (P3-03). Names are taken verbatim from README §6.5; each is a
// small stack of 1–4 filter primitives that produces a readable look. None
// reproduces a specific commercial LUT — they are intentionally descriptive of
// their effect, not a re-skin of a known brand.
// ---------------------------------------------------------------------------

registerPreset({
  name: 'Warm Film',
  description: 'Slight sepia tint, lifted blacks, gentle saturation — an old-photo warmth.',
  steps: [
    { filter: 'sepia', options: { intensity: 0.35 } },
    { filter: 'posterize', options: { levels: 24 } },
  ],
});

registerPreset({
  name: 'Cool Film',
  description: 'Cool duotone with a slight teal cast — an overcast afternoon look.',
  steps: [
    { filter: 'duotone', options: { shadowColor: '#0a1a2a', highlightColor: '#dfe6ee', midpoint: 0.55 } },
    { filter: 'vignette', options: { amount: 0.15, midpoint: 0.5, roundness: 0.6, feather: 0.4 } },
  ],
});

registerPreset({
  name: 'Faded Matte',
  description: 'Lifted blacks, soft contrast, mild desaturation — a flat, matte finish.',
  steps: [
    { filter: 'grain', options: { amount: 8, size: 1, monochromatic: true } },
    { filter: 'sepia', options: { intensity: 0.12 } },
  ],
});

registerPreset({
  name: 'Deep Matte',
  description: 'Lowered midtones, deep blacks, slight desaturation — heavy matte.',
  steps: [
    { filter: 'sepia', options: { intensity: 0.2 } },
    { filter: 'grain', options: { amount: 12, size: 1, monochromatic: true } },
  ],
});

registerPreset({
  name: 'Soft Pastel',
  description: 'High-key, lifted shadows, pastel-leaning duotone — a soft daytime look.',
  steps: [
    { filter: 'duotone', options: { shadowColor: '#f4e6e0', highlightColor: '#fff7e6', midpoint: 0.5 } },
    { filter: 'sepia', options: { intensity: 0.08 } },
  ],
});

registerPreset({
  name: 'High Key',
  description: 'Lifted midtones, gentle highlight roll-off — a bright, airy look.',
  steps: [
    { filter: 'duotone', options: { shadowColor: '#f5f5f5', highlightColor: '#ffffff', midpoint: 0.65 } },
    { filter: 'sepia', options: { intensity: 0.05 } },
  ],
});

registerPreset({
  name: 'Low Key',
  description: 'Crushed shadows, deep contrast — a dark, dramatic look.',
  steps: [
    { filter: 'duotone', options: { shadowColor: '#000000', highlightColor: '#bbbbbb', midpoint: 0.4 } },
    { filter: 'vignette', options: { amount: 0.3, midpoint: 0.5, roundness: 0.7, feather: 0.5 } },
  ],
});

registerPreset({
  name: 'Bleach Bypass',
  description: 'High contrast with desaturated highlights — a film bleach-bypass look.',
  steps: [
    { filter: 'grayscale', options: { method: 'luminance' } },
    { filter: 'sepia', options: { intensity: 0.1 } },
  ],
});

registerPreset({
  name: 'Cross Process',
  description: 'Inverted midtone curve with a warm cast — a cross-processed slide look.',
  steps: [
    { filter: 'solarize', options: { threshold: 128 } },
    { filter: 'sepia', options: { intensity: 0.18 } },
  ],
});

registerPreset({
  name: 'Split Tone',
  description: 'Cool shadows and warm highlights — a two-tone stylised look.',
  steps: [
    { filter: 'duotone', options: { shadowColor: '#1d3557', highlightColor: '#f4a261', midpoint: 0.5 } },
  ],
});

registerPreset({
  name: 'Cold Morning',
  description: 'Cool blue cast, lifted shadows, gentle desaturation — winter morning light.',
  steps: [
    { filter: 'duotone', options: { shadowColor: '#0d1b2a', highlightColor: '#e0e1dd', midpoint: 0.55 } },
    { filter: 'sepia', options: { intensity: 0.06 } },
  ],
});

registerPreset({
  name: 'Golden Hour',
  description: 'Warm amber duotone, soft contrast — late afternoon sun.',
  steps: [
    { filter: 'duotone', options: { shadowColor: '#5c2c00', highlightColor: '#ffd9a0', midpoint: 0.5 } },
    { filter: 'sepia', options: { intensity: 0.15 } },
  ],
});

registerPreset({
  name: 'Blue Hour',
  description: 'Deep blue duotone with cool highlights — twilight.',
  steps: [
    { filter: 'duotone', options: { shadowColor: '#0a1a2f', highlightColor: '#8fa4c4', midpoint: 0.5 } },
    { filter: 'vignette', options: { amount: 0.2, midpoint: 0.5, roundness: 0.7, feather: 0.5 } },
  ],
});

registerPreset({
  name: 'Overcast',
  description: 'Flat, low-contrast, very subtle desaturation — diffuse overcast daylight.',
  steps: [
    { filter: 'sepia', options: { intensity: 0.05 } },
    { filter: 'grain', options: { amount: 6, monochromatic: true } },
  ],
});

registerPreset({
  name: 'Desert',
  description: 'Warm sand cast with strong amber midtones — dry, sun-bleached look.',
  steps: [
    { filter: 'duotone', options: { shadowColor: '#5a3a1a', highlightColor: '#f7d9a3', midpoint: 0.5 } },
    { filter: 'sepia', options: { intensity: 0.25 } },
  ],
});

registerPreset({
  name: 'Forest',
  description: 'Cool green cast, lifted shadows, deep midtones — shaded woodland.',
  steps: [
    { filter: 'duotone', options: { shadowColor: '#102016', highlightColor: '#cfe1c5', midpoint: 0.55 } },
    { filter: 'sepia', options: { intensity: 0.04 } },
  ],
});

registerPreset({
  name: 'Neon Night',
  description: 'Saturated duotone with a strong magenta/cyan split — a city-after-dark look.',
  steps: [
    { filter: 'duotone', options: { shadowColor: '#1a0033', highlightColor: '#00f5d4', midpoint: 0.5 } },
    { filter: 'posterize', options: { levels: 16 } },
  ],
});

registerPreset({
  name: 'Cyanotype',
  description: 'Monochrome duotone in deep cyan and white — a blueprint/cyanotype print.',
  steps: [
    { filter: 'duotone', options: { shadowColor: '#0b3d91', highlightColor: '#f4f8ff', midpoint: 0.55 } },
    { filter: 'sepia', options: { intensity: 0.04 } },
  ],
});

registerPreset({
  name: 'Platinum',
  description: 'Neutral monochrome with a faint warm bias — a platinum/palladium print.',
  steps: [
    { filter: 'grayscale', options: { method: 'luminance' } },
    { filter: 'sepia', options: { intensity: 0.08 } },
    { filter: 'vignette', options: { amount: 0.12, midpoint: 0.5, roundness: 0.6, feather: 0.4 } },
  ],
});

registerPreset({
  name: 'Silver Halide',
  description: 'Pure monochrome with crisp contrast — a black-and-white silver print.',
  steps: [
    { filter: 'grayscale', options: { method: 'rec601' } },
    { filter: 'posterize', options: { levels: 32 } },
  ],
});

registerPreset({
  name: 'Newsprint',
  description: 'Aggressive posterization, ordered dither — a halftone newsprint look.',
  steps: [
    { filter: 'grayscale', options: { method: 'luminance' } },
    { filter: 'posterize', options: { levels: 4 } },
    { filter: 'monochrome', options: { threshold: 128, dither: 'bayer-4x4' } },
  ],
});

registerPreset({
  name: 'Faded Poster',
  description: 'Heavy posterization, warm duotone — a worn-vintage-poster look.',
  steps: [
    { filter: 'duotone', options: { shadowColor: '#3a1a0a', highlightColor: '#f0c987', midpoint: 0.5 } },
    { filter: 'posterize', options: { levels: 8 } },
  ],
});

registerPreset({
  name: 'Slide Film',
  description: 'Saturated colours with cool shadows and warm midtones — a slide-film look.',
  steps: [
    { filter: 'duotone', options: { shadowColor: '#0b2545', highlightColor: '#f6c453', midpoint: 0.5 } },
    { filter: 'sepia', options: { intensity: 0.12 } },
  ],
});

registerPreset({
  name: 'Tungsten',
  description: 'Cool tint to balance tungsten lighting — indoor warm-light correction.',
  steps: [
    { filter: 'duotone', options: { shadowColor: '#1a2640', highlightColor: '#e0e8f0', midpoint: 0.5 } },
  ],
});
