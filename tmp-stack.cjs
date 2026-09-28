const { chromium } = require('@playwright/test');

const EXE =
  process.env.LOCALAPPDATA +
  '\\ms-playwright\\chromium_headless_shell-1243\\chrome-headless-shell-win64\\chrome-headless-shell.exe';

const fixture = {
  name: 'self-generated.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
};

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXE });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const traces = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Trusted/.test(m.text())) {
      traces.push(m.text() + ' || ' + JSON.stringify(m.location()));
    }
  });
  page.on('pageerror', (e) => traces.push('PAGEERROR ' + e.message + ' || ' + JSON.stringify(e.stack || '').slice(0, 400)));
  await page.goto('http://127.0.0.1:4185/convert', { waitUntil: 'networkidle' });
  await page.setInputFiles('[data-testid=file-input]', fixture);
  await page.waitForTimeout(6000);
  console.log('=== traces ===');
  console.log(traces.join('\n---\n').slice(0, 2000) || 'none');
  await browser.close();
})();
