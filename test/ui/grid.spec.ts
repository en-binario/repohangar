// The dashboard grid in a real VS Code window: columns, row order, groups, filtering and the open keybinding.

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

test('opens the dashboard with Ctrl+Alt+R', async () => {
  const { page } = vscode;
  // Wait until the extension has activated (the status bar summary appears).
  await expect(page.locator('[id="enbinario.repohangar.repohangar.summary"], .statusbar-item[aria-label^="RepoHangar:"]').first()).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Alt+R' : 'Control+Alt+R');
  await expect(row(dashboard(page), 'billing-api')).toBeVisible({ timeout: 60_000 });
});

test('shows the column headers and orders rows by name', async () => {
  const frame = await openDashboard(vscode.page);
  await expect(frame.locator('.row.header [role="columnheader"]')).toHaveText(['', 'Repository', 'Branch', 'Sync', 'Changes', 'Fetched']);
  const backend = await frame.locator('[data-repo]').evaluateAll((rows) =>
    rows.map((r) => r.getAttribute('data-repo') as string),
  );
  const backendRows = backend.filter((n) => ['auth-service', 'billing-api', 'ledger', 'notifications', 'stashed', 'stashed-hotfix'].includes(n));
  expect(backendRows).toEqual(['auth-service', 'billing-api', 'ledger', 'notifications', 'stashed', 'stashed-hotfix']);
  const groups = await frame.locator('.row.group').allTextContents();
  expect(groups.map((g) => g.replace(/ \(\d+\)$/, ''))).toEqual([...groups.map((g) => g.replace(/ \(\d+\)$/, ''))].sort((a, b) => a.slice(2).localeCompare(b.slice(2))));
});

test('collapses a group and keeps it collapsed after a reload', async () => {
  const { page } = vscode;
  let frame = await openDashboard(page);
  const header = frame.locator('.row.group', { hasText: 'infra' });
  await expect(header).toHaveText('▾ infra (3)');
  await header.locator('[role="gridcell"]').click();
  await expect(header).toHaveText('▸ infra (3)');
  await expect(row(frame, 'merging')).toHaveCount(0);

  await runCommand(page, 'Developer: Reload Window');
  await page.waitForSelector('.monaco-workbench', { timeout: 60_000 });
  frame = dashboard(page);
  await expect(frame.locator('.row.group', { hasText: 'infra' })).toHaveText('▸ infra (3)', { timeout: 60_000 });
  // Expand it again for the next tests.
  await frame.locator('.row.group', { hasText: 'infra' }).locator('[role="gridcell"]').click();
  await expect(frame.locator('.row.group', { hasText: 'infra' })).toHaveText('▾ infra (3)');
});

test('counts the filtered rows in the group header', async () => {
  const frame = await openDashboard(vscode.page);
  await frame.locator('input.filter').fill('bill');
  await expect(frame.locator('.row.group')).toHaveText(['▾ backend (1)']);
  await frame.locator('input.filter').fill('');
});

test('keeps the selection while filtering', async () => {
  const { page } = vscode;
  const frame = await openDashboard(page);
  await focusRow(frame, 'billing-api');
  await page.keyboard.press('Space');
  await focusRow(frame, 'ledger');
  await page.keyboard.press('Space');
  await expect(frame.locator('.selected-count')).toHaveText('2 selected');
  await frame.locator('input.filter').fill('bill');
  await expect(frame.locator('[data-repo]')).toHaveCount(1);
  await expect(frame.locator('.selected-count')).toHaveText('2 selected');
  await frame.locator('input.filter').fill('');
  await focusRow(frame, 'ledger');
  await page.keyboard.press('Escape');
  await expect(frame.locator('.selected-count')).toHaveCount(0);
});
