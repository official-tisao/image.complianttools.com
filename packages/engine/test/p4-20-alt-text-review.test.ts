import { describe, expect, it } from 'vitest';
import {
  T63AltTextDraftSchema,
  T63AltTextReviewOptionsSchema,
  t63AltTextReviewOptionDescriptions,
} from '../src/schemas/options.js';
import { previewAltTextAttribute } from '../src/ops/alt-text-review.js';

describe('T63 manual alt-text review', () => {
  it('defaults to a no-op and exposes generated decorative metadata', () => {
    const options = T63AltTextReviewOptionsSchema.parse({});
    expect(options).toEqual({
      decorative: false,
      purposeReviewed: false,
      redundancyReviewed: false,
      essentialDetailReviewed: false,
    });
    expect(previewAltTextAttribute('', options)).toEqual({
      ok: true,
      kind: 'empty',
      attribute: '',
    });
    expect(t63AltTextReviewOptionDescriptions['t63.decorative']?.defaultValue).toBe(false);
    expect(t63AltTextReviewOptionDescriptions['t63.purposeReviewed']?.defaultValue).toBe(false);
  });

  it('escapes user text as a quoted HTML attribute', () => {
    expect(previewAltTextAttribute(`A "map" & <legend>`, {})).toEqual({
      ok: true,
      kind: 'descriptive',
      attribute: 'alt="A &quot;map&quot; &amp; &lt;legend&gt;"',
    });
  });

  it('marks only an explicitly decorative image with an empty alt attribute', () => {
    expect(previewAltTextAttribute('Ignored draft', { decorative: true })).toEqual({
      ok: true,
      kind: 'decorative',
      attribute: 'alt=""',
    });
  });

  it('returns a typed error and remedy for overlong text', () => {
    const tooLong = 'a'.repeat(126);
    expect(T63AltTextDraftSchema.safeParse(tooLong).success).toBe(false);
    expect(previewAltTextAttribute(tooLong, {})).toEqual({
      ok: false,
      error: {
        kind: 'text-too-long',
        message: 'Alt text must be 125 characters or fewer.',
        remedy: 'Shorten the draft to 125 characters or fewer.',
      },
    });
  });

  it('returns a typed error for malformed options or non-string drafts', () => {
    expect(previewAltTextAttribute('description', { decorative: 'yes' })).toMatchObject({
      ok: false,
      error: { kind: 'invalid-options', remedy: expect.any(String) },
    });
    expect(previewAltTextAttribute(null, {})).toMatchObject({
      ok: false,
      error: { kind: 'invalid-draft', remedy: expect.any(String) },
    });
  });
});
