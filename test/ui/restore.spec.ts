// dashboard :: Window reload with the dashboard open.

import { existsSync, readFileSync } from 'node:fs';
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

// dashboard :: Sort kept across a reload and a reopen, Sort kept when the grouping changes. The fixture's rows stand in
// for the spec's names.

async function resetSort(frame: ReturnType<typeof dashboard>): Promise<void> {
  for (let i = 0; i < 3 && (await frame.locator('[data-sort="repository"]').textContent()) !== 'Repository ▲'; i++) {
    await frame.locator('.row.header [aria-sort] button').click();
  }
  await expect(frame.locator('[data-sort="repository"]')).toHaveText('Repository ▲');
}

async function repoOrder(frame: ReturnType<typeof dashboard>): Promise<string[]> {
  return frame.locator('[data-repo]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-repo') as string));
}

test('keeps the sort after a window reload and after reopening the dashboard', async () => {
  const { page } = vscode;
  let frame = await openDashboard(page);
  await frame.locator('input.filter').fill('');
  await frame.locator('[data-chip="all"]').click();
  await frame.locator('[data-sort="fetched"]').click();
  await expect(frame.locator('[data-sort="fetched"]')).toHaveText('Fetched ▼');
  // Never fetched first (A→Z), then the oldest fetch: ledger was fetched before notifications.
  const backend = ['auth-service', 'billing-api', 'stashed', 'stashed-hotfix', 'ledger', 'notifications'];
  const inBackend = (order: string[]) => order.filter((n) => backend.includes(n));
  expect(inBackend(await repoOrder(frame))).toEqual(backend);

  await runCommand(page, 'Developer: Reload Window');
  await page.waitForSelector('.monaco-workbench', { timeout: 60_000 });
  frame = dashboard(page);
  await expect(row(frame, 'billing-api')).toBeVisible({ timeout: 60_000 });
  await expect(frame.locator('[data-sort="fetched"]')).toHaveText('Fetched ▼');
  await expect(frame.locator('.row.header [aria-sort="descending"]')).toHaveText('Fetched ▼');
  expect(inBackend(await repoOrder(frame))).toEqual(backend);

  // The dashboard tab is pinned: unpin it, then close it.
  await page.locator('.tab', { hasText: 'RepoHangar' }).click();
  await runCommand(page, 'View: Unpin Editor');
  await runCommand(page, 'View: Close Editor');
  await expect(page.locator('.tab', { hasText: 'RepoHangar' })).toHaveCount(0);
  frame = await openDashboard(page);
  await expect(frame.locator('[data-sort="fetched"]')).toHaveText('Fetched ▼');
  await resetSort(frame);
});

test('keeps the sort when the grouping changes and writes no setting', async () => {
  const { page } = vscode;
  const frame = await openDashboard(page);
  const read = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : null);
  const userBefore = read(vscode.settingsFile);
  const workspaceBefore = read(vscode.fixture.workspaceFile);
  await frame.locator('input.filter').fill('');
  await frame.locator('[data-chip="all"]').click();
  await frame.locator('[data-sort="changes"]').click();
  await expect(frame.locator('[data-sort="changes"]')).toHaveText('Changes ▼');
  await frame.locator('.group-menu select').selectOption('none');
  await expect(frame.locator('.row.group')).toHaveCount(0);
  // Conflicts first (merging, rebasing: 1 each, A→Z), then the most changed files.
  expect((await repoOrder(frame)).slice(0, 4)).toEqual(['merging', 'rebasing', 'billing-api', 'auth-service']);
  expect(read(vscode.settingsFile)).toBe(userBefore);
  expect(read(vscode.fixture.workspaceFile)).toBe(workspaceBefore);

  await frame.locator('.group-menu select').selectOption('parentFolder');
  await expect(frame.locator('.row.group').first()).toBeVisible();
  await resetSort(frame);
});
