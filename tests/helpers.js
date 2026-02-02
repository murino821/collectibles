/**
 * Shared helper functions for E2E tests
 */

import { expect } from '@playwright/test';

/**
 * Assert that the page has no horizontal scroll
 * @param {import('@playwright/test').Page} page
 */
export const assertNoHorizontalScroll = async (page) => {
  const hasOverflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1;
  });
  expect(hasOverflow).toBeFalsy();
};

/**
 * Create a new card in the collection
 * @param {import('@playwright/test').Page} page
 * @param {Object} options
 * @param {string} options.name - Card name
 * @param {string} [options.buyPrice] - Buy price
 * @param {string} [options.currentPrice] - Current price
 * @param {string} [options.note] - Note
 * @param {boolean} [options.withImage] - Whether to add a mock image
 */
export const createCard = async (page, { name, buyPrice, currentPrice, note, withImage }) => {
  // Open add modal
  await page.locator('button', { hasText: '+' }).first().click();

  // Fill name
  await page.getByPlaceholder(/napr\.|e\.g\./i).fill(name);

  // Fill prices
  if (buyPrice) {
    await page.getByRole('spinbutton').nth(0).fill(buyPrice);
  }
  if (currentPrice) {
    await page.getByRole('spinbutton').nth(1).fill(currentPrice);
  }

  // Fill note
  if (note) {
    await page.getByPlaceholder(/voliteľné|optional|volitelné/i).fill(note);
  }

  // Add image
  if (withImage) {
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'card.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    });
  }

  // Save
  await page.getByRole('button', { name: /Uložiť|Save|Uložit/i }).click();
};

/**
 * Delete a card from the collection
 * @param {import('@playwright/test').Page} page
 * @param {string} cardName - Name of the card to delete
 */
export const deleteCard = async (page, cardName) => {
  // Find and click the card row/item
  await page.locator(`text=${cardName}`).first().click();

  // Click delete button
  await page.locator('button', { hasText: '🗑️' }).first().click();

  // Confirm deletion
  await page.getByRole('button', { name: /Zmazať|Delete|Smazat/i }).click();
};

/**
 * Sell a card
 * @param {import('@playwright/test').Page} page
 * @param {string} soldPrice - Selling price
 */
export const sellCard = async (page, soldPrice) => {
  // Click sell button
  await page.locator('button', { hasText: '💰' }).first().click();

  // Enter sold price
  await page.getByPlaceholder(/Zadaj|Enter|Zadejte/i).fill(soldPrice);

  // Confirm sale
  await page.getByRole('button', { name: /Potvrdiť|Confirm|Potvrdit/i }).click();
};

/**
 * Switch to a specific view mode
 * @param {import('@playwright/test').Page} page
 * @param {'table'|'cards'|'gallery'|'chart'} view
 */
export const switchView = async (page, view) => {
  const viewIcons = {
    table: '📊',
    cards: '🏒',
    gallery: '🖼️',
    chart: '📈'
  };
  await page.locator(`button:has-text("${viewIcons[view]}")`).first().click();
};

/**
 * Apply status filter
 * @param {import('@playwright/test').Page} page
 * @param {'all'|'zbierka'|'predaná'} status
 */
export const filterByStatus = async (page, status) => {
  await page.locator('select').filter({ has: page.locator('option[value="predaná"]') }).first().selectOption(status);
};

/**
 * Apply search filter
 * @param {import('@playwright/test').Page} page
 * @param {string} searchText
 */
export const searchCards = async (page, searchText) => {
  await page.getByPlaceholder(/Hľadať|Search|Hledat/i).fill(searchText);
};

/**
 * Navigate to a legal page from footer
 * @param {import('@playwright/test').Page} page
 * @param {'howto'|'terms'|'privacy'|'collectors'} pageName
 */
export const navigateToFooterPage = async (page, pageName) => {
  await page.locator('.footer').waitFor({ state: 'visible' });
  await page.locator('.footer').scrollIntoViewIfNeeded();
  const footerSections = {
    howto: { section: 0, link: 1 },      // Product section, 2nd link
    terms: { section: 2, link: 0 },       // Legal section, 1st link
    privacy: { section: 2, link: 1 },     // Legal section, 2nd link
    collectors: { section: 1, link: 0 }   // Community section, 1st link
  };

  const { section, link } = footerSections[pageName];
  await page.locator('.footer-section').nth(section).locator('a').nth(link).click();

  const targetSelector = pageName === 'collectors' ? '.collectors-page' : '.legal-page';
  await page.locator(targetSelector).first().waitFor({ state: 'visible' });
};
