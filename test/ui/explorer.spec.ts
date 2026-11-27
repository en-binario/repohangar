// explorer-reveal :: Name click matrix (R1–R3, R5) and Reveal with e; explorer-open-in-git-graph :: Show a filtered-out
// repository (the dashboard side: filter cleared, All active, group expanded, focus on the row).

import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { createMainFixture } from '../integration/fixtures/repos';
import {
  chooseMenuItem,
  dashboard,
  explorerRow,
  focusedKey,
  focusRow,
  menuItem,
  launch,
  openDashboard,
  row,
  runCommand,
  selectedRepository,
  writeSettings,
  type VsCode,
} from './vscode';

let vscode: VsCode;
let page: Page;
let frame: FrameLocator;

test.beforeAll(async () => {
  vscode = await launch(createMainFixture(), {
    settings: { 'scm.repositories.selectionMode': 'single', 'window.menuStyle': 'custom' },
  });
  page = vscode.page;
  frame = await openDashboard(page);
  // The Repositories view shows which repository Source Control has selected.
  await runCommand(page, 'Source Control: Focus on Repositories View');
  await expect(page.locator('.part.sidebar .monaco-list-row[aria-label="Git"]').first()).toBeVisible();
});

test.afterAll(async () => {
  await vscode?.close();
});

/** Ledger is selected and focused in the Explorer. */
async function expectExplorerOnLedger(): Promise<void> {
  await expect(explorerRow(page, 'ledger')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.explorer-folders-view'))).toBe(true);
}

async function nameClick(value: string): Promise<void> {
  writeSettings(vscode, { 'repohangar.dashboard.nameClick': value });
  frame = await openDashboard(page);
  await expect(frame.locator('.dashboard')).toHaveAttribute('data-name-click', value);
}

test('R1 nameClick explorer: a click on ledger reveals it in the Explorer', async () => {
  await nameClick('explorer');
  await row(frame, 'ledger').locator('.repo-name').click();
  await expectExplorerOnLedger();
});

test('R2 nameClick gitGraph: a click on ledger runs the graph action', async () => {
  await nameClick('gitGraph');
  // Without Git Graph the graph action opens the Source Control Graph on ledger.
  await row(frame, 'ledger').locator('.repo-name').click();
  await expect(selectedRepository(page)).toContainText('ledger');
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[aria-label="Source Control History"]'))).toBe(true);
});

test('R3 nameClick sourceControl: a click on ledger shows it in Source Control', async () => {
  await nameClick('sourceControl');
  await focusRow(frame, 'notifications');
  await page.keyboard.press('s');
  await expect(selectedRepository(page)).toContainText('notifications');
  frame = await openDashboard(page);
  await row(frame, 'ledger').locator('.repo-name').click();
  await expect(selectedRepository(page)).toContainText('ledger');
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('#workbench\\.view\\.scm'))).toBe(true);
});

test('R5 nameClick auto without Git Graph: a click on ledger reveals it in the Explorer', async () => {
  await nameClick('auto');
  await expect(frame.locator('.dashboard')).toHaveAttribute('data-graph', 'sourceControlGraph');
  await row(frame, 'ledger').locator('.repo-name').click();
  await expectExplorerOnLedger();
});

test('Reveal with e: the Explorer selects acme/backend/ledger and has focus', async () => {
  await nameClick('explorer');
  await focusRow(frame, 'ledger');
  await page.keyboard.press('e');
  await expectExplorerOnLedger();
});

test('Show a filtered-out repository: filter cleared, All active, backend expanded, focus on ledger', async () => {
  frame = await openDashboard(page);
  await frame.locator('input.filter').fill('bill');
  await frame.locator('[data-chip="ahead"]').click();
  const backend = frame.locator('.row.group', { hasText: 'backend' });
  await backend.locator('.group-name').click();
  await expect(backend).toHaveText(/^▸ backend/);
  await expect(row(frame, 'ledger')).toHaveCount(0);

  // RepoHangar ▸ Show in RepoHangar on the folder acme/backend/ledger.
  await runCommand(page, 'View: Show Explorer');
  await expect(page.locator('.quick-input-widget')).toBeHidden();
  await explorerRow(page, 'acme').waitFor();
  if ((await explorerRow(page, 'backend').count()) === 0) await explorerRow(page, 'acme').click();
  await explorerRow(page, 'backend').waitFor();
  if ((await explorerRow(page, 'ledger').count()) === 0) await explorerRow(page, 'backend').click();
  await expect(explorerRow(page, 'ledger')).toBeVisible();
  // Open the context menu, expand the RepoHangar submenu by keyboard, and run Show in RepoHangar.
  await expect(async () => {
    await explorerRow(page, 'ledger').click({ button: 'right' });
    await expect(menuItem(page, 'RepoHangar')).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 15_000 });
  const sub = menuItem(page, 'RepoHangar');
  for (let i = 0; i < 40; i++) {
    if (await sub.evaluate((el) => el.classList.contains('focused') || !!el.closest('.focused') || el === document.activeElement)) break;
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('ArrowRight');
  await expect(menuItem(page, 'Show in RepoHangar')).toBeVisible();
  await chooseMenuItem(page, 'Show in RepoHangar');

  frame = dashboard(page);
  await expect(row(frame, 'ledger')).toBeVisible();
  await expect(frame.locator('input.filter')).toHaveValue('');
  await expect(frame.locator('[data-chip="all"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(frame.locator('.row.group', { hasText: 'backend' })).toHaveText(/^▾ backend/);
  await expect.poll(() => focusedKey(frame)).toBe(await row(frame, 'ledger').getAttribute('data-key'));
});
