import { test, expect } from '@playwright/test';

test.describe('Authenticated (mock) experience', () => {
  test('loads collection manager with stats', async ({ page }) => {
    await page.goto('/?mockAuth=1');
    await expect(page.getByRole('heading', { name: /Moja zbierka|My Collection|Moje sbírka/i })).toBeVisible();
  });

  test('language switcher shows flags only', async ({ page }) => {
    await page.goto('/?mockAuth=1');
    const select = page.locator('select[title="Change language"]').first();
    await expect(select).toBeVisible();

    const optionTexts = await select.locator('option').allTextContents();
    expect(optionTexts.some(t => /Sloven|English|Češt/i.test(t))).toBeFalsy();
  });

  test('view mode buttons order on mobile', async ({ page }) => {
    await page.goto('/?mockAuth=1');

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
    await page.goto('/?mockAuth=1');

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
    await page.goto('/?mockAuth=1');

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
    await page.goto('/?mockAuth=1');

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

    // Edit item (add note)
    await page.locator(`text=${itemName}`).first().click();
    await page.getByPlaceholder(/voliteľné|optional|volitelné/i).fill('E2E note');
    await page.getByRole('button', { name: /Uložiť|Save|Ulozit/i }).click();

    // Switch to cards view and verify note + image
    await page.locator('button:has-text("🏒")').first().click();
    const card = page.locator(`xpath=//div[.//div[normalize-space(text())="${itemName}"] and .//img[@alt="foto"]]`).first();
    await expect(card.locator('text=E2E note')).toBeVisible();
    await expect(card.locator('img[alt="foto"]').first()).toBeVisible();

    // Filter by search
    await page.getByPlaceholder(/Hľadať|Search|Hledat/i).fill('E2E Test Card');
    await expect(page.locator(`text=${itemName}`)).toBeVisible();
  });

  test('portfolio chart and image modal open', async ({ page }) => {
    await page.goto('/?mockAuth=1');

    // Open chart
    await page.locator('button', { hasText: 'Graf' }).first().click();
    await expect(page.getByText('Hodnota zbierky').first()).toBeVisible();

    // Switch to cards view and open image modal
    await page.locator('button:has-text("🏒")').first().click();
    await page.locator('img[alt="foto"]').first().click();
    await expect(page.locator('img[alt="Zväčšený obrázok"]')).toBeVisible();
  });
});
