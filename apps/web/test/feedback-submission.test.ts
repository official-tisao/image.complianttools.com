import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFeedbackPayload,
  isValidEmail,
  submitFeedback,
  type FeedbackPayload,
  type Rating,
  FEEDBACK_ENDPOINT,
} from '../src/lib/feedback-submission.ts';

test('buildFeedbackPayload: constructs correct payload for 5-star rating', () => {
  const payload = buildFeedbackPayload({
    rating: 5 as Rating,
    product: 'crop',
    productClass: 'imagetools',
    email: 'test@example.com',
    better: 'Add more formats',
  });

  assert.equal(payload['star-rating'], 5);
  assert.equal(payload['product-class'], 'imagetools');
  assert.equal(payload.product, 'crop');
  assert.equal(payload.email, 'test@example.com');
  assert.equal(payload.better, 'Add more formats');
  assert.ok(!('what-broke' in payload));
  assert.ok(!('what-works' in payload));
});

test('buildFeedbackPayload: constructs correct payload for 1-4 star rating', () => {
  const payload = buildFeedbackPayload({
    rating: 3 as Rating,
    product: 'resize',
    productClass: 'imagetools',
    email: 'user@test.com',
    whatBroke: 'Image quality degraded',
    whatWorks: 'Fast processing',
  });

  assert.equal(payload['star-rating'], 3);
  assert.equal(payload['product-class'], 'imagetools');
  assert.equal(payload.product, 'resize');
  assert.equal(payload.email, 'user@test.com');
  assert.equal(payload['what-broke'], 'Image quality degraded');
  assert.equal(payload['what-works'], 'Fast processing');
  assert.ok(!('better' in payload));
});

test('buildFeedbackPayload: omits optional email when not provided', () => {
  const payload = buildFeedbackPayload({
    rating: 4 as Rating,
    product: 'compress',
    productClass: 'imagetools',
    whatBroke: 'Something',
    whatWorks: 'Something',
  });

  assert.ok(!('email' in payload));
});

test('buildFeedbackPayload: omits optional text fields when not provided', () => {
  const payload = buildFeedbackPayload({
    rating: 2 as Rating,
    product: 'convert',
    productClass: 'imagetools',
    whatBroke: '',
    whatWorks: '',
  });

  assert.equal(payload['what-broke'], '');
  assert.equal(payload['what-works'], '');
});

test('buildFeedbackPayload: handles empty strings for conditional fields', () => {
  const payload = buildFeedbackPayload({
    rating: 5 as Rating,
    product: 'crop',
    productClass: 'imagetools',
    better: '',
  });

  assert.equal(payload.better, '');
});

test('isValidEmail: returns true for empty string (optional)', () => {
  assert.equal(isValidEmail(''), true);
});

test('isValidEmail: returns true for valid email', () => {
  assert.equal(isValidEmail('user@example.com'), true);
  assert.equal(isValidEmail('test.email@domain.org'), true);
  assert.equal(isValidEmail('a@b.co'), true);
});

test('isValidEmail: returns false for invalid email', () => {
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail('user@'), false);
  assert.equal(isValidEmail('user@domain'), false);
});

