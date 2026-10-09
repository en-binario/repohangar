// git-operations scenarios in a real VS Code window: Publish tooltip on an unpublished branch, Menu by keyboard, Push
// key with rows selected, Discard canceled in VS Code's confirmation, Pull from the behind notification and Fetch fails.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { createMainFixture, git, type Fixture } from '../integration/fixtures/repos';
import { focusRow, launch, notification, openDashboard, row, type VsCode } from './vscode';

let vscode: VsCode;
let page: Page;
let frame: FrameLocator;
let fixture: Fixture;

const samePath = (a: string, b: string) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);

test.beforeAll(async () => {
  fixture = createMainFixture();
  // web-shop pushes to its local remote instead of GitHub.
  git(fixture.repo('frontend/web-shop'), 'remote', 'set-url', '--push', 'origin', join(fixture.remotes, 'web-shop.git'));
  // VS Code's own dialogs as DOM, so the test can click them.
  vscode = await launch(fixture, { settings: { 'window.dialogStyle': 'custom' } });
  page = vscode.page;
  frame = await openDashboard(page);
});

test.afterAll(async () => {
  await vscode?.close();
});

test('names the push button Publish on a branch without upstream', async () => {
  await row(frame, 'auth-service').hover();
  const button = row(frame, 'auth-service').locator('button.row-action').nth(2);
  await expect(button).toBeVisible();
  await expect(button).toHaveText('⇡');
  await expect(button).toHaveAttribute('title', 'Publish');
  await expect(button).toHaveAttribute('aria-label', 'Publish');
  await expect(row(frame, 'web-shop').locator('button.row-action').nth(2)).toHaveAttribute('title', 'Push');
});

test('copies the path from the more-actions menu by keyboard', async () => {
  await vscode.app.evaluate(({ clipboard }) => clipboard.writeText(''));
  await focusRow(frame, 'billing-api');
  await page.keyboard.press('.');
  const menu = frame.getByRole('menu', { name: 'Actions for billing-api' });
  await expect(menu).toBeVisible();
  for (let i = 0; i < 12; i++) {
    const action = await frame.locator('body').evaluate(() => document.activeElement?.getAttribute('data-action'));
    if (action === 'copyPath') break;
    await page.keyboard.press('ArrowDown');
  }
  await expect(menu.locator('[data-action="copyPath"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect
    .poll(async () => samePath(await vscode.app.evaluate(({ clipboard }) => clipboard.readText()), fixture.repo('backend/billing-api')))
    .toBe(true);
});

test('pushes only the focused row with rows selected', async () => {
  await focusRow(frame, 'billing-api');
  await page.keyboard.press('Space');
  await focusRow(frame, 'ledger');
  await page.keyboard.press('Space');
  await expect(frame.locator('.selected-count')).toHaveText('2 selected');
  await expect(row(frame, 'web-shop').locator('[data-col="sync"]')).toHaveText('↑1');
  await focusRow(frame, 'web-shop');
  await page.keyboard.press('Shift+P');
  await expect(row(frame, 'web-shop').locator('[data-col="sync"]')).toHaveText('—', { timeout: 30_000 });
  await expect(row(frame, 'billing-api').locator('[data-col="sync"]')).toHaveText('↑2');
  await expect(row(frame, 'ledger').locator('[data-col="sync"]')).toHaveText('↓2');
  await page.keyboard.press('Escape');
  await expect(frame.locator('.selected-count')).toHaveCount(0);
});

test("leaves the working tree unchanged when VS Code's discard confirmation is canceled", async () => {
  const billing = fixture.repo('backend/billing-api');
  const status = git(billing, 'status', '--porcelain');
  const readme = readFileSync(join(billing, 'README.md'), 'utf8');
  await focusRow(frame, 'billing-api');
  await page.keyboard.press('.');
  await frame.locator('[data-action="discardAll"]').click();
  const dialog = page.locator('.monaco-dialog-box');
  await expect(dialog).toBeVisible();
  await dialog.locator('.monaco-button', { hasText: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  expect(git(billing, 'status', '--porcelain')).toBe(status);
  expect(readFileSync(join(billing, 'README.md'), 'utf8')).toBe(readme);
});

test('pulls from the behind notification', async () => {
  await focusRow(frame, 'ledger');
  await page.keyboard.press('Shift+P');
  const toast = notification(page, "The remote branch of ledger has 2 commits you don't have.");
  await expect(toast).toBeVisible();
  await expect(row(frame, 'ledger').locator('[data-col="sync"]')).toHaveText('↷ behind (↓2)');
  await toast.locator('.monaco-button', { hasText: 'Pull' }).click();
  await expect(row(frame, 'ledger').locator('[data-col="sync"]')).toHaveText('—', { timeout: 30_000 });
});

test('shows a failed fetch with Show Git Output', async () => {
  await focusRow(frame, 'billing-api');
  await page.keyboard.press('f');
  // billing-api's remote host does not exist.
  const toast = notification(page, 'Fetch failed in billing-api: ');
  await expect(toast).toBeVisible({ timeout: 30_000 });
  await expect(toast.locator('.monaco-button', { hasText: 'Show Git Output' })).toBeVisible();
  await expect(row(frame, 'billing-api').locator('[data-col="sync"]')).toHaveText('✗ fetch failed');
});
