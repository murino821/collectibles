import { test, expect } from '@playwright/test';
import { assertNoHorizontalScroll, navigateToFooterPage } from './helpers.js';

test.describe('Legal pages navigation', () => {
  test('navigates to How It Works page', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    // Navigate via footer (Product section, 2nd link)
    await navigateToFooterPage(page, 'howto');

    // Verify page loaded
    await expect(page.locator('h1', { hasText: /Ako to funguje|How It Works|Jak to funguje/i })).toBeVisible();
    await expect(page.locator('.howto-steps')).toBeVisible();

    await assertNoHorizontalScroll(page);
  });

  test('navigates to Terms page', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    // Navigate via footer (Legal section, 1st link)
    await navigateToFooterPage(page, 'terms');

    // Verify page loaded
    await expect(page.locator('h1', { hasText: /Podmienky|Terms|Podmínky/i })).toBeVisible();
    await expect(page.locator('.legal-sections')).toBeVisible();

    await assertNoHorizontalScroll(page);
  });

  test('navigates to Privacy page', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    // Navigate via footer (Legal section, 2nd link)
    await navigateToFooterPage(page, 'privacy');

    // Verify page loaded
    await expect(page.locator('h1', { hasText: /Ochrana|Privacy/i })).toBeVisible();
    await expect(page.locator('.legal-sections')).toBeVisible();

    await assertNoHorizontalScroll(page);
  });

  test('back button returns to landing page from Terms', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    // Go to Terms page
    await navigateToFooterPage(page, 'terms');
    await expect(page.locator('.legal-page')).toBeVisible();

    // Click back button
    await page.locator('.back-button').click();

    // Should be back on landing page
    await expect(page.locator('.hero')).toBeVisible();
  });

  test('back button returns to landing page from Privacy', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    // Go to Privacy page
    await navigateToFooterPage(page, 'privacy');
    await expect(page.locator('.legal-page')).toBeVisible();

    // Click back button
    await page.locator('.back-button').click();

    // Should be back on landing page
    await expect(page.locator('.hero')).toBeVisible();
  });

  test('back button returns to landing page from How It Works', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    // Go to How It Works page
    await navigateToFooterPage(page, 'howto');
    await expect(page.locator('.legal-page')).toBeVisible();

    // Click back button
    await page.locator('.back-button').click();

    // Should be back on landing page
    await expect(page.locator('.hero')).toBeVisible();
  });
});

test.describe('How It Works page content', () => {
  test('displays all 4 steps', async ({ page }) => {
    await page.goto('/?mockAuth=0');
    await navigateToFooterPage(page, 'howto');

    // Should have 4 step cards
    await expect(page.locator('.howto-step-card')).toHaveCount(4);
  });

  test('FAQ section is visible', async ({ page }) => {
    await page.goto('/?mockAuth=0');
    await navigateToFooterPage(page, 'howto');

    // FAQ section
    await expect(page.locator('.howto-faq')).toBeVisible();

    // FAQ items
    await expect(page.locator('.faq-item').first()).toBeVisible();
  });

  test('step cards have icons and numbers', async ({ page }) => {
    await page.goto('/?mockAuth=0');
    await navigateToFooterPage(page, 'howto');

    // First step should have number 1
    await expect(page.locator('.howto-step-number').first()).toContainText('1');

    // Step icons are visible
    await expect(page.locator('.howto-step-icon').first()).toBeVisible();
  });
});

test.describe('Terms page content', () => {
  test('displays all 7 sections', async ({ page }) => {
    await page.goto('/?mockAuth=0');
    await navigateToFooterPage(page, 'terms');

    // Should have 7 legal sections
    await expect(page.locator('.legal-section')).toHaveCount(7);
  });

  test('contact section is visible', async ({ page }) => {
    await page.goto('/?mockAuth=0');
    await navigateToFooterPage(page, 'terms');

    // Contact section
    await expect(page.locator('.legal-contact')).toBeVisible();
    await expect(page.locator('text=miroslav.svajda@gmail.com')).toBeVisible();
  });

  test('shows last update date', async ({ page }) => {
    await page.goto('/?mockAuth=0');
    await navigateToFooterPage(page, 'terms');

    // Date should be visible
    await expect(page.locator('.legal-date')).toBeVisible();
  });
});

test.describe('Privacy page content', () => {
  test('displays all 6 sections', async ({ page }) => {
    await page.goto('/?mockAuth=0');
    await navigateToFooterPage(page, 'privacy');

    // Should have 6 legal sections
    await expect(page.locator('.legal-section')).toHaveCount(6);
  });

  test('GDPR rights section has list items', async ({ page }) => {
    await page.goto('/?mockAuth=0');
    await navigateToFooterPage(page, 'privacy');

    // Rights section should have list items
    const listItems = page.locator('.legal-section ul li');
    const count = await listItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test('contact section is visible', async ({ page }) => {
    await page.goto('/?mockAuth=0');
    await navigateToFooterPage(page, 'privacy');

    // Contact section
    await expect(page.locator('.legal-contact')).toBeVisible();
    await expect(page.locator('text=miroslav.svajda@gmail.com')).toBeVisible();
  });
});

test.describe('Legal pages language support', () => {
  test('How It Works page respects language setting', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    // Change language to English
    await page.locator('.footer').scrollIntoViewIfNeeded();
    const langSwitcher = page.locator('select[title="Change language"]').first();
    await langSwitcher.selectOption('en');

    // Navigate to How It Works
    await navigateToFooterPage(page, 'howto');

    // Should show English title
    await expect(page.locator('h1', { hasText: /How It Works/i })).toBeVisible();
  });

  test('Terms page respects language setting', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    // Change language to English
    await page.locator('.footer').scrollIntoViewIfNeeded();
    const langSwitcher = page.locator('select[title="Change language"]').first();
    await langSwitcher.selectOption('en');

    // Navigate to Terms
    await navigateToFooterPage(page, 'terms');

    // Should show English title
    await expect(page.locator('h1', { hasText: /Terms of Use/i })).toBeVisible();
  });

  test('Privacy page respects language setting', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    // Change language to English
    await page.locator('.footer').scrollIntoViewIfNeeded();
    const langSwitcher = page.locator('select[title="Change language"]').first();
    await langSwitcher.selectOption('en');

    // Navigate to Privacy
    await navigateToFooterPage(page, 'privacy');

    // Should show English title
    await expect(page.locator('h1', { hasText: /Privacy Policy/i })).toBeVisible();
  });
});
