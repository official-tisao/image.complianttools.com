/**
 * P5-08 — Anthropic mode-specific prompts (describe only).
 * Source of truth: README §14.1, PLAN.md P5-08.
 */

export const PROMPTS: Record<string, string> = {
  'alt-text':
    'Write a single sentence of alt text under 125 characters describing this image for a screen-reader user. Describe what is shown, not that it is an image. No preamble.',
  caption: 'Write one or two sentences describing this image, natural and publication-ready.',
  tags: 'List 8–15 keywords describing this image, most specific first. Return structured JSON matching the schema { tags: string[], primarySubject: string }.',
  detailed:
    'Provide a structured description of this image: subject, setting, composition, lighting, colour, mood, and any visible text. Be specific.',
  ocr: 'Transcribe all text in this image exactly, preserving line breaks and reading order. Output only the transcription.',
};

export function promptForMode(mode?: string): string {
  return (PROMPTS[mode ?? 'alt-text'] ?? PROMPTS['alt-text']) as string;
}
