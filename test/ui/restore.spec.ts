// dashboard :: Window reload with the dashboard open.

import { expect, test } from '@playwright/test';
import { createMainFixture } from '../integration/fixtures/repos';
import { dashboard, focusRow, launch, openDashboard, row, runCommand, type VsCode } from './vscode';

let vscode: VsCode;

test.beforeAll(async () => {
  vscode = await launch(createMainFixture());
});

test.afterAll(async () => {
  await vscode?.close();
});

test('restores the filter, chips and selection after a window reload', async () => {
  const { page } = vscode;
  let frame = await openDashboard(page);
  await focusRow(frame, 'billing-api');
  await page.keyboard.press('Space');
  await page.keyboard.press('2');
  await frame.locator('input.filter').fill('bill');
  await expect(frame.locator('[data-chip="dirty"]')).toHaveAttribute('aria-pressed', 'true');

  await runCommand(page, 'Developer: Reload Window');
  await page.waitForSelector('.monaco-workbench', { timeout: 60_000 });
  frame = dashboard(page);
  await expect(row(frame, 'billing-api')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.tab', { hasText: 'RepoHangar' })).toHaveCount(1);
  await expect(frame.locator('input.filter')).toHaveValue('bill');
  await expect(frame.locator('[data-chip="dirty"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(row(frame, 'billing-api')).toHaveAttribute('aria-selected', 'true');
});
