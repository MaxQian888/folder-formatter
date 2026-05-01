import { expect, test } from '@playwright/test';

test.describe('Format Files webview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the title, version badge, and three primary actions', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /format files/i })).toBeVisible();
    await expect(page.getByText(/^v\d+\.\d+\.\d+/)).toBeVisible();
    await expect(page.getByRole('button', { name: /run on workspace/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /run on git changes/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /run from glob/i })).toBeVisible();
  });

  test('shows three tabs', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /settings/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /history/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /logs/i })).toBeVisible();
  });

  test('settings tab exposes core toggles, including Git scope and dry-run', async ({ page }) => {
    await page.getByRole('tab', { name: /settings/i }).click();
    await expect(page.getByLabel(/run organize imports/i)).toBeVisible();
    await expect(page.getByLabel(/use \.gitignore/i)).toBeVisible();
    await expect(page.getByLabel(/inherit workspace files\.exclude/i)).toBeVisible();
    await expect(page.getByLabel(/extensions to include/i)).toBeVisible();
    await expect(page.getByLabel(/include staged/i)).toBeVisible();
    await expect(page.getByLabel(/include modified/i)).toBeVisible();
    await expect(page.getByLabel(/include untracked/i)).toBeVisible();
    await expect(page.getByLabel(/preview before each run/i)).toBeVisible();
  });

  test('history tab shows the empty state', async ({ page }) => {
    await page.getByRole('tab', { name: /history/i }).click();
    await expect(page.getByText(/no runs yet/i)).toBeVisible();
  });

  test('logs tab is keyboard-accessible', async ({ page }) => {
    await page.getByRole('tab', { name: /logs/i }).click();
    const search = page.getByPlaceholder(/search/i);
    await expect(search).toBeVisible();
    await search.fill('something');
    await expect(search).toHaveValue('something');
  });
});

test.describe('Responsive layout', () => {
  test('mobile viewport keeps header actions visible', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 720 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /run on workspace/i })).toBeVisible();
  });

  test('desktop viewport renders the multi-card settings layout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await page.getByRole('tab', { name: /settings/i }).click();
    await expect(page.getByText(/^Filters$/)).toBeVisible();
    await expect(page.getByText(/^Behavior$/)).toBeVisible();
    await expect(page.getByText(/^Git changes$/)).toBeVisible();
    await expect(page.getByText(/^Appearance$/)).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('tabs are reachable via keyboard navigation', async ({ page }) => {
    await page.getByRole('tab', { name: /settings/i }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: /history/i })).toBeFocused();
  });

  test('settings inputs have associated labels', async ({ page }) => {
    await page.getByRole('tab', { name: /settings/i }).click();
    await expect(page.getByLabel(/extensions to include/i)).toBeVisible();
    await expect(page.getByLabel(/log level/i)).toBeVisible();
    await expect(page.getByLabel(/^language$/i)).toBeVisible();
  });
});
