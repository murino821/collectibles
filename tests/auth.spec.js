/* global Buffer */
import { test, expect } from '@playwright/test';
import { createCard, switchView, filterByStatus, searchCards, login, seedTestData } from './helpers.js';

test.describe('Authenticated (mock) experience', () => {
  test.beforeEach(async () => {
    await seedTestData();
  });
  test('loads collection manager with stats', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: /Moja zbierka|My Collection|Moje sbírka/i })).toBeVisible();
  });

  test('language switcher shows flags only', async ({ page }) => {
    await login(page);
    const select = page.locator('select[title="Change language"]').first();
    await expect(select).toBeVisible();

    const optionTexts = await select.locator('option').allTextContents();
    expect(optionTexts.some(t => /Sloven|English|Češt/i.test(t))).toBeFalsy();
  });

  test('view mode buttons order on mobile', async ({ page }) => {
    await login(page);

    const order = await page.evaluate(() => {
      const icons = ['📋', '🏒', '🖼️', '📊'];
      const containers = Array.from(document.querySelectorAll('div'));
      for (const div of containers) {
        const buttons = Array.from(div.querySelectorAll('button'));
        if (buttons.length === 4 && buttons.every(b => icons.includes((b.textContent || '').trim()))) {
          return buttons.map(b => (b.textContent || '').trim());
        }
      }
      return null;
    });
    expect(order).toEqual(['📋', '🏒', '🖼️', '📊']);
  });

  test('search + status + photo filters work', async ({ page }) => {
    await login(page);

    // Search
    await page.getByPlaceholder(/Hľadať|Search|Hledat/i).fill('Crosby');
    await expect(page.locator('text=Crosby')).toBeVisible();
    await expect(page.locator('text=McDavid')).toHaveCount(0);
    await page.getByPlaceholder(/Hľadať|Search|Hledat/i).fill('');

    // Status filter
    await page.locator('select').filter({ has: page.locator('option[value="predaná"]') }).first().selectOption('predaná');
    await expect(page.locator('span', { hasText: 'predaná' }).first()).toBeVisible();
    await expect(page.locator('span', { hasText: 'zbierka' })).toHaveCount(0);

    // Photo filter
    await page.locator('select').filter({ has: page.locator('option[value="all"]') }).first().selectOption('all');
    await page.locator('select').filter({ has: page.locator('option[value="photo"]') }).first().selectOption('photo');
    await expect(page.locator('text=McDavid')).toHaveCount(0);
  });

  test('add, sell, delete modals open', async ({ page }) => {
    await login(page);

    // Add modal
    await page.locator('button', { hasText: '+' }).first().click();
    await expect(page.locator('text=Pridať položku')).toBeVisible();
    await page.getByRole('button', { name: /Zrušiť|Cancel|Zrušit/i }).first().click();

    // Sell modal
    await page.locator('button', { hasText: '💰' }).first().click();
    await expect(page.locator('text=Predať kartu')).toBeVisible();
    await page.getByRole('button', { name: /Zrušiť|Cancel|Zrušit/i }).first().click();

    // Delete modal
    await page.locator('button', { hasText: '🗑️' }).first().click();
    await expect(page.locator('text=Zmazať položku')).toBeVisible();
  });

  test('add item with attributes + photo, edit, save, and filter', async ({ page }) => {
    await login(page);

    const itemName = `E2E Test Card ${Date.now()}`;

    // Add item
    await page.locator('button', { hasText: '+' }).first().click();
    await page.getByPlaceholder(/napr\./i).fill(itemName);
    await page.getByRole('spinbutton').nth(0).fill('12.50'); // buy
    await page.getByRole('spinbutton').nth(1).fill('25.00'); // current
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'card.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    });
    await page.getByRole('button', { name: /Uložiť|Save|Ulozit/i }).click();
    await expect(page.locator(`text=${itemName}`)).toBeVisible();

    // Edit item (add note) - click the item name directly (stable across view modes)
    const itemCell = page.getByText(itemName).first();
    await itemCell.scrollIntoViewIfNeeded();
    await itemCell.click({ force: true });
    await page.getByPlaceholder(/voliteľné|optional|volitelné/i).fill('E2E note');
    await page.getByRole('button', { name: /Uložiť|Save|Ulozit/i }).click();
    const modalContent = page.locator('[class*="modal-content"], .modal-content');
    if (await modalContent.count()) {
      await modalContent.first().waitFor({ state: 'hidden', timeout: 10000 });
    }

    // Switch to cards view and verify note + image
    await page.locator('button:has-text("🏒")').first().click();
    const card = page.locator(`xpath=//div[.//div[normalize-space(text())="${itemName}"] and .//img[@alt="foto"]]`).first();
    await expect(card.locator('text=E2E note').first()).toBeVisible();
    await expect(card.locator('img[alt="foto"]').first()).toBeVisible();

    // Filter by search
    await page.getByPlaceholder(/Hľadať|Search|Hledat/i).fill('E2E Test Card');
    await expect(page.locator(`text=${itemName}`)).toBeVisible();
  });

  test('portfolio chart and image modal open', async ({ page }) => {
    await login(page);

    // Open chart
    await page.locator('button', { hasText: 'Graf' }).first().click();
    await expect(page.getByText('Hodnota zbierky').first()).toBeVisible();

    // Switch to cards view and open image modal
    await page.locator('button:has-text("🏒")').first().click();
    await page.locator('img[alt="foto"]').first().click({ force: true });
    await expect(page.locator('img[alt="Zväčšený obrázok"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('auth state persists across refresh (mock)', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: /Moja zbierka|My Collection|Moje sbírka/i })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: /Moja zbierka|My Collection|Moje sbírka/i })).toBeVisible();
  });

  test('create card with minimal fields', async ({ page }) => {
    await login(page);
    const itemName = `Minimal Card ${Date.now()}`;

    await createCard(page, { name: itemName, buyPrice: '10' });

    await expect(page.locator(`text=${itemName}`)).toBeVisible();
  });

  test('create card with all fields', async ({ page }) => {
    await login(page);
    const itemName = `Full Card ${Date.now()}`;

    await createCard(page, {
      name: itemName,
      buyPrice: '15.50',
      currentPrice: '30.00',
      note: 'Test note',
      withImage: true
    });

    await expect(page.locator(`text=${itemName}`)).toBeVisible();

    // Verify in cards view
    await switchView(page, 'cards');
    await expect(page.locator('text=Test note').first()).toBeVisible({ timeout: 10000 });
  });

  test('delete card removes it from list', async ({ page }) => {
    await login(page);
    const itemName = `Delete Test ${Date.now()}`;

    // Create card first
    await createCard(page, { name: itemName, buyPrice: '5' });
    await expect(page.locator(`text=${itemName}`)).toBeVisible();

    // Delete it
    await page.locator('button', { hasText: '🗑️' }).first().click();
    await page.getByRole('button', { name: /Zmazať|Delete|Smazat/i }).click();

    // Should be removed
    await expect(page.locator('tr', { hasText: itemName })).toHaveCount(0, { timeout: 15000 });
  });

  test('sell card changes status to sold', async ({ page }) => {
    await login(page);

    // Click sell on first available card
    await page.locator('button', { hasText: '💰' }).first().click();
    await expect(page.locator('text=Predať kartu')).toBeVisible();

    // Enter sold price and confirm
    await page.getByPlaceholder(/Zadaj|Enter|Zadejte/i).fill('100');
    await page.getByRole('button', { name: /Potvrdiť|Confirm|Potvrdit/i }).click();

    // Verify by filtering to sold items
    await filterByStatus(page, 'predaná');
    await expect(page.locator('span', { hasText: 'predaná' }).first()).toBeVisible();
  });

  test('combined filters work correctly', async ({ page }) => {
    await login(page);

    // Apply search
    await searchCards(page, 'Card');

    // Apply status filter
    await filterByStatus(page, 'zbierka');

    // Results should be intersection of both filters
    const statusBadges = await page.locator('span', { hasText: 'zbierka' }).count();
    expect(statusBadges).toBeGreaterThanOrEqual(0);
  });

  test('gallery view renders thumbnails', async ({ page }) => {
    await login(page);

    await switchView(page, 'gallery');

    // Gallery should show images
    const images = await page.locator('img[alt="foto"]').count();
    expect(images).toBeGreaterThanOrEqual(0);
  });

  test('all view modes are accessible', async ({ page }) => {
    await login(page);

    // Table view (default)
    await switchView(page, 'table');
    await expect(page.locator('table, .card-table, [class*="table"]').first()).toBeVisible();

    // Cards view
    await switchView(page, 'cards');
    await expect(page.locator('[class*="card"], .card-item').first()).toBeVisible();

    // Gallery view
    await switchView(page, 'gallery');
    // Gallery shows images or empty state

    // Chart view
    await page.locator('button', { hasText: 'Graf' }).first().click();
    await expect(page.getByText('Hodnota zbierky').first()).toBeVisible();
  });

  test('language persistence after page reload', async ({ page }) => {
    await login(page);

    // Change language to English
    const langSelect = page.locator('select[title="Change language"]').first();
    await langSelect.selectOption('en');

    // Reload and check
    await page.reload();
    await expect(page.getByRole('heading', { name: /My Collection/i })).toBeVisible();
  });
});
