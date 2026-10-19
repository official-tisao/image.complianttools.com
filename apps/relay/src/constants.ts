/** Compiled-in destination allowlist (P5-13). */
export const ALLOWED_DESTINATIONS: readonly string[] = [
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'api.stability.ai',
  'api.bfl.ai',
  'fal.run',
  'queue.fal.run',
  'api.replicate.com',
  'api.remove-bg.com',
  'api.remove.bg',
  'clipdrop-api.co',
];

/** App's own origin when deployer sets no ALLOWED_ORIGINS. */
export const DEFAULT_ALLOWED_ORIGIN = 'https://image.complianttools.com';
