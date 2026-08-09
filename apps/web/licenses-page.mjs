function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderLicensesPage(markdown) {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Third-party licences</title></head>
  <body><main><h1>Third-party licences</h1><pre>${escapeHtml(markdown)}</pre></main></body>
</html>`;
}
