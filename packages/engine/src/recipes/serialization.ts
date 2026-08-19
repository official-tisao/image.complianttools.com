import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';
import { z } from 'zod';

import { ExportOptionsSchema } from '../schemas/options.js';
import type { Recipe } from '../types.js';

const StepSchema = z.object({
  op: z.enum([
    'decode',
    'resize',
    'crop',
    'rotate',
    'adjust',
    'filter',
    'enhance',
    'watermark',
    'metadata',
    'mask',
    'composite',
    'ai',
    'custom',
  ]),
  options: z.record(z.string(), z.unknown()),
});
const RecipeSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  name: z.string().optional(),
  steps: z.array(StepSchema),
  export: ExportOptionsSchema,
});

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded =
    value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function assertNoInlineAssets(value: unknown, path = 'recipe'): void {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value) || value instanceof Blob)
    throw new TypeError(
      `${path} contains inline binary data. Reference assets by content hash instead.`,
    );
  if (Array.isArray(value))
    value.forEach((item, index) => assertNoInlineAssets(item, `${path}[${index}]`));
  else if (value && typeof value === 'object')
    Object.entries(value).forEach(([key, item]) => assertNoInlineAssets(item, `${path}.${key}`));
}

export function migrateRecipe(value: unknown): Recipe {
  if (value && typeof value === 'object' && 'version' in value && value.version === 0) {
    const legacy = value as {
      id?: string;
      name?: string;
      operations?: unknown[];
      output?: unknown;
    };
    value = {
      version: 1,
      id: legacy.id ?? 'migrated',
      name: legacy.name,
      steps: legacy.operations ?? [],
      export: legacy.output ?? { format: 'same' },
    };
  }
  return RecipeSchema.parse(value) as Recipe;
}

export function serializeRecipe(recipe: Recipe): string {
  assertNoInlineAssets(recipe);
  const valid = migrateRecipe(recipe);
  return `r1.${toBase64Url(zlibSync(strToU8(JSON.stringify(valid)), { level: 9 }))}`;
}

export function parseRecipe(serialized: string): Recipe {
  if (!serialized.startsWith('r1.')) throw new TypeError('Unsupported recipe link version.');
  return migrateRecipe(JSON.parse(strFromU8(unzlibSync(fromBase64Url(serialized.slice(3))))));
}

export function recipeSharePayload(
  recipe: Recipe,
): { kind: 'fragment'; value: string } | { kind: 'download'; filename: string; contents: string } {
  const serialized = serializeRecipe(recipe);
  return serialized.length <= 8192
    ? { kind: 'fragment', value: serialized }
    : {
        kind: 'download',
        filename: `${recipe.id}.ctrecipe`,
        contents: JSON.stringify(migrateRecipe(recipe), null, 2),
      };
}
