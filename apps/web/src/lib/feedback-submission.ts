/**
 * Standalone feedback submission module.
 *
 * Builds the JSON payload posted to the feedback server and performs the
 * network request. Kept separate from the Svelte widget so it can be
 * independently unit-tested without mounting a component.
 */

export type Rating = 1 | 2 | 3 | 4 | 5;

export interface FeedbackPayload {
  'star-rating': Rating;
  'product-class': string;
  product: string;
  email?: string;
  better?: string;
  'what-broke'?: string;
  'what-works'?: string;
}

/** Build the submission payload from form values. */
export function buildFeedbackPayload(args: {
  rating: Rating;
  product: string;
  productClass: string;
  email?: string;
  whatBroke?: string;
  whatWorks?: string;
  better?: string;
}): FeedbackPayload {
  const { rating, product, productClass, email, whatBroke, whatWorks, better } = args;

  const payload: FeedbackPayload = {
    'star-rating': rating,
    'product-class': productClass,
    product,
  };

  if (email) payload.email = email;

  if (rating === 5) {
    payload.better = better ?? '';
  } else {
    payload['what-broke'] = whatBroke ?? '';
    payload['what-works'] = whatWorks ?? '';
  }

  return payload;
}

/** Submit feedback to the feedback API. Returns true when accepted, false otherwise. */
export async function submitFeedback(payload: FeedbackPayload): Promise<boolean> {
  try {
    const response = await fetch(FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/** Validate an optional email address. */
export function isValidEmail(value: string): boolean {
  if (!value) return true;
  try {
    new URL(`mailto:${value}`);
    return value.includes('@') && value.includes('.');
  } catch {
    return false;
  }
}

export const FEEDBACK_ENDPOINT = '/api/feedback';
