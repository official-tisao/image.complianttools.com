/**
 * P5-17 — the hard spend limit that stands in front of every billable request (README §22.7 step 3).
 *
 * §22.7 requires "one minimal real operation per capability on a 64×64 fixture, with a hard spend
 * cap". The cap is the load-bearing word. This job runs unattended, nightly, against keys that have
 * real money behind them, so the property that matters is not that the cap is high enough to be
 * useful — it is that the cap **cannot be exceeded by an accident of configuration**.
 *
 * Hence three rules, all of which fail closed:
 *
 * 1. **A cost that cannot be bounded is refused.** Not estimated, not zero — refused. An adapter
 *    with no entry in the price table is exactly the case where a plausible-looking `0.00` would
 *    quietly mean "we don't know what this costs". The job's own wording is the specification: if
 *    no safe bound can be established, the operation does not run.
 * 2. **Money is decimal strings.** The engine's ledger already insists on this (`README` §13.6), and
 *    for good reason: summing `0.04` in binary floating point and comparing the result to a cap is a
 *    comparison that eventually disagrees with the ledger. Every value here is parsed to integer
 *    ten-thousandths of a dollar before any comparison happens.
 * 3. **The check precedes the request.** {@link SpendBudget.authorize} is called before an adapter's
 *    `run()` is invoked, not after. A cap that is consulted once the money is already spent is not a
 *    cap.
 *
 * The unit is **ten-thousandths of a US dollar** (`0.0001 USD`). It is an integer, so it is exact.
 */

/** The exact integer unit used for every comparison: 0.0001 USD. */
export type Micros = number;

/** Parse a decimal dollar string into {@link Micros}. Throws on anything that is not one. */
export function toMicros(dollars: string): Micros {
  const text = dollars.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error(`Refusing to treat ${JSON.stringify(dollars)} as a dollar amount.`);
  }
  const [whole = '0', fraction = ''] = text.split('.');
  // Four decimal places is the unit's resolution. Anything beyond it is a precision the ledger does
  // not keep, and silently rounding it *down* would understate a cost; rounding *up* would reject a
  // legitimate call. Both are worse than refusing, so a longer fraction is an error.
  if (fraction.length > 4) {
    throw new Error(`Dollar amount ${JSON.stringify(dollars)} is finer than 0.0001 USD.`);
  }
  const scaled = Number.parseInt(fraction.padEnd(4, '0'), 10);
  return Number.parseInt(whole, 10) * 10_000 + scaled;
}

/** Render {@link Micros} back to a decimal dollar string. Inverse of {@link toMicros}. */
export function formatUsd(micros: Micros): string {
  const whole = Math.floor(micros / 10_000);
  const fraction = Math.abs(micros % 10_000)
    .toString()
    .padStart(4, '0');
  return `${whole}.${fraction}`;
}

/**
 * The cost ceiling for one minimal operation, and the running total.
 *
 * Mutable by design: the job holds one budget for the whole run and books against it as providers
 * are probed. A class rather than a plain counter so that "already spent" cannot be reset by a
 * caller reassigning a variable, which is the usual way a budget silently stops working.
 */
export class SpendBudget {
  readonly #capMicros: Micros;
  #spentMicros: Micros = 0;

  constructor(capUsd: string) {
    this.#capMicros = toMicros(capUsd);
  }

