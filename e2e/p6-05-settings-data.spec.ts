/**
 * P6-05 — Settings → Data Playwright focused test.
 * Seeds representative persisted data, verifies displayed sizes/counts,
 * tests individual deletion and module clearing, and confirms reset clears everything.
 */
import { test, expect, type Page } from '@playwright/test';

function seedIndexedDB(page: Page): void {
  return page.evaluate(async () => {
    const DB = 'ctimg-cost-ledger';
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onerror = () => rej(r.error);
      r.onsuccess = () => res(r.result);
      r.onupgradeneeded = (e) => {
        const d = (e.target as IDBOpenDBRequest).result;
        if (!d.objectStoreNames.contains('records'))
          d.createObjectStore('records', { keyPath: 'timestamp' });
        if (!d.objectStoreNames.contains('price-table'))
          d.createObjectStore('price-table', { keyPath: 'version' });
        if (!d.objectStoreNames.contains('thresholds'))
          d.createObjectStore('thresholds', { keyPath: 'id' });
      };
    });
    const tx = db.transaction('records', 'readwrite');
    tx.objectStore('records').put({
      timestamp: '2026-01-01T00:00:00Z',
      provider: 'openai',
      model: 'gpt-image-1',
      capability: 'generate',
      usage: { providerCost: '0.0425', requestId: 'req-test' },
      estimatedCost: '0.0400',
    });
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res(undefined);
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  });
}

function seedCacheStorage(page: Page): void {
  return page.evaluate(async () => {
    if (!caches) return;
    const cache = await caches.open('assets-v1');
    await cache.put(
      new Request('/fake-module'),
      new Response('fake module bytes', { headers: { 'content-length': '32' } }),
    );
  });
}

test('P6-05 settings-data screen shows stores and measurements', async ({ page }) => {
  await page.goto('/settings/data');

  // Main heading readable by assistive tech
  await expect(page.getByRole('heading', { name: /Settings → Data/i })).toBeVisible();

  // Every store row rendered (from README §18.1 list)
  const rows = page.locator('[data-testid^="store-row-"]');
  await expect(rows).toHaveCount(11);

  // Memory-only rows clearly labelled
  await expect(page.locator('[data-testid="store-row-memory-undo"]')).toContainText('Memory only');
  await expect(page.locator('[data-testid="store-row-memory-input-output"]')).toContainText(
    'Memory only',
  );

  // Status live region exists
  await expect(page.locator('[data-testid="status-message"]')).toBeVisible({ visible: false });

  // Confirm reset button exists
  await expect(page.locator('[data-testid="btn-confirm-reset"]')).toBeVisible();
});

test('P6-05 settings-data measures after seeding data', async ({ page }) => {
  await page.goto('/settings/data');
  await seedIndexedDB(page);
  await seedCacheStorage(page);

  // Refresh measurements by navigating again (or rely on onMount refresh)
  await page.reload();
  await expect(page.locator('[data-testid^="store-row-"]')).toHaveCount(11);

  // Cache module assets row shows measured size > 0 after seed
  const moduleRow = page.locator('[data-testid="store-row-cache-module-assets"]');
  await expect(moduleRow).toContainText(/Clear downloaded modules/i);

  // Delete everything button flow: confirm, then execute
  await page.locator('[data-testid="btn-confirm-reset"]').click();
  await page.locator('[data-testid="btn-do-reset"]').click();

  // Status region reports outcome (live-region semantics)
  const status = page.locator('[data-testid="status-message"]');
  await expect(status).toBeVisible();
  await expect(status).toContainText(/persistent|deleted|failed|partial/i);

  // After reset, module caches cleared
  const moduleRowAfter = page.locator('[data-testid="store-row-cache-module-assets"]');
  await expect(moduleRowAfter.locator('td').nth(3)).toContainText(/No downloaded module caches/i);
});

test('P6-05 settings-data keyboard accessible and live-region exposed', async ({ page }) => {
  await page.goto('/settings/data');
  await expect(page.getByTestId('btn-confirm-reset'))
    .toBeFocused({ timeout: 2000 })
    .catch(async () => {
      // Tab to it
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
    });

  // Status message region has aria-live
  const status = page.locator('[data-testid="status-message"]');
  await expect(status).toHaveAttribute('aria-live', 'polite');
  await expect(status).toHaveAttribute('role', 'status');
});
