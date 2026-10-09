// batch-operations :: Pull all result panel, on the main fixture: Pull (ff) of 4 selected rows from the toolbar ends
// with one failure (billing-api's remote host does not exist), two skips and one fast-forward.

import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { createMainFixture } from '../integration/fixtures/repos';
import { focusRow, launch, openDashboard, type VsCode } from './vscode';

let vscode: VsCode;
let page: Page;
let frame: FrameLocator;

test.beforeAll(async () => {
  vscode = await launch(createMainFixture());
  page = vscode.page;
  frame = await openDashboard(page);
});

test.afterAll(async () => {
  await vscode?.close();
});

test('shows the result panel above the grid after Pull (ff) from the dashboard', async () => {
  for (const repo of ['ledger', 'billing-api', 'notifications', 'auth-service']) {
    await focusRow(frame, repo);
    await page.keyboard.press('Space');
  }
  await expect(frame.locator('.selected-count')).toHaveText('4 selected');
  await frame.locator('[data-batch="pullFf"]').click();

  const panel = frame.locator('.batch-result');
  await expect(panel).toBeVisible({ timeout: 60_000 });
  // Above the grid.
  const [panelBox, gridBox] = await Promise.all([panel.boundingBox(), frame.locator('.grid').boundingBox()]);
  expect((panelBox?.y ?? 0) < (gridBox?.y ?? 0)).toBe(true);

  await expect(panel.locator('.batch-result-title')).toHaveText(/^Pull all \(ff\) — finished in \d+\.\d s$/);
  await expect(panel.locator('.batch-result-counts')).toHaveText('✓ 1 updated · ↷ 2 skipped · ✗ 1 failed');
  const lines = await panel.locator('.batch-result-text').allTextContents();
  expect(lines).toHaveLength(4);
  expect(lines[0]).toMatch(/^✗ billing-api {2}fetch failed: .+/);
  expect(lines.slice(1)).toEqual(['↷ auth-service  dirty (2 files)', '↷ notifications  diverged (↑1 ↓1)', '✓ ledger  fast-forwarded 2 commits']);

  const buttons = (repo: string) => panel.locator(`[data-result-repo="${repo}"] button`).allTextContents();
  expect(await buttons('billing-api')).toEqual(['Show Git Output']);
  expect(await buttons('auth-service')).toEqual(['Stash and pull']);
  expect(await buttons('notifications')).toEqual(['Pull with rebase', 'Open SCM']);
  expect(await buttons('ledger')).toEqual([]);
  await expect(panel.locator('.batch-result-buttons button')).toHaveText(['Retry failed', 'Close']);

  // The grid stays usable while the panel is shown.
  await focusRow(frame, 'ledger');
  await page.keyboard.press('Enter');
  await expect(frame.locator('[data-details="ledger"]')).toBeVisible();

  await panel.locator('[data-button="close"]').click();
  await expect(panel).toHaveCount(0);
});
