// @ts-check
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const useWebServer = !process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: useWebServer ? {
    command: 'VITE_MOCK_AUTH=1 npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 60_000,
  } : undefined,
  projects: [
    // Mobile projects
    {
      name: 'mobile-iphone-se',
      use: { ...devices['iPhone SE'] },
    },
    {
      name: 'mobile-iphone-12',
      use: { ...devices['iPhone 12'] },
    },
    {
      name: 'mobile-pixel-5',
      use: { ...devices['Pixel 5'] },
    },
    // Desktop projects
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'desktop-firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'desktop-safari',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
