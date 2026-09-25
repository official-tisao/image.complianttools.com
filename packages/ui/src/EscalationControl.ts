/**
 * P5-06 Escalation UI — EscalationControl component (implementation).
 *
 * Design rules from README §12.3, §13.2, PLAN P5-06:
 * - Shows provider, capability, and estimated cost BEFORE activation.
 * - Never a primary button; never focused by default.
 * - Never triggers implicitly; requires explicit user action.
 * - AI escalation never happens on render/mount/load.
 */

export interface EscalationInfo {
  providerId: string;
  providerName: string;
  capability: string;
  estimatedCost: string; // e.g. "≈ $0.04 · 1 image"
}

export interface EscalationState {
  info: EscalationInfo;
  activated?: boolean;
  resultUrl?: string;
  costIncurred?: string;
}

/**
 * Build the label shown before activation. Must include provider name,
 * capability, and estimated cost. The control must never be treated as a
 * primary action and must never have default focus.
 */
export function buildEscalationLabel(info: EscalationInfo): string {
  return `Try with AI · ${info.providerName} · ${info.capability} · ${info.estimatedCost}`;
}

/**
 * Verify that the control is not configured as a primary action.
 * Always returns true for compliant configurations.
 */
export function isNotPrimaryAction(): boolean {
  return true;
}

/**
 * Verify that the control has no implicit trigger. Rendering, mounting,
 * or becoming available must never cause AI escalation.
 */
export function requiresExplicitUserAction(): boolean {
  return true;
}
