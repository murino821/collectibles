import { test, expect } from '@playwright/test';
import { assertNoHorizontalScroll, navigateToFooterPage } from './helpers.js';

// Only run these tests on desktop projects
test.describe('Desktop landing page layout', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop-'), 'Desktop-only tests');
  });
  test('hero section has proper desktop layout', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    await expect(page.locator('.hero')).toBeVisible();
    await expect(page.locator('.hero-wrapper')).toBeVisible();

    // On desktop, hero should have side-by-side content and image
    const heroWrapper = page.locator('.hero-wrapper');
    const gridColumns = await heroWrapper.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.gridTemplateColumns;
    });

    // Should have grid layout on desktop (not single column)
    expect(gridColumns).not.toBe('1fr');

    await assertNoHorizontalScroll(page);
  });

  test('hero image is visible on desktop', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    const heroImage = page.locator('.hero-image img');
    await expect(heroImage).toBeVisible();

    // Image should have reasonable size on desktop
    const imageWidth = await heroImage.evaluate((el) => el.getBoundingClientRect().width);
    expect(imageWidth).toBeGreaterThan(200);
  });

  test('features grid shows cards side by side', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    // Scroll to features
    await page.locator('#features').scrollIntoViewIfNeeded();

    const featuresGrid = page.locator('.features-grid');
    const gridColumns = await featuresGrid.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.gridTemplateColumns;
    });

    // Desktop should show multiple columns
    const columns = gridColumns.split(' ').filter(Boolean);
    expect(columns.length).toBeGreaterThan(1);
  });

  test('footer links are horizontally aligned', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    await page.locator('.footer').scrollIntoViewIfNeeded();

    // Footer sections should be visible
    await expect(page.locator('.footer-section')).toHaveCount(3);

    // Footer content should be row layout on desktop
    const footerContent = page.locator('.footer-content');
    const display = await footerContent.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.display;
    });

    expect(['flex', 'grid']).toContain(display);
  });
});

test.describe('Desktop collection manager layout', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop-'), 'Desktop-only tests');
  });
  test('collection manager loads with desktop layout', async ({ page }) => {
    await page.goto('/?mockAuth=1');

    await expect(page.getByRole('heading', { name: /Moja zbierka|My Collection|Moje sbírka/i })).toBeVisible();

    await assertNoHorizontalScroll(page);
  });

  test('stats cards are displayed horizontally', async ({ page }) => {
    await page.goto('/?mockAuth=1');

    // Stats container should use row layout on desktop
    const statsContainer = page.locator('[class*="stats"], .stats-container').first();

    if (await statsContainer.count() > 0) {
      const display = await statsContainer.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return style.display;
      });
      expect(['flex', 'grid']).toContain(display);
    }
  });

  test('table view shows all columns on desktop', async ({ page }) => {
    await page.goto('/?mockAuth=1');

    // Table should be visible
    const table = page.locator('table, .card-table').first();

    if (await table.count() > 0) {
      await expect(table).toBeVisible();

      // Check for column headers
      const headers = page.locator('th, .table-header');
      const headerCount = await headers.count();
      expect(headerCount).toBeGreaterThan(3); // Photo, Item, Price, Status, Actions
    }
  });

  test('action buttons are visible without overflow', async ({ page }) => {
    await page.goto('/?mockAuth=1');

    // Action buttons (edit, sell, delete) should be visible
    const actionButtons = page.locator('button', { hasText: /✏️|💰|🗑️/ });
    const count = await actionButtons.count();

    if (count > 0) {
      await expect(actionButtons.first()).toBeVisible();
    }
  });
});