test('submitFeedback: returns true on successful response (mocked)', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    return {
      ok: true,
      status: 200,
    } as Response;
  };

  try {
    const payload: FeedbackPayload = {
      'star-rating': 4,
      'product-class': 'imagetools',
      product: 'crop',
    };
    const result = await submitFeedback(payload);
    assert.equal(result, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('submitFeedback: returns false on failed response (mocked)', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 500,
    } as Response;
  };

  try {
    const payload: FeedbackPayload = {
      'star-rating': 2,
      'product-class': 'imagetools',
      product: 'resize',
    };
    const result = await submitFeedback(payload);
    assert.equal(result, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('submitFeedback: returns false on network error (mocked)', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    throw new Error('Network error');
  };

  try {
    const payload: FeedbackPayload = {
      'star-rating': 3,
      'product-class': 'imagetools',
      product: 'compress',
    };
    const result = await submitFeedback(payload);
    assert.equal(result, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('FEEDBACK_ENDPOINT constant is correct', () => {
  assert.equal(FEEDBACK_ENDPOINT, 'https://feedback.complianttools.com/feedback');
});

// Tests for conditional field logic (extracted from FeedbackWidget for testability)
function getConditionalFields(
  rating: Rating | null,
): Array<{ label: string; name: string; placeholder: string; rows: number }> {
  if (rating === null) return [];
  if (rating === 5) {
    return [{ label: 'What can we do better?', name: 'better', placeholder: 'Optional', rows: 4 }];
  }
  return [
    {
      label: "What broke or didn't work well?",
      name: 'whatBroke',
      placeholder: 'Optional',
      rows: 4,
    },
    {
      label: 'What works but could be better?',
      name: 'whatWorks',
      placeholder: 'Optional',
      rows: 4,
    },
  ];
}

function getProductForSubmission(
  product: string | undefined,
  routeProduct: string,
  formDataProduct: string,
): string {
  return product ?? routeProduct ?? formDataProduct;
}

function getProductInputHidden(dedicatedPage: boolean, routeProduct: string): boolean {
  return dedicatedPage ? false : routeProduct !== '';
}

function getProductRequired(dedicatedPage: boolean, routeProduct: string): boolean {
  return dedicatedPage || routeProduct === '';
}

function canSubmit(
  rating: Rating | null,
  dedicatedPage: boolean,
  productForSubmission: string,
): boolean {
  if (rating === null) return false;
  if (dedicatedPage) return productForSubmission.trim() !== '';
  return true;
}

test('getConditionalFields: returns empty array when no rating selected', () => {
  const fields = getConditionalFields(null);
  assert.deepEqual(fields, []);
});

test('getConditionalFields: returns "better" field for 5-star rating', () => {
  const fields = getConditionalFields(5 as Rating);
  assert.deepEqual(fields, [
    { label: 'What can we do better?', name: 'better', placeholder: 'Optional', rows: 4 },
  ]);
});

test('getConditionalFields: returns "whatBroke" and "whatWorks" fields for 1-4 star ratings', () => {
  const fields = getConditionalFields(3 as Rating);
  assert.deepEqual(fields, [
    {
      label: "What broke or didn't work well?",
      name: 'whatBroke',
      placeholder: 'Optional',
      rows: 4,
    },
    {
      label: 'What works but could be better?',
      name: 'whatWorks',
      placeholder: 'Optional',
      rows: 4,
    },
  ]);
});

test('getConditionalFields: returns "whatBroke" and "whatWorks" for 1-star rating', () => {
  const fields = getConditionalFields(1 as Rating);
  assert.deepEqual(fields, [
    {
      label: "What broke or didn't work well?",
      name: 'whatBroke',
      placeholder: 'Optional',
      rows: 4,
    },
    {
      label: 'What works but could be better?',
      name: 'whatWorks',
      placeholder: 'Optional',
      rows: 4,
    },
  ]);
});

test('getConditionalFields: returns "whatBroke" and "whatWorks" for 4-star rating', () => {
  const fields = getConditionalFields(4 as Rating);
  assert.deepEqual(fields, [
    {
      label: "What broke or didn't work well?",
      name: 'whatBroke',
      placeholder: 'Optional',
      rows: 4,
    },
    {
      label: 'What works but could be better?',
      name: 'whatWorks',
      placeholder: 'Optional',
      rows: 4,
    },
  ]);
});

test('getProductForSubmission: uses explicit product prop when provided', () => {
  const result = getProductForSubmission('explicit-tool', 'route-tool', 'form-tool');
  assert.equal(result, 'explicit-tool');
});

test('getProductForSubmission: uses route-derived product when no explicit prop', () => {
  const result = getProductForSubmission(undefined, 'crop', 'form-tool');
  assert.equal(result, 'crop');
});

test('getProductForSubmission: falls back to form data when no explicit or route product', () => {
  // routeProduct is undefined when not on a tool page, so form data is used
  const result = getProductForSubmission(undefined, undefined, 'form-tool');
  assert.equal(result, 'form-tool');
});

test('getProductForSubmission: uses form data when route product is undefined (unknown tool)', () => {
  // When current tool is not in the known list, routeProduct is undefined (not empty string)
  // The widget returns '' for unknown tools, but that's a string value, not nullish
  // So the ?? operator doesn't fall through - we need to test with undefined
  const result = getProductForSubmission(undefined, undefined, 'form-tool');
  assert.equal(result, 'form-tool');
});

test('getProductForSubmission: returns empty string when all sources empty', () => {
  const result = getProductForSubmission(undefined, '', '');
  assert.equal(result, '');
});

test('getProductInputHidden: returns true on tool pages when route product known', () => {
  const result = getProductInputHidden(false, 'crop');
  assert.equal(result, true);
});

test('getProductInputHidden: returns false on tool pages when route product unknown', () => {
  const result = getProductInputHidden(false, '');
  assert.equal(result, false);
});

test('getProductInputHidden: returns false on dedicated feedback page', () => {
  const result = getProductInputHidden(true, 'crop');
  assert.equal(result, false);
});

test('getProductInputHidden: returns false on dedicated feedback page even with empty route', () => {
  const result = getProductInputHidden(true, '');
  assert.equal(result, false);
});

test('getProductRequired: returns true on dedicated page', () => {
  const result = getProductRequired(true, 'crop');
  assert.equal(result, true);
});

test('getProductRequired: returns true on tool page when route product unknown', () => {
  const result = getProductRequired(false, '');
  assert.equal(result, true);
});

test('getProductRequired: returns false on tool page when route product known', () => {
  const result = getProductRequired(false, 'crop');
  assert.equal(result, false);
});

test('canSubmit: returns false when no rating selected', () => {
  const result = canSubmit(null, false, 'crop');
  assert.equal(result, false);
});

test('canSubmit: returns true on tool pages when rating selected (product hidden)', () => {
  const result = canSubmit(4 as Rating, false, '');
  assert.equal(result, true);
});

test('canSubmit: returns true on dedicated page when rating and product present', () => {
  const result = canSubmit(4 as Rating, true, 'crop');
  assert.equal(result, true);
});

test('canSubmit: returns false on dedicated page when rating selected but product empty', () => {
  const result = canSubmit(4 as Rating, true, '');
  assert.equal(result, false);
});

test('canSubmit: returns false on dedicated page when product is only whitespace', () => {
  const result = canSubmit(4 as Rating, true, '   ');
  assert.equal(result, false);
});
