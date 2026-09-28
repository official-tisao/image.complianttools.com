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

const LOCAL = 'http://127.0.0.1:4185';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: EXE });

  // Test 1: zero cross-origin requests on /convert
  const ctx1 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const cross = [];
  p1.on('request', (r) => {
    if (new URL(r.url()).origin !== LOCAL) cross.push(r.url());
  });
  await p1.goto(LOCAL + '/convert', { waitUntil: 'networkidle' });
  const h1 = await p1.evaluate(() => document.documentElement.dataset.hydrated);
  console.log('[test 1] /convert hydrated =', h1 ?? 'NOT SET');
  await p1.setInputFiles('[data-testid=file-input]', fixture);
  try {
    await p1.getByTestId('compare-canvas').waitFor({ timeout: 15000 });
    console.log('[test 1] compare-canvas visible = true');
  } catch {
    console.log('[test 1] compare-canvas NOT visible');
  }
  console.log('[test 1] cross-origin requests:', cross.length ? cross : 'none');
  await ctx1.close();

  // Test 2: interactive after going offline on /compress
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(LOCAL + '/compress', { waitUntil: 'networkidle' });
  const h2 = await p2.evaluate(() => document.documentElement.dataset.hydrated);
  console.log('[test 2] /compress hydrated =', h2 ?? 'NOT SET');
  await p2.setInputFiles('[data-testid=file-input]', fixture);
  await ctx2.setOffline(true);
  try {
    await p2.getByTestId('option-export-quality').locator('input[type=range]').fill('64', {
      timeout: 15000,
    });
    console.log('[test 2] offline interaction = OK');
  } catch (e) {
    console.log('[test 2] offline interaction FAILED:', e.message.split('\n')[0]);
  }
  await ctx2.close();

  await browser.close();
})();
