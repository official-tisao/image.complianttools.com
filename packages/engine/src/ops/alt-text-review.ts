import {
  T63AltTextDraftSchema,
  T63AltTextReviewOptionsSchema,
  T63_ALT_TEXT_MAX_LENGTH,
  type T63AltTextReviewOptions,
} from '../schemas/options.js';

export type T63AltTextAttributeResult =
  | { readonly ok: true; readonly kind: 'empty'; readonly attribute: '' }
  | { readonly ok: true; readonly kind: 'decorative'; readonly attribute: 'alt=""' }
  | { readonly ok: true; readonly kind: 'descriptive'; readonly attribute: string }
  | {
      readonly ok: false;
      readonly error: {
        readonly kind: 'text-too-long' | 'invalid-draft' | 'invalid-options';
        readonly message: string;
        readonly remedy: string;
      };
    };

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll("'", '&#39;');
}

/** Build a safe HTML alt attribute preview without accessing the DOM. */
export function previewAltTextAttribute(
  draft: unknown,
  options: unknown = {},
): T63AltTextAttributeResult {
  const parsedOptions = T63AltTextReviewOptionsSchema.safeParse(options);
  if (!parsedOptions.success) {
    return {
      ok: false,
      error: {
        kind: 'invalid-options',
        message: 'The alt-text review options are invalid.',
        remedy: 'Restore the default options and try again.',
      },
    };
  }

  const parsedDraft = T63AltTextDraftSchema.safeParse(draft);
  if (!parsedDraft.success) {
    const tooLong = typeof draft === 'string' && draft.length > T63_ALT_TEXT_MAX_LENGTH;
    return {
      ok: false,
      error: {
        kind: tooLong ? 'text-too-long' : 'invalid-draft',
        message: tooLong
          ? 'Alt text must be 125 characters or fewer.'
          : 'Alt text must be plain text.',
        remedy: tooLong
          ? 'Shorten the draft to 125 characters or fewer.'
          : 'Enter a plain-text description and try again.',
      },
    };
  }

  const selected: T63AltTextReviewOptions = parsedOptions.data;
  if (selected.decorative) return { ok: true, kind: 'decorative', attribute: 'alt=""' };

  const text = parsedDraft.data.trim();
  if (!text) return { ok: true, kind: 'empty', attribute: '' };
  return { ok: true, kind: 'descriptive', attribute: `alt="${escapeAttribute(text)}"` };
}
