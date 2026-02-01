import { test, expect } from '@playwright/test';

const assertNoHorizontalScroll = async (page) => {
  const hasOverflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1;
  });
  expect(hasOverflow).toBeFalsy();
};

test.describe('Mobile landing page', () => {
  test('loads and renders hero + CTAs', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    await expect(page.locator('.hero')).toBeVisible();
    await expect(page.locator('.hero-title')).toBeVisible();
    await expect(page.locator('.hero-cta .btn-primary')).toBeVisible();
    await expect(page.locator('.hero-cta .btn-secondary')).toBeVisible();

    await assertNoHorizontalScroll(page);
  });

  test('login modal fits viewport and is scrollable if needed', async ({ page }) => {
    await page.goto('/?mockAuth=0');
    await page.locator('.hero-cta .btn-primary').click();

    const modal = page.locator('.login-modal');
    await expect(modal).toBeVisible();

    const fitsViewport = await modal.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.height <= window.innerHeight + 1;
    });
    expect(fitsViewport).toBeTruthy();
  });
});

test.describe('Collectors page', () => {
  test('navigates to collectors page and shows stable layout', async ({ page }) => {
    await page.goto('/?mockAuth=0');
    // Footer structure: Product, Community, Legal sections; Community is the 2nd section.
    await page.locator('.footer-section').nth(1).locator('a').first().click();

    await expect(page.locator('.collectors-page')).toBeVisible();

    // Accept loading, empty, or error state, but ensure page content exists.
    const state = page.locator('.loading-container, .empty-container, .error-container, .collectors-list');
    await expect(state.first()).toBeVisible();

    await assertNoHorizontalScroll(page);
  });
});
