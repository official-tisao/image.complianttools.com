import { parseRecipe, recipeSharePayload, serializeRecipe } from './serialization.js';
import type { Recipe, Step } from '../types.js';

/**
 * Output of {@link describeRecipe}. The `phrases` array is a list of short, human-readable
 * sentences (one per step) that explain what the recipe will do, in order, before any
 * pixel is touched. The `cost` field describes whether the recipe touches AI capabilities
 * that the recipient has not opted into.
 */
export interface RecipeDescription {
  readonly title: string;
  readonly summary: string;
  readonly phrases: readonly string[];
  readonly warnings: readonly string[];
  readonly cost: RecipeCost;
  readonly aiSteps: readonly number[];
  readonly stepCount: number;
}

export interface RecipeCost {
  /** True if the recipe contains any step that calls an AI provider. */
  readonly hasAi: boolean;
  /** True if the recipe would request consent before any AI call. */
  readonly requiresConsent: boolean;
  /** Estimated peak bytes the recipe will allocate while running. */
  readonly estimatedPeakBytes: number;
  /** Estimated wall-clock time, in milliseconds, on a representative mid-tier device. */
  readonly estimatedDurationMs: number;
}

interface DescribeOptions {
  /** When true, AI steps are listed even when the recipe is small. Default: true. */
  readonly includeAi?: boolean;
}

/**
 * A short, plain-language description of one step. Stable across versions so the UI can
 * render the same string the recipient sees, no matter the engine version.
 */
const STEP_PHRASES: Readonly<Record<string, string>> = {
  decode: 'Decode the source image.',
  resize: 'Resize the image to the requested dimensions.',
  crop: 'Crop the image to the selected region.',
  rotate: 'Rotate the image by the chosen angle.',
  adjust: 'Apply the requested adjustment (brightness, contrast, etc).',
  filter: 'Apply the requested filter (grayscale, sepia, etc).',
  enhance: 'Enhance the image (sharpen, denoise, etc).',
  watermark: 'Overlay the configured watermark on the image.',
  metadata: 'Strip or rewrite metadata fields.',
  mask: 'Apply a mask to the image.',
  composite: 'Composite the image over another layer.',
  ai: 'Ask the configured AI provider to transform the image.',
  custom: 'Run a custom user-defined step.',
  'pixel-local': 'Apply a fused batch of pixel-local operations in a single pass.',
  'decode-fallback': 'Decode the source using a fallback parser.',
  encode: 'Encode the final image to the export format.',
};

function describeStep(step: Step, index: number): string {
  const phrase = STEP_PHRASES[step.op] ?? `Run step ${index + 1} (${step.op}).`;
  const note = describeStepNote(step);
  return note ? `${phrase} ${note}` : phrase;
}

function describeStepNote(step: Step): string {
  const options = step.options as Record<string, unknown>;
  switch (step.op) {
    case 'resize': {
      if (typeof options.mode === 'string') {
        if (options.mode === 'percent' && typeof options.width === 'number') {
          return `Scale to ${options.width}% of the original.`;
        }
        if (options.mode === 'pixels' && typeof options.width === 'number') {
          return `Target width: ${options.width} px.`;
        }
        if (options.mode === 'fit') return 'Fit within the requested box.';
      }
      return '';
    }
    case 'rotate':
      return typeof options.degrees === 'number' ? `Rotate ${options.degrees}°.` : '';
    case 'crop':
      return 'Crop to the selected region.';
    case 'adjust':
      return summariseAdjustments(options);
    case 'filter':
      return typeof options.name === 'string' ? `Filter: ${options.name}.` : '';
    case 'enhance':
      return typeof options.kind === 'string' ? `Enhancement: ${options.kind}.` : '';
    case 'metadata':
      return typeof options.policy === 'string' ? `Metadata policy: ${options.policy}.` : '';
    case 'ai':
      return typeof options.provider === 'string' ? `Provider: ${options.provider}.` : '';
    case 'watermark':
      return typeof options.text === 'string' ? `Watermark: "${options.text}".` : '';
    default:
      return '';
  }
}

function summariseAdjustments(options: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(options)) {
    if (typeof value === 'number' && value !== 0)
      parts.push(`${key} ${value > 0 ? '+' : ''}${value}`);
    else if (typeof value === 'boolean' && value) parts.push(key);
  }
  if (parts.length === 0) return '';
  return `Tuning: ${parts.join(', ')}.`;
}

/**
 * Return a plain-language description of a recipe. The description is rendered *before* the
 * recipe runs so the recipient can confirm the cost and the steps.
 */