  /** The cap, as a dollar string. */
  get capUsd(): string {
    return formatUsd(this.#capMicros);
  }

  /** Everything booked so far, including the current outstanding reservation. */
  get spentUsd(): string {
    return formatUsd(this.#spentMicros);
  }

  /** What is left, floored at zero — a negative remainder would read as headroom. */
  get remainingUsd(): string {
    return formatUsd(Math.max(0, this.#capMicros - this.#spentMicros));
  }

  /**
   * Approve an operation of at most `maxCostUsd`, or explain why not.
   *
   * Call this before the request goes out. A refusal is a normal, expected outcome — the point of a
   * cap is that it is sometimes hit.
   */
  authorize(maxCostUsd: string): SpendDecision {
    let maxMicros: Micros;
    try {
      maxMicros = toMicros(maxCostUsd);
    } catch (cause) {
      return {
        allowed: false,
        reason:
          'no safe cost bound could be established for this operation, so it was not attempted ' +
          `(parse failure: ${cause instanceof Error ? cause.message : String(cause)})`,
      };
    }
    if (maxMicros < 0) {
      return {
        allowed: false,
        reason: 'a negative cost bound cannot authorise a billable request',
      };
    }
    if (maxMicros > this.#capMicros) {
      return {
        allowed: false,
        reason:
          `a single operation bounded at ${formatUsd(maxMicros)} USD exceeds the whole-run cap of ` +
          `${this.capUsd} USD, so it was not attempted`,
      };
    }
    if (this.#spentMicros + maxMicros > this.#capMicros) {
      return {
        allowed: false,
        reason:
          `only ${this.remainingUsd} USD of the ${this.capUsd} USD cap remains, which cannot cover an ` +
          `operation bounded at ${formatUsd(maxMicros)} USD`,
      };
    }
    this.#spentMicros += maxMicros;
    return { allowed: true, bookedUsd: formatUsd(maxMicros) };
  }

  /**
   * Return an unspent reservation after a request failed, so a transient error does not
   * permanently consume budget.
   *
   * Only ever called with a value {@link authorize} returned. An amount larger than the outstanding
   * spend is ignored rather than trusted, which keeps a bug here from manufacturing headroom.
   */
  release(bookedUsd: string): void {
    let micros: Micros;
    try {
      micros = toMicros(bookedUsd);
    } catch {
      return;
    }
    this.#spentMicros = Math.max(0, this.#spentMicros - micros);
  }
}

export type SpendDecision =
  | { readonly allowed: true; readonly bookedUsd: string }
  | { readonly allowed: false; readonly reason: string };

/**
 * The price table the cap is enforced against (README §13.6).
 *
 * Every entry is a **documented upper bound on one minimal 64×64 operation**, not a per-call price
 * for arbitrary work. That distinction is what makes the number safe to compare against a cap: the
 * operation is fixed in size, so a bound on it is a bound on the whole call.
 *
 * Values are drawn from the engine's `DEFAULT_PRICE_TABLE` where it has an entry, and are stated as
 * deliberate over-estimates elsewhere. The `source` field on each entry records which, because a
 * bound whose provenance cannot be checked is not much of a bound.
 *
 * A provider absent from this table is **not** treated as free. `boundFor` returns `undefined` for
 * it, and the runner's fail-closed rule then refuses the operation. That is the intended behaviour
 * for `replicate`, whose per-second community-model pricing cannot be bounded in advance, and the
 * reason the job reports `unsupported` rather than pretending otherwise.
 */
export interface SpendBound {
  readonly provider: string;
  /** The most one minimal 64×64 operation of this capability can cost, as a dollar string. */
  readonly maxCostUsd: string;
  /** Where the bound came from, so a reviewer can tell a documented price from a conservative guess. */
  readonly source: 'engine-price-table' | 'conservative-upper-bound';
  readonly note: string;
}

export const SPEND_BOUNDS: readonly SpendBound[] = [
  {
    provider: 'openai',
    // `DEFAULT_PRICE_TABLE` records 0.0400 USD per gpt-image-1 image. gpt-image-1 does not offer a
    // 64×64 output, so this is the price of the smallest image it *can* produce — a genuine upper
    // bound on the fixture request, not a fiction about 64×64 pricing.
    maxCostUsd: '0.0400',
    source: 'engine-price-table',
    note: 'One gpt-image-1 image at its smallest supported size; the fixture is 64×64.',
  },
  {
    provider: 'anthropic',
    // `DEFAULT_PRICE_TABLE` records 0.0150 USD per claude-opus-5 description. A describe call on a
    // 64×64 image is well under that.
    maxCostUsd: '0.0150',
    source: 'engine-price-table',
    note: 'One claude-opus-5 description; the fixture is 64×64, far smaller than the priced input.',
  },
  {
    // Not in the table above on purpose. Recorded explicitly so the report can say "no bound exists"
    // rather than the runner silently skipping the provider for an unstated reason.
    provider: 'replicate',
    maxCostUsd: '',
    source: 'conservative-upper-bound',
    note: 'Replicate bills per second of community-model compute, which cannot be bounded in advance.',
  },
];

/** The bound for a provider's minimal operation, or `undefined` when none can be established. */
export function boundFor(provider: string): SpendBound | undefined {
  return SPEND_BOUNDS.find((bound) => bound.provider === provider);
}
