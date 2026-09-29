/**
 * P5-05 — Cost ledger and spend guard.
 *
 * Requirements from README §13.6 and PLAN.md P5-05:
 * - Local IndexedDB ledger; per-provider totals; CSV export; never transmitted.
 * - Pre-request estimate from a versioned local price table with a "last updated" date,
 *   always labelled an estimate.
 * - Soft + hard session/day thresholds; batch confirmation above configurable
 *   threshold (default $1.00).
 *
 * Accounting rules:
 * - Do NOT invent provider pricing. Use only documented/default values.
 * - The ledger remains local only — never transmitted.
 * - Preserve accounting precision (use string/numeric representation, avoid float errors).
 */

export interface LedgerRecord {
  readonly timestamp: string; // ISO 8601
  readonly provider: string;
  readonly model: string;
  readonly capability: string;
  readonly usage: {
    inputTokens?: number;
    outputTokens?: number;
    images?: number;
    providerCost?: string; // string to preserve precision (e.g. "0.0425")
    requestId?: string;
  };
  readonly estimatedCost: string;
}

export interface PriceTableEntry {
  readonly provider: string;
  readonly model: string;
  readonly capability: string;
  readonly estimatedUnitCost: string; // cost per unit (e.g. per image, per 1K tokens)
  readonly lastUpdated: string; // ISO date
  readonly pricingUrl: string;
  readonly note?: string;
}

export interface PriceTableVersion {
  readonly version: string;
  readonly lastUpdated: string;
  readonly entries: readonly PriceTableEntry[];
}

/**
 * The versioned local price table.
 * Only documented/default values — no fabricated production pricing.
 */
export const DEFAULT_PRICE_TABLE: PriceTableVersion = {
  version: 'p5-05-v1',
  lastUpdated: '2026-09-22',
  entries: [
    {
      provider: 'openai',
      model: 'gpt-image-1',
      capability: 'generate',
      estimatedUnitCost: '0.0400', // per image, approximate; clearly labelled estimate
      lastUpdated: '2026-09-22',
      pricingUrl: 'https://openai.com/pricing',
      note: 'Estimated; always an estimate — verify against provider pricing page.',
    },
    {
      provider: 'anthropic',
      model: 'claude-opus-5',
      capability: 'describe',
      estimatedUnitCost: '0.0150', // per description; approximate
      lastUpdated: '2026-09-22',
      pricingUrl: 'https://anthropic.com/pricing',
      note: 'Estimated; verify against live provider pricing before relying on total.',
    },
  ],
};

/** Configurable batch confirmation threshold. Default is $1.00 per spec. */
export const DEFAULT_BATCH_CONFIRM_THRESHOLD = '1.00';

export interface SpendThresholdConfig {
  readonly sessionSoft?: string;
  readonly sessionHard?: string;
  readonly daySoft?: string;
  readonly dayHard?: string;
  readonly batchConfirmThreshold?: string; // default $1.00
}

export interface SpendState {
  sessionSpent: string;
  daySpent: string;
  sessionThresholdSoft?: string;
  sessionThresholdHard?: string;
  dayThresholdSoft?: string;
  dayThresholdHard?: string;
}

export interface SpendGuardResult {
  readonly allowed: boolean;
  readonly reason?: string | undefined;
  readonly projectedTotal?: string;
}