export function describeRecipe(recipe: Recipe, options: DescribeOptions = {}): RecipeDescription {
  const includeAi = options.includeAi ?? true;
  const phrases = recipe.steps.map((step, index) => describeStep(step, index));
  const aiSteps: number[] = [];
  for (let i = 0; i < recipe.steps.length; i += 1) {
    if (recipe.steps[i]!.op === 'ai') aiSteps.push(i);
  }
  const warnings: string[] = [];
  if (aiSteps.length > 0) {
    warnings.push(
      `This recipe asks an AI provider to transform your image (${aiSteps.length} step${
        aiSteps.length === 1 ? '' : 's'
      }). You will be asked for consent before any request is sent.`,
    );
  }
  if (recipe.steps.some((step) => step.op === 'mask')) {
    warnings.push('This recipe will mask parts of the image; verify the mask region.');
  }
  if (recipe.steps.some((step) => step.op === 'watermark')) {
    warnings.push('This recipe will overlay a watermark on the output.');
  }
  const summary = phrases.length === 0 ? 'No steps. Pass-through.' : phrases.join(' ');
  const cost: RecipeCost = {
    hasAi: aiSteps.length > 0,
    requiresConsent: aiSteps.length > 0,
    estimatedPeakBytes: 0,
    estimatedDurationMs: Math.max(50, recipe.steps.length * 75),
  };
  if (!includeAi) {
    return {
      title: recipe.name ?? recipe.id,
      summary,
      phrases: phrases.filter((_, index) => !aiSteps.includes(index)),
      warnings,
      cost,
      aiSteps,
      stepCount: recipe.steps.length,
    };
  }
  return {
    title: recipe.name ?? recipe.id,
    summary,
    phrases,
    warnings,
    cost,
    aiSteps,
    stepCount: recipe.steps.length,
  };
}

/**
 * Build a shareable URL fragment from a recipe. The fragment is base64url + deflate, prefixed
 * with `r1.`, and is small enough to round-trip without a server round-trip.
 */
export function buildShareFragment(recipe: Recipe, base: string = ''): string {
  const payload = recipeSharePayload(recipe);
  if (payload.kind === 'fragment') {
    return base ? `${base}#recipe=${payload.value}` : `#recipe=${payload.value}`;
  }
  // Oversized recipes are offered as a file download (see recipeSharePayload); the URL fragment
  // is therefore not used. The caller should fall back to a download CTA.
  return base
    ? `${base}#recipe=download:${payload.filename}`
    : `#recipe=download:${payload.filename}`;
}

/**
 * Parse a share URL fragment into a recipe. The fragment is either a `r1.<base64url>` payload
 * or a `download:<filename>` marker for oversized recipes. Throws when the fragment is empty
 * or unparseable.
 */
export function parseShareFragment(fragment: string): Recipe {
  if (!fragment) throw new TypeError('Empty share fragment.');
  const tail = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  const marker = 'recipe=';
  const idx = tail.indexOf(marker);
  if (idx < 0) throw new TypeError('Fragment does not contain a recipe payload.');
  const value = tail.slice(idx + marker.length);
  if (!value) throw new TypeError('Empty recipe payload.');
  if (value.startsWith('download:')) {
    throw new TypeError(
      `Recipe too large to share as a URL fragment. Download "${value.slice('download:'.length)}" instead.`,
    );
  }
  return parseRecipe(value);
}

/**
 * Convenience: build a full URL string the caller can hand to a recipient. Returns
 * `{ kind: 'url', value }` for in-line fragments or `{ kind: 'download', filename, contents }`
 * for oversized recipes.
 */
export function buildShareLink(
  recipe: Recipe,
  base: string,
): { kind: 'url'; value: string } | { kind: 'download'; filename: string; contents: string } {
  const payload = recipeSharePayload(recipe);
  if (payload.kind === 'fragment') {
    const sep = base.includes('#') ? '&' : '#';
    return { kind: 'url', value: `${base}${sep}recipe=${payload.value}` };
  }
  return { kind: 'download', filename: payload.filename, contents: payload.contents };
}

/** Round-trip convenience used by the editor's undo/redo persistence. */
export function cloneSerializedRecipe(recipe: Recipe): string {
  return serializeRecipe(recipe);
}

/**
 * Stable JSON representation of the recipe, suitable for storage in IndexedDB. The serialized
 * form goes through the same migration pipeline as the share fragment, so persisted recipes
 * keep working when the engine version advances.
 */
export function persistableJson(recipe: Recipe): string {
  return JSON.stringify(recipe, null, 2);
}
