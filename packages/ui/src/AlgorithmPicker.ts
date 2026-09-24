/**
 * P5-06 — AlgorithmPicker for T66 / T67 Tier 1 algorithm choices.
 *
 * For T66 (Remove Object) and T67 (Expand Image), users choose among the
 * existing repository-specified Tier 1 algorithms rather than reading a
 * dropdown label. The picker displays algorithm choices as thumbnail
 * cards using the repository's naming (e.g. Telea, Navier–Stokes,
 * confidence-priority, Efros–Leung, quilting).
 */

export interface AlgorithmChoice {
  id: string;
  name: string;
  description: string;
  tier: 'Tier 1' | 'Tier 2' | 'Tier 3';
}

/** The exact Tier 1 algorithm choices for T66/T67 per repository spec. */
export const T66_TIER1_ALGORITHMS: AlgorithmChoice[] = [
  {
    id: 'telea',
    name: 'Telea',
    description: 'Fast-marching inpainting; best for thin defects.',
    tier: 'Tier 1',
  },
  {
    id: 'navier-stokes',
    name: 'Navier–Stokes',
    description: 'Smooth-region fill based on fluid dynamics.',
    tier: 'Tier 1',
  },
  {
    id: 'confidence-priority',
    name: 'Confidence-priority',
    description: 'Confident pixel-first exemplar fill.',
    tier: 'Tier 1',
  },
  {
    id: 'efros-leung',
    name: 'Efros–Leung',
    description: 'Non-parametric texture sampling.',
    tier: 'Tier 1',
  },
  {
    id: 'quilting',
    name: 'Quilting',
    description: 'Large-region texture synthesis.',
    tier: 'Tier 1',
  },
];

export const T67_TIER1_ALGORITHMS: AlgorithmChoice[] = [
  {
    id: 'telea',
    name: 'Telea',
    description: 'Fast-marching inpainting applied inside a mask (current stub).',
    tier: 'Tier 1',
  },
];

/**
 * Return the algorithm choices for a given tool / capability.
 * Only repository-specified algorithms are returned; no invented
 * algorithms are included.
 */
export function getAlgorithmChoices(toolId: 'T66' | 'T67'): AlgorithmChoice[] {
  if (toolId === 'T66') return T66_TIER1_ALGORITHMS;
  if (toolId === 'T67') return T67_TIER1_ALGORITHMS;
  return [];
}
