export const prerender = true;

export const GET = () =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://image.complianttools.com/convert</loc></url><url><loc>https://image.complianttools.com/compress</loc></url><url><loc>https://image.complianttools.com/resize</loc></url><url><loc>https://image.complianttools.com/heic-converter</loc></url><url><loc>https://image.complianttools.com/raw-converter</loc></url><url><loc>https://image.complianttools.com/image-to-svg</loc></url><url><loc>https://image.complianttools.com/image-to-pdf</loc></url><url><loc>https://image.complianttools.com/favicon-generator</loc></url><url><loc>https://image.complianttools.com/image-to-base64</loc></url><url><loc>https://image.complianttools.com/gif-splitter</loc></url><url><loc>https://image.complianttools.com/exif-viewer</loc></url><url><loc>https://image.complianttools.com/remove-exif</loc></url></urlset>`,
    { headers: { 'content-type': 'application/xml' } },
  );
