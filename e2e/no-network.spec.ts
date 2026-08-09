import { expect, test, type Page } from '@playwright/test';

const LOCAL_FLOW = `<!doctype html><html><body>
  <input data-testid="file-input" type="file" />
  <select data-testid="option-format"><option value="webp">WebP</option></select>
  <button data-testid="action-download">Convert</button>
  <output data-testid="status-done" hidden>Done</output>
  <script>
    document.querySelector('[data-testid=action-download]').addEventListener('click', () => {
      const file = document.querySelector('[data-testid=file-input]').files[0];
      if (!file) return;
      const processedBytes = file.size;
      if (processedBytes < 1) return;
      document.querySelector('[data-testid=status-done]').hidden = false;
    });
  </script>
</body></html>`;

async function selectFixture(page: Page): Promise<void> {
  await page.setInputFiles('[data-testid=file-input]', {
    name: 'fixture.png',
    mimeType: 'image/png',
    buffer: Buffer.from([137, 80, 78, 71]),
  });
}

async function runLocalFlow(page: Page, selectFile = true): Promise<void> {
  if (selectFile) await selectFixture(page);
  await page.getByTestId('option-format').selectOption('webp');
  await page.getByTestId('action-download').click();
  await expect(page.getByTestId('status-done')).toBeVisible();
}

test('a local conversion scaffold makes zero network requests', async ({ page }) => {
  const crossOriginRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol !== 'data:' && url.protocol !== 'about:')
      crossOriginRequests.push(request.url());
  });
  await page.setContent(LOCAL_FLOW);
  await runLocalFlow(page);
  expect(crossOriginRequests).toEqual([]);
});

test('the local conversion scaffold succeeds while offline', async ({ page, context }) => {
  await page.setContent(LOCAL_FLOW);
  await selectFixture(page);
  await context.setOffline(true);
  await runLocalFlow(page, false);
});
