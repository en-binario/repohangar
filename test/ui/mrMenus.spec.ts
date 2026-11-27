// mr-creation :: Menu item visibility matrix (R1–R5): Create MR, Create MR… and Open MR in the Source Control
// Repositories menu and the Explorer RepoHangar submenu, by repository provider. Backs the manual checklist of
// tasks.md 5.3 on the platform it runs on.

import { expect, test, type Page } from '@playwright/test';
import { startProviderStub } from '../integration/fixtures/providerStub';
import { createProvidersFixture } from '../integration/fixtures/repos';
import { explorerRow, launch, menuItem, openDashboard, runCommand, type VsCode } from './vscode';

let vscode: VsCode;
let page: Page;
let stub: Awaited<ReturnType<typeof startProviderStub>>;

const MR_ITEMS = ['Create MR', 'Create MR…', 'Open MR'];

test.beforeAll(async () => {
  stub = await startProviderStub([
    (r) => (r.method === 'GET' && r.path === '/api/v4/version' && r.host === 'git.acme.com' ? { body: { version: '17.10.0' } } : undefined),
  ]);
  vscode = await launch(createProvidersFixture(), {
    env: { REPOHANGAR_HTTP_STUB: stub.url },
    settings: { 'window.menuStyle': 'custom', 'scm.repositories.selectionMode': 'single' },
  });
  page = vscode.page;
  // The first run decides the hosts; the dashboard dismisses its panel.
  await openDashboard(page);
});

test.afterAll(async () => {
  await vscode?.close();
  await stub?.close();
});

async function sourceControlMenu(name: string): Promise<void> {
  await runCommand(page, 'Source Control: Focus on Repositories View');
  // A right click while the command palette closes opens its menu instead.
  await expect(page.locator('.quick-input-widget')).toBeHidden();
  const repository = page.locator('.part.sidebar .monaco-list-row[aria-label="Git"]', { hasText: new RegExp(`^${name}`) });
  await expect(repository).toBeVisible({ timeout: 30_000 });
  // On the name: the middle of a row can be one of its inline action buttons.
  await repository.click({ button: 'right', position: { x: 30, y: 10 } });
  await expect(menuItem(page, 'Fetch')).toBeVisible();
}

async function explorerSubmenu(path: string[]): Promise<void> {
  await runCommand(page, 'View: Show Explorer');
  await expect(page.locator('.quick-input-widget')).toBeHidden();
  for (const folder of path.slice(0, -1)) {
    await explorerRow(page, folder).waitFor();
    if ((await explorerRow(page, path[path.length - 1] as string).count()) === 0) await explorerRow(page, folder).click();
  }
  await explorerRow(page, path[path.length - 1] as string).click({ button: 'right' });
  await menuItem(page, 'RepoHangar').click();
  await expect(menuItem(page, 'Show in RepoHangar')).toBeVisible();
}

async function closeMenu(): Promise<void> {
  const menu = page.locator('.context-view .monaco-menu:visible');
  for (let i = 0; i < 5 && (await menu.count()) > 0; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  }
}

test('R1 the Source Control menu of a GitLab repository shows the merge request items', async () => {
  await sourceControlMenu('ledger');
  for (const item of MR_ITEMS) await expect(menuItem(page, item)).toBeVisible();
  await closeMenu();
});

test('R2 the Source Control menu of a GitHub repository shows the merge request items', async () => {
  await sourceControlMenu('web-shop');
  for (const item of MR_ITEMS) await expect(menuItem(page, item)).toBeVisible();
  await closeMenu();
});

test('R3 the Source Control menu of an unknown host or a repository without remote hides them', async () => {
  for (const name of ['charts', 'scratch']) {
    await sourceControlMenu(name);
    for (const item of MR_ITEMS) await expect(menuItem(page, item)).toHaveCount(0);
    await closeMenu();
  }
});

test('R4 the Explorer RepoHangar submenu on a GitLab repository root shows them after Pull (ff)', async () => {
  await explorerSubmenu(['backend', 'billing-api']);
  const names = await page.locator('.context-view').getByRole('menuitem').allInnerTexts();
  const labels = names.map((n) => n.split('\n')[0]?.trim() ?? '');
  const pull = labels.indexOf('Pull (ff)');
  expect(pull).toBeGreaterThanOrEqual(0);
  expect(labels.slice(pull + 1, pull + 4)).toEqual(MR_ITEMS);
  await closeMenu();
});

test('R5 the Explorer RepoHangar submenu on a repository root without remote hides them', async () => {
  await explorerSubmenu(['tools', 'scratch']);
  await expect(menuItem(page, 'Pull (ff)')).toBeVisible();
  for (const item of MR_ITEMS) await expect(menuItem(page, item)).toHaveCount(0);
  await closeMenu();
});
