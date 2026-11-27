// explorer-open-in-git-graph :: Graph entry point matrix (R1–R7). Git Graph is not installed, so each entry point opens
// the Source Control Graph and the target is the repository selected in the Source Control Repositories view
// (single selection mode). R5 and R6 go through the Source Control and Explorer context menus, which pass a
// SourceControl and an Explorer Uri.

import { mkdirSync } from 'node:fs';
import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { createMainFixture } from '../integration/fixtures/repos';
import {
  chooseMenuItem,
  explorerRow,
  focusRow,
  launch,
  openDashboard,
  row,
  runCommand,
  selectedRepository,
  type VsCode,
} from './vscode';

let vscode: VsCode;
let page: Page;
let frame: FrameLocator;

test.beforeAll(async () => {
  const fixture = createMainFixture();
  mkdirSync(fixture.repo('backend/ledger/src'), { recursive: true });
  vscode = await launch(fixture, {
    settings: {
      'scm.repositories.selectionMode': 'single',
      'window.menuStyle': 'custom',
      'repohangar.explorer.contextMenu.showOn': 'allFolders',
    },
  });
  page = vscode.page;
  frame = await openDashboard(page);
  await expect(frame.locator('.dashboard')).toHaveAttribute('data-graph', 'sourceControlGraph');
  await runCommand(page, 'Source Control: Focus on Repositories View');
  await expect(page.locator('.part.sidebar .monaco-list-row[aria-label="Git"]').first()).toBeVisible();
});

test.afterAll(async () => {
  await vscode?.close();
});

/** Selects `name` in Source Control with Show in Source Control, so the next graph action has to change it. */
async function selectFirst(name: string): Promise<void> {
  frame = await openDashboard(page);
  await focusRow(frame, name);
  await page.keyboard.press('s');
  await expect(selectedRepository(page)).toContainText(name);
  frame = await openDashboard(page);
}

async function expectTarget(name: string): Promise<void> {
  await expect(selectedRepository(page)).toContainText(name, { timeout: 15_000 });
  await expect(selectedRepository(page)).toHaveCount(1);
}

test('R1 g on web-shop with billing-api and ledger selected opens web-shop', async () => {
  await selectFirst('notifications');
  for (const name of ['billing-api', 'ledger']) {
    await focusRow(frame, name);
    await page.keyboard.press('Space');
  }
  await expect(frame.locator('.selected-count')).toHaveText('2 selected');
  await focusRow(frame, 'web-shop');
  await page.keyboard.press('g');
  await expectTarget('web-shop');
  frame = await openDashboard(page);
  await focusRow(frame, 'web-shop');
  await page.keyboard.press('Escape');
});

test('R2 the ◈ hover button on ledger opens ledger', async () => {
  await selectFirst('notifications');
  await row(frame, 'ledger').hover();
  await row(frame, 'ledger').getByRole('button', { name: 'Open in Source Control Graph' }).click();
  await expectTarget('ledger');
});

test('R3 the ⋯ menu item Open in Source Control Graph on ledger opens ledger', async () => {
  await selectFirst('notifications');
  await focusRow(frame, 'ledger');
  await page.keyboard.press('.');
  const menu = frame.getByRole('menu', { name: 'Actions for ledger' });
  await expect(menu.locator('[role="menuitem"]').first()).toHaveText(/^Open in Source Control Graph\s*g$/);
  await menu.locator('[data-action="graph"]').click();
  await expectTarget('ledger');
});

test('R4 the row details button on ledger opens ledger', async () => {
  await selectFirst('notifications');
  await focusRow(frame, 'ledger');
  await page.keyboard.press('Enter');
  const details = frame.locator('[data-details="ledger"]');
  await expect(details.locator('.detail-button')).toHaveText(['Open in Source Control Graph', 'Reveal in Explorer', 'Show in Source Control', 'Open terminal']);
  await details.locator('.detail-button[data-action="graph"]').click();
  await expectTarget('ledger');
  frame = await openDashboard(page);
  await focusRow(frame, 'ledger');
  await page.keyboard.press('Enter');
});

test('R5 the Source Control Repositories menu on ledger opens ledger', async () => {
  await selectFirst('notifications');
  await runCommand(page, 'Source Control: Focus on Repositories View');
  await expect(page.locator('.quick-input-widget')).toBeHidden();
  const ledger = page.locator('.part.sidebar .monaco-list-row[aria-label="Git"]', { hasText: /^ledger/ });
  await expect(ledger).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await ledger.click({ button: 'right', position: { x: 30, y: 10 } });
    await expect(page.locator('.context-view').getByRole('menuitem', { name: /^Open in Source Control Graph(\s|$)/ })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 15_000 });
  await chooseMenuItem(page, 'Open in Source Control Graph');
  await expectTarget('ledger');
});

test('R6 the Explorer menu on acme/backend/ledger/src opens ledger', async () => {
  await selectFirst('notifications');
  await focusRow(frame, 'ledger');
  // Reveal ledger in the Explorer, then expand it to reach src.
  await page.keyboard.press('e');
  await expect(explorerRow(page, 'ledger')).toHaveAttribute('aria-selected', 'true');
  if ((await explorerRow(page, 'src').count()) === 0) await explorerRow(page, 'ledger').click();
  await expect(explorerRow(page, 'src')).toBeVisible();
  await expect(async () => {
    await explorerRow(page, 'src').click({ button: 'right' });
    await expect(page.locator('.context-view').getByRole('menuitem', { name: /^Open in Source Control Graph(\s|$)/ })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 15_000 });
  await chooseMenuItem(page, 'Open in Source Control Graph');
  await expectTarget('ledger');
});

test('R7 Ctrl+Alt+J with a file of billing-api in the active editor opens billing-api', async () => {
  await selectFirst('notifications');
  await focusRow(frame, 'billing-api');
  await page.keyboard.press('e');
  await expect(explorerRow(page, 'billing-api')).toHaveAttribute('aria-selected', 'true');
  await explorerRow(page, 'billing-api').click();
  await explorerRow(page, 'README.md').first().dblclick();
  await expect(page.locator('.tab.active', { hasText: 'README.md' })).toBeVisible();
  await page.keyboard.press(process.platform === 'darwin' ? 'Control+Meta+J' : 'Control+Alt+J');
  await expectTarget('billing-api');
});