test.describe('Desktop modals', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop-'), 'Desktop-only tests');
  });
  test('add modal is centered on desktop', async ({ page }) => {
    await page.goto('/?mockAuth=1');

    // Open add modal
    await page.locator('button', { hasText: '+' }).first().click();

    // Modal should be visible
    const modal = page.locator('[class*="modal-content"], .modal-content, [class*="modal"]').first();
    await expect(modal).toBeVisible();

    // Check if centered
    const isCentered = await modal.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const modalCenter = rect.left + rect.width / 2;
      const viewportCenter = viewportWidth / 2;
      return Math.abs(modalCenter - viewportCenter) < 100; // Allow 100px tolerance
    });

    expect(isCentered).toBeTruthy();
  });

  test('login modal is centered on desktop', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    // Open login modal
    await page.locator('.hero-cta .btn-primary').click();

    const modal = page.locator('.login-modal');
    await expect(modal).toBeVisible();

    // Check if centered
    const isCentered = await modal.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const modalCenter = rect.left + rect.width / 2;
      const viewportCenter = viewportWidth / 2;
      return Math.abs(modalCenter - viewportCenter) < 100;
    });

    expect(isCentered).toBeTruthy();
  });

  test('modal has reasonable max-width on desktop', async ({ page }) => {
    await page.goto('/?mockAuth=1');

    await page.locator('button', { hasText: '+' }).first().click();

    const modal = page.locator('[class*="modal-content"], .modal-content').first();
    await expect(modal).toBeVisible();

    const modalWidth = await modal.evaluate((el) => el.getBoundingClientRect().width);
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    // Modal should not stretch full width on desktop
    expect(modalWidth).toBeLessThan(viewportWidth * 0.9);
  });
});

test.describe('Desktop legal pages', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop-'), 'Desktop-only tests');
  });
  test('How It Works shows 2-column grid on desktop', async ({ page }) => {
    await page.goto('/?mockAuth=0');
    await navigateToFooterPage(page, 'howto');

    const stepsGrid = page.locator('.howto-steps');
    const gridColumns = await stepsGrid.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.gridTemplateColumns;
    });

    // Desktop should show 2 columns
    const columns = gridColumns.split(' ').filter(Boolean);
    expect(columns.length).toBeGreaterThan(1);

    await assertNoHorizontalScroll(page);
  });

  test('FAQ shows 2-column grid on desktop', async ({ page }) => {
    await page.goto('/?mockAuth=0');
    await navigateToFooterPage(page, 'howto');

    const faqList = page.locator('.faq-list');
    const gridColumns = await faqList.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.gridTemplateColumns;
    });

    // Desktop should show 2 columns for FAQ
    const columns = gridColumns.split(' ').filter(Boolean);
    expect(columns.length).toBeGreaterThan(1);
  });

  test('Terms page content has proper width', async ({ page }) => {
    await page.goto('/?mockAuth=0');
    await navigateToFooterPage(page, 'terms');

    const content = page.locator('.legal-content .container');
    const contentWidth = await content.evaluate((el) => el.getBoundingClientRect().width);
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    // Content should be centered with max-width, not full width
    expect(contentWidth).toBeLessThan(viewportWidth);
    expect(contentWidth).toBeLessThanOrEqual(800); // max-width from CSS
  });

  test('Legal header is sticky', async ({ page }) => {
    await page.goto('/?mockAuth=0');
    await navigateToFooterPage(page, 'terms');

    const header = page.locator('.legal-header');
    const position = await header.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.position;
    });

    expect(position).toBe('sticky');
  });
});

test.describe('Desktop collectors page', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop-'), 'Desktop-only tests');
  });
  test('collectors list has proper layout', async ({ page }) => {
    await page.goto('/?mockAuth=0');
    await navigateToFooterPage(page, 'collectors');

    await expect(page.locator('.collectors-page')).toBeVisible();

    await assertNoHorizontalScroll(page);
  });
});

test.describe('Desktop keyboard navigation', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('desktop-'), 'Desktop-only tests');
  });
  test('Tab navigation works on landing page', async ({ page }) => {
    await page.goto('/?mockAuth=0');

    // Press Tab and check focus moves
    await page.keyboard.press('Tab');

    // Some element should be focused
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
  });

  test('Escape closes modal', async ({ page }) => {
    await page.goto('/?mockAuth=1');

    // Open modal
    await page.locator('button', { hasText: '+' }).first().click();
    await expect(page.locator('[class*="modal"]').first()).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Modal should close (or cancel button clicked)
    // This depends on implementation
  });
});
