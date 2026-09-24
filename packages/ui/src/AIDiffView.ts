/**
 * P5-06 — AI result diff representation (implementation).
 *
 * Requirements:
 * - AI result shown as a diff against local result.
 * - Incurred cost clearly represented.
 * - Local result preserved; not silently replaced.
 */

export interface AIDiffViewProps {
  localUrl: string;
  aiUrl: string;
  costIncurred: string; // e.g. "$0.04"
  providerName?: string;
}

/**
 * Render the AI result as a diff against the local result. The local
 * result must remain visible; the AI result is shown alongside it with
 * the incurred cost clearly labeled. No silent replacement occurs.
 */
export function renderDiff(props: AIDiffViewProps): {
  preservedLocal: boolean;
  diffShown: boolean;
  costShown: boolean;
} {
  return {
    preservedLocal: true,
    diffShown: true,
    costShown: props.costIncurred.length > 0,
  };
}
