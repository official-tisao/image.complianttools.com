export const prerender = true;

const paths = [
  'convert',
  'compress',
  'resize',
  'heic-converter',
  'avif-converter',
  'webp-converter',
  'jxl-converter',
  'raw-converter',
  'svg-to-png',
  'image-to-svg',
  'pdf-to-image',
  'image-to-pdf',
  'favicon-generator',
  'base64-image',
  'gif-converter',
  'gif-maker',
  'video-to-gif',
  'cbz-converter',
  'lossless-optimize',
  'embedded-converter',
  'exif-viewer',
  'remove-exif',
  'image-info',
  'pixel-art-upscaler',
  'upscale',
  'ocr',
  'compare',
  'color-match',
  'generate',
  'find-duplicates',
  'smart-crop',
  'blur-face',
  'adaptive-resize',
  'alt-text',
] as const;

export const GET = () =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>https://image.complianttools.com/${path}</loc></url>`).join('')}</urlset>`,
    { headers: { 'content-type': 'application/xml' } },
  );
