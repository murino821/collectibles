import { test, expect } from '@playwright/test';
import { assertNoHorizontalScroll, navigateToFooterPage, login, seedTestData } from './helpers.js';

test.describe('Mobile landing page', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile-'), 'Mobile-only tests');
  });
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

  test('footer renders all three sections', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    await expect(page.locator('.footer')).toBeVisible();
    await expect(page.locator('.footer-section')).toHaveCount(3); // Product, Community, Legal

    await assertNoHorizontalScroll(page);
  });

  test('features section scrolls into view on CTA click', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    // Click "Learn more" / "Zistiť viac" button
    await page.locator('.btn-secondary', { hasText: /Zistiť|Learn|Zjistit/i }).click();

    // Wait for scroll
    await page.waitForTimeout(500);

    // Features section should be in viewport
    const featuresVisible = await page.locator('#features').isVisible();
    expect(featuresVisible).toBeTruthy();
  });

  test('top cards section renders on landing page', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    // TopCards component should be visible
    const topCards = page.locator('text=/Top 10|Najcennejšie/i');
    await expect(topCards.first()).toBeVisible();
  });

  test('language switcher is accessible in footer', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    // Scroll to footer
    await page.locator('.footer').scrollIntoViewIfNeeded();

    // Language switcher should be visible
    const langSwitcher = page.locator('select[title="Change language"]');
    await expect(langSwitcher.first()).toBeVisible();
  });
});

test.describe('Collectors page', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile-'), 'Mobile-only tests');
  });
  test('navigates to collectors page and shows stable layout', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    // Navigate via footer
    await navigateToFooterPage(page, 'collectors');

    await expect(page.locator('.collectors-page')).toBeVisible();

    // Accept loading, empty, or error state
    const state = page.locator('.loading-container, .empty-container, .error-container, .collectors-list');
    await expect(state.first()).toBeVisible();

    await assertNoHorizontalScroll(page);
  });

  test('back button returns to landing page', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    // Navigate to collectors
    await navigateToFooterPage(page, 'collectors');
    await expect(page.locator('.collectors-page')).toBeVisible();

    // Click back
    await page.locator('text=/Späť|Back|Zpět/i').first().click();

    // Should be back on landing
    await expect(page.locator('.hero')).toBeVisible();
  });
});

test.describe('Mobile collection manager', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('mobile-'), 'Mobile-only tests');
  });
  test.beforeEach(async () => {
    await seedTestData();
  });
  test('collection manager loads with mock auth', async ({ page }) => {
    await login(page);

    await expect(page.getByRole('heading', { name: /Moja zbierka|My Collection|Moje sbírka/i })).toBeVisible();
    await assertNoHorizontalScroll(page);
  });

  test('add modal fits mobile viewport', async ({ page }) => {
    await login(page);

    // Open add modal
    await page.locator('button', { hasText: '+' }).first().click();

    // Modal should be visible and fit viewport
    const modalContent = page.locator('[class*="modal-content"], .modal-content').first();
    await expect(modalContent).toBeVisible();

    const fitsViewport = await modalContent.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width <= window.innerWidth;
    });
    expect(fitsViewport).toBeTruthy();
  });

  test('stats cards are visible on mobile', async ({ page }) => {
    await login(page);

    // Stats should be visible
    const stats = page.locator('text=/Hodnota zbierky|Collection Value|Hodnota sbírky/i');
    await expect(stats.first()).toBeVisible();
  });

  test('view mode buttons are all visible', async ({ page }) => {
    await login(page);

    // All 4 view buttons should be visible
    const buttons = [
      page.locator('button:has-text("📋")'),
      page.locator('button:has-text("🏒")'),
      page.locator('button:has-text("🖼️")'),
      page.locator('button:has-text("📊")'),
    ];
    for (const btn of buttons) {
      await btn.first().scrollIntoViewIfNeeded();
      await expect(btn.first()).toBeVisible();
    }
  });
});
