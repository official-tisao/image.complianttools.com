export const prerender = true;

export const GET = () =>
  new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#f0eeea"/><path d="M80 80h1040v470H80z" fill="none" stroke="#1c1a17"/><text x="100" y="260" font-family="system-ui,sans-serif" font-size="34" letter-spacing="5" fill="#5c5a56">LOCAL IMAGE TOOLS</text><text x="100" y="365" font-family="system-ui,sans-serif" font-size="76" font-weight="600" fill="#1c1a17">ctimg</text><text x="100" y="430" font-family="system-ui,sans-serif" font-size="30" fill="#5c5a56">Convert · Compress · Resize — entirely on your device</text></svg>`,
    { headers: { 'content-type': 'image/svg+xml' } },
  );
