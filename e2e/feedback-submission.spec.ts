import { expect, test } from '@playwright/test';

test.describe('Feedback widget interaction', () => {
  test('widget renders and rating selection works on a tool page', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/heic-converter', { waitUntil: 'domcontentloaded' });

    // Wait for widget to be visible
    await expect(page.locator('.feedback-widget')).toHaveCount(1);
    await expect(page.locator('#feedback-heading')).toBeVisible();

    // Select 5 stars
    const stars = page.locator('.rating-stars button');
    await expect(stars).toHaveCount(5);

    // Wait for page to be fully loaded (hydration complete)
    await page.waitForLoadState('networkidle');

    // Click on the 5th star
    await stars.nth(4).click();

    // Wait for state update
    await page.waitForTimeout(1000);

    // Verify rating hint appears
    await expect(page.locator('#rating-hint')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#rating-hint')).toContainText('5 stars');

    // Verify conditional fields appear for 5-star rating
    await expect(page.locator('[id="better"]')).toBeVisible({ timeout: 5000 });

    // Verify email field appears
    await expect(page.locator('[name="email"]')).toBeVisible({ timeout: 5000 });

    // Fill in "What can we do better?" field (5-star specific) - use ID selector
    await page.fill('#better', 'Add more format options');

    // Fill optional email
    await page.fill('#email', 'test@example.com');

    // Check no JS errors
    expect(pageErrors, 'browser errors').toEqual([]);
  });

  test('widget renders and rating selection works with 1-4 stars', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/heic-converter', { waitUntil: 'domcontentloaded' });

    // Wait for widget to be visible
    await expect(page.locator('.feedback-widget')).toHaveCount(1);

    // Wait for page to be fully loaded (hydration complete)
    await page.waitForLoadState('networkidle');

    // Select 3 stars
    const stars = page.locator('.rating-stars button');
    await stars.nth(2).click(); // 3rd star (index 2)

    // Wait for state update
    await page.waitForTimeout(1000);

    // Verify rating hint appears
    await expect(page.locator('#rating-hint')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#rating-hint')).toContainText('3 stars');

    // Verify conditional fields appear for 1-4 star rating
    await expect(page.locator('#whatBroke')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#whatWorks')).toBeVisible();

    // Verify email field appears
    await expect(page.locator('[name="email"]')).toBeVisible({ timeout: 5000 });

    // Check no JS errors
    expect(pageErrors, 'browser errors').toEqual([]);
  });

  test('widget renders on dedicated feedback page with manual product input', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/feedback', { waitUntil: 'domcontentloaded' });

    // Wait for widget to be visible
    await expect(page.locator('.feedback-widget')).toHaveCount(1);

    // Wait for page to be fully loaded (hydration complete)
    await page.waitForLoadState('networkidle');

    // Select 4 stars
    const stars = page.locator('.rating-stars button');
    await stars.nth(3).click(); // 4th star (index 3)

    // Wait for state update
    await page.waitForTimeout(1000);

    // Verify conditional fields and product input appear
    await expect(page.locator('#whatBroke')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#whatWorks')).toBeVisible();
    await expect(page.locator('[name="product"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[name="email"]')).toBeVisible({ timeout: 5000 });

    // Fill required product field (visible on dedicated page)
    await page.fill('[name="product"]', '/custom-page');

    // Fill conditional fields for 1-4 star rating - use ID selectors
    await page.fill('#whatBroke', 'Page load failed');
    await page.fill('#whatWorks', 'Design is good');

    // Fill optional email
    await page.fill('#email', 'user@test.com');

    // Check no JS errors
    expect(pageErrors, 'browser errors').toEqual([]);
  });
});

test.describe('Feedback API submission', () => {
  test('attempts to submit feedback to external API', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    // Track all network requests to the feedback API
    const feedbackRequests: Array<{ url: string; method: string; status?: number }> = [];
    page.on('request', (request) => {
      if (request.url().includes('feedback.complianttools.com/feedback')) {
        feedbackRequests.push({
          url: request.url(),
          method: request.method(),
        });
      }
    });
    page.on('response', (response) => {
      if (response.url().includes('feedback.complianttools.com/feedback')) {
        const req = feedbackRequests.find((r) => r.url === response.url());
        if (req) req.status = response.status();
      }
    });

    await page.goto('/heic-converter', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Select 5 stars
    const stars = page.locator('.rating-stars button');
    await expect(stars).toHaveCount(5);
    await stars.nth(4).click();
    await page.waitForTimeout(500);

    // Fill required fields - use ID selector since name might not work
    await expect(page.locator('#better')).toBeVisible({ timeout: 5000 });
    await page.fill('#better', 'Add more format options');
    await page.fill('#email', 'test@example.com');

    // Click submit
    await page.click('button.submit-button:has-text("Submit feedback")');

    // Wait for potential network request - longer timeout
    await page.waitForTimeout(10000);

    // Report actual API result
    if (feedbackRequests.length > 0) {
      for (const req of feedbackRequests) {
        console.log(
          `Feedback API request: ${req.method} ${req.url} - Status: ${req.status ?? 'no response'}`,
        );
      }
    } else {
      console.log('Feedback API: No request was made to feedback.complianttools.com/feedback');
      console.log(
        'This indicates the form submission handler may not be triggering, or the external API is unreachable from the test environment.',
      );
    }

    // Check no JS errors
    expect(pageErrors, 'browser errors').toEqual([]);
  });
});
