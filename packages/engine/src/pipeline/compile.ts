import { chooseMemoryStrategy } from '../scheduler/memory-governor.js';
import type { ExecutionTier, InputMeta, Plan, PlanStep, Recipe } from '../types.js';

const pixelLocalOps = new Set(['adjust', 'filter']);

function chooseTier(): ExecutionTier {
  return typeof WebAssembly === 'object' ? 'wasm' : 'js';
}

export async function compile(recipe: Recipe, inputMeta: InputMeta): Promise<Plan> {
  const steps: PlanStep[] = [];
  recipe.steps.forEach((step, index) => {
    const previous = steps.at(-1);
    if (pixelLocalOps.has(step.op) && previous?.fused) {
      const operations = previous.options.operations as ReadonlyArray<
        Readonly<Record<string, unknown>>
      >;
      steps[steps.length - 1] = {
        ...previous,
        options: { operations: [...operations, step.options] },
        sourceStepIndexes: [...previous.sourceStepIndexes, index],
      };
    } else if (pixelLocalOps.has(step.op)) {
      steps.push({
        op: 'pixel-local',
        options: { operations: [step.options] },
        sourceStepIndexes: [index],
        fused: true,
        kernelRadius: 0,
      });
    } else {
      const radius =
        step.op === 'enhance' && typeof step.options.radius === 'number'
          ? Math.ceil(step.options.radius)
          : 0;
      steps.push({
        op: step.op,
        options: step.options,
        sourceStepIndexes: [index],
        fused: false,
        kernelRadius: radius,
      });
    }
  });
  const memory = chooseMemoryStrategy(inputMeta, 2);
  const lazyDownloads =
    recipe.export.format === 'jpeg' ||
    recipe.export.format === 'png' ||
    recipe.export.format === 'webp'
      ? [{ id: `codec:${recipe.export.format}`, bytes: 0 }]
      : [];
  return { steps, tier: chooseTier(), lazyDownloads, ...memory };
}
