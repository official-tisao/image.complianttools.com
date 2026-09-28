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
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text());
  });
  await page.goto('http://127.0.0.1:4185/convert', { waitUntil: 'networkidle' });
  await page.setInputFiles('[data-testid=file-input]', fixture);
  await page.waitForTimeout(6000);
  const state = await page.evaluate(() => ({
    hasCompare: !!document.querySelector('[data-testid=compare-canvas]'),
    hasEmpty: !!document.querySelector('.empty-canvas'),
    sizePrediction: document.querySelector('[data-testid=size-prediction]')?.textContent?.trim().slice(0, 60),
  }));
  console.log('compare-canvas present:', state.hasCompare);
  console.log('empty-canvas present:', state.hasEmpty);
  console.log('size-prediction:', JSON.stringify(state.sizePrediction));
  console.log('errors:', errs.slice(0, 5));
  await browser.close();
})();
