/**
 * P5-05 — Spend guard logic (soft/hard session/day thresholds, batch confirmation).
 */

import { DEFAULT_BATCH_CONFIRM_THRESHOLD } from './ledger.js';
import type { SpendThresholdConfig, SpendGuardResult } from './ledger.js';

export function parseMoney(value: string | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  const cleaned = String(value).replace(/[$,]/g, '').trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export function formatMoney(value: number): string {
  return value.toFixed(2);
}

/** Evaluate whether a projected spend is allowed by spend-guard thresholds. */
export function evaluateSpendGuard(
  currentSessionSpent: string,
  currentDaySpent: string,
  projectedBatchCost: string,
  thresholds?: SpendThresholdConfig,
): SpendGuardResult {
  const sessionSpent = parseMoney(currentSessionSpent);
  const daySpent = parseMoney(currentDaySpent);
  const projected = parseMoney(projectedBatchCost);
  const batchThreshold = parseMoney(
    thresholds?.batchConfirmThreshold ?? DEFAULT_BATCH_CONFIRM_THRESHOLD,
  );

  const sessionHard = parseMoney(thresholds?.sessionHard);
  const sessionSoft = parseMoney(thresholds?.sessionSoft);
  const dayHard = parseMoney(thresholds?.dayHard);
  const daySoft = parseMoney(thresholds?.daySoft);

  // Hard thresholds: absolute stop
  if (sessionHard > 0 && sessionSpent + projected >= sessionHard) {
    return {
      allowed: false,
      reason: `Hard session threshold ($${formatMoney(sessionHard)}) would be exceeded.`,
      projectedTotal: formatMoney(sessionSpent + projected),
    };
  }
  if (dayHard > 0 && daySpent + projected >= dayHard) {
    return {
      allowed: false,
      reason: `Hard day threshold ($${formatMoney(dayHard)}) would be exceeded.`,
      projectedTotal: formatMoney(daySpent + projected),
    };
  }

  // Soft thresholds: warning, not block
  const softWarning = [];
  if (sessionSoft > 0 && sessionSpent + projected >= sessionSoft) {
    softWarning.push(`Soft session threshold ($${formatMoney(sessionSoft)}) reached.`);
  }
  if (daySoft > 0 && daySpent + projected >= daySoft) {
    softWarning.push(`Soft day threshold ($${formatMoney(daySoft)}) reached.`);
  }

  // Batch confirmation: require explicit confirmation above configurable threshold
  if (projected >= batchThreshold) {
    return {
      allowed: false,
      reason: `Batch projected cost $${formatMoney(projected)} exceeds confirmation threshold $${formatMoney(batchThreshold)}. Confirm before proceeding.`,
      projectedTotal: formatMoney(projected),
    };
  }

  return {
    allowed: true,
    reason: softWarning.length > 0 ? softWarning.join(' ') : undefined,
    projectedTotal: formatMoney(projected),
  };
}
