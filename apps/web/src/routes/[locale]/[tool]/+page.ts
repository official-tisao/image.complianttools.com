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
] as const;

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
