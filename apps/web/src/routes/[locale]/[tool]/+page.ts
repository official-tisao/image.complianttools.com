import { error } from '@sveltejs/kit';
import type { EntryGenerator, PageLoad } from './$types';

const locales = ['en-XA', 'ar'] as const;
const tools = [
  'convert',
  'compress',
  'resize',
  'image-info',
  'remove-exif',
  'exif-viewer',
  'base64-image',
  'favicon-generator',
  'svg-to-png',
  'image-to-svg',
  'pdf-to-image',
  'image-to-pdf',
  'cbz-converter',
  'gif-converter',
  'avif-converter',
  'webp-converter',
  'jxl-converter',
  'heic-converter',
  'raw-converter',
  'embedded-converter',
  'lossless-optimize',
  'pixel-art-upscaler',
  'upscale',
  'ocr',
] as const;

// Routes intentionally excluded from localized entries:
//   - `gif-maker`: every label and status string is hard-coded English. The component
//     does not call `translate()` and adding a locale prefix would render English on
//     every en-XA/ar page. The page is correct only because it is the default-locale
//     route. Localizing it is its own task; the route list does not silently localize
//     it now.
//   - `video-to-gif`: same reason — the labels, descriptions, and accept-string are
//     hard-coded English, and the WebCodecs accept list is currently a single string
//     that is not locale-parameterised. The en-only route stays en-only.

export const entries: EntryGenerator = () =>
  locales.flatMap((locale) => tools.map((tool) => ({ locale, tool })));

export const load: PageLoad = ({ params }) => {
  if (
    !locales.includes(params.locale as (typeof locales)[number]) ||
    !tools.includes(params.tool as (typeof tools)[number])
  )
    error(404, 'Not found');
  return {
    locale: params.locale as (typeof locales)[number],
    tool: params.tool as (typeof tools)[number],
  };
};
