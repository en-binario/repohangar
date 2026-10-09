// dashboard :: Grid key matrix, one test per row, in row order R1–R22.

import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { createMainFixture } from '../integration/fixtures/repos';
import { focusedKey, focusRow, launch, openDashboard, row, type VsCode } from './vscode';

let vscode: VsCode;
let page: Page;
let frame: FrameLocator;

const ctrlA = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';

async function keyOf(repo: string): Promise<string> {
  return (await row(frame, repo).getAttribute('data-key')) as string;
}

async function chipPressed(id: string): Promise<string | null> {
  return frame.locator(`[data-chip="${id}"]`).getAttribute('aria-pressed');
}

/** Clears filter, chips, selection and details, then focuses a row. */
async function reset(focus = 'billing-api'): Promise<void> {
  await frame.locator('input.filter').fill('');
  await frame.locator('[data-chip="all"]').click();
  await focusRow(frame, focus);
  for (let i = 0; i < 2; i++) await page.keyboard.press('Escape');
  for (const open of await frame.locator('[data-details]').all()) {
    const name = (await open.getAttribute('data-details')) as string;
    await focusRow(frame, name);
    await page.keyboard.press('Enter');
  }
  await focusRow(frame, focus);
}

test.beforeAll(async () => {
  vscode = await launch(createMainFixture());
  page = vscode.page;
  frame = await openDashboard(page);
});

test.afterAll(async () => {
  await vscode?.close();
});

test.beforeEach(async () => {
  await reset();
});

test('moves down with ArrowDown and j', async () => {
  await page.keyboard.press('ArrowDown');
  expect(await focusedKey(frame)).toBe(await keyOf('ledger'));
  await page.keyboard.press('j');
  expect(await focusedKey(frame)).toBe(await keyOf('notifications'));
});

test('keeps focus on the last shown row', async () => {
  await focusRow(frame, 'shared-proto');
  await page.keyboard.press('ArrowDown');
  expect(await focusedKey(frame)).toBe(await keyOf('shared-proto'));
});

test('moves up with ArrowUp and k', async () => {
  await focusRow(frame, 'ledger');
  await page.keyboard.press('ArrowUp');
  expect(await focusedKey(frame)).toBe(await keyOf('billing-api'));
  await page.keyboard.press('k');
  expect(await focusedKey(frame)).toBe(await keyOf('auth-service'));
});

test('keeps focus on the first shown header', async () => {
  await focusRow(frame, 'auth-service');
  await page.keyboard.press('ArrowUp');
  expect(await focusedKey(frame)).toBe('group:backend');
  await page.keyboard.press('ArrowUp');
  expect(await focusedKey(frame)).toBe('group:backend');
});

test('selects the focused row with Space', async () => {
  await page.keyboard.press('Space');
  await expect(row(frame, 'billing-api')).toHaveAttribute('aria-selected', 'true');
  await expect(row(frame, 'billing-api').locator('input[type="checkbox"]')).toBeChecked();
  await expect(frame.locator('.selected-count')).toHaveText('1 selected');
});

test('clears the selection of the focused row with Space', async () => {
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(row(frame, 'billing-api')).toHaveAttribute('aria-selected', 'false');
  await expect(frame.locator('.selected-count')).toHaveCount(0);
});

test('selects every shown row with Ctrl+A', async () => {
  await frame.locator('input.filter').fill('stash');
  await focusRow(frame, 'stashed');
  await page.keyboard.press(ctrlA);
  await expect(frame.locator('.selected-count')).toHaveText('2 selected');
  await expect(row(frame, 'stashed-hotfix')).toHaveAttribute('aria-selected', 'true');
});

test('moves focus to the filter box with /', async () => {
  await page.keyboard.press('/');
  await expect(frame.locator('input.filter')).toBeFocused();
  await expect(frame.locator('input.filter')).toHaveValue('');
});

test('opens row details with Enter', async () => {
  await page.keyboard.press('Enter');
  await expect(frame.locator('[data-details="billing-api"]')).toContainText('Last commit');
  await expect(frame.locator('[data-details="billing-api"]')).toContainText('Upstream  origin/feature/ABC-12-notes');
});

test('closes row details with Enter', async () => {
  await page.keyboard.press('Enter');
  await expect(frame.locator('[data-details="billing-api"]')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(frame.locator('[data-details="billing-api"]')).toHaveCount(0);
});

test('collapses a group with Enter on its header', async () => {
  await focusRow(frame, 'auth-service');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(frame.locator('.row.group', { hasText: 'backend' })).toHaveText('▸ backend (6)');
  await page.keyboard.press('Enter');
  await expect(frame.locator('.row.group', { hasText: 'backend' })).toHaveText('▾ backend (6)');
});

test('activates the Dirty chip with 2', async () => {
  await page.keyboard.press('2');
  expect(await chipPressed('dirty')).toBe('true');
  expect(await chipPressed('all')).toBe('false');
});

test('returns to All when 2 turns off the only chip', async () => {
  await page.keyboard.press('2');
  await page.keyboard.press('2');
  expect(await chipPressed('dirty')).toBe('false');
  expect(await chipPressed('all')).toBe('true');
});

test('clears every chip with 1', async () => {
  await page.keyboard.press('2');
  await page.keyboard.press('4');
  expect(await chipPressed('ahead')).toBe('true');
  await page.keyboard.press('1');
  expect(await chipPressed('all')).toBe('true');
  expect(await chipPressed('dirty')).toBe('false');
  expect(await chipPressed('ahead')).toBe('false');
});

test('does nothing with 5 or 6', async () => {
  const rows = await frame.locator('[data-repo]').count();
  await page.keyboard.press('5');
  await page.keyboard.press('6');
  expect(await chipPressed('all')).toBe('true');
  await expect(frame.locator('[data-repo]')).toHaveCount(rows);
});

test('clears the filter and chips with Esc and keeps the selection', async () => {
  await page.keyboard.press('Space');
  await focusRow(frame, 'ledger');
  await page.keyboard.press('Space');
  await frame.locator('input.filter').fill('bill');
  await focusRow(frame, 'billing-api');
  await page.keyboard.press('3');
  await page.keyboard.press('Escape');
  await expect(frame.locator('input.filter')).toHaveValue('');
  expect(await chipPressed('all')).toBe('true');
  await expect(frame.locator('.selected-count')).toHaveText('2 selected');
});

test('clears the selection with Esc when there is no filter', async () => {
  for (const repo of ['billing-api', 'ledger', 'notifications']) {
    await focusRow(frame, repo);
    await page.keyboard.press('Space');
  }
  await expect(frame.locator('.selected-count')).toHaveText('3 selected');
  await page.keyboard.press('Escape');
  await expect(frame.locator('.selected-count')).toHaveCount(0);
});

test('shows the key help overlay with ?', async () => {
  await page.keyboard.press('?');
  const help = frame.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help).toBeVisible();
  for (const k of ['↑ ↓ / j k', 'Space', 'Ctrl+A', '/', 'Enter', '1', '2', '3', '4', '7', 'Esc', '?']) {
    await expect(help.locator('kbd', { hasText: k }).first()).toBeVisible();
  }
  // The action keys of git-operations and batch-operations.
  const keys = await help.locator('kbd').allTextContents();
  for (const k of ['f', 'F', 'p', 'P', 'b', 't', '.']) expect(keys).toContain(k);
  // The graph, Explorer and Source Control keys.
  for (const k of ['g', 'e', 's']) expect(keys).toContain(k);
  await expect(help.locator('tr').filter({ has: frame.locator('kbd', { hasText: /^g$/ }) })).toContainText('Open the focused row in the graph');
  await expect(help.locator('tr').filter({ has: frame.locator('kbd', { hasText: /^e$/ }) })).toContainText('Reveal the focused row in the Explorer');
  await expect(help.locator('tr').filter({ has: frame.locator('kbd', { hasText: /^s$/ }) })).toContainText('Show the focused row in Source Control');
  await page.keyboard.press('Escape');
});

test('closes the overlay with Esc and returns focus to the row', async () => {
  await page.keyboard.press('?');
  await expect(frame.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(frame.getByRole('dialog')).toHaveCount(0);
  expect(await focusedKey(frame)).toBe(await keyOf('billing-api'));
});

test('clears the filter box with Esc and focuses the first shown row', async () => {
  await frame.locator('input.filter').fill('bill');
  await frame.locator('input.filter').focus();
  await page.keyboard.press('Escape');
  await expect(frame.locator('input.filter')).toHaveValue('');
  expect(await focusedKey(frame)).toBe(await keyOf('auth-service'));
});

test('moves from the filter box to the first shown row with ArrowDown', async () => {
  await frame.locator('input.filter').focus();
  await page.keyboard.press('ArrowDown');
  expect(await focusedKey(frame)).toBe(await keyOf('auth-service'));
});

test('shows the action keys, then g graph, e explorer and s source control, before the navigation hints in the footer', async () => {
  await page.keyboard.press('Space');
  await expect(frame.locator('.footer')).toHaveText(
    '1 selected' +
      'f fetch · p pull · P push · b switch · t terminal · . more · g graph · e explorer · s source control · ↑↓ move · Space select · / filter · ⏎ details · ? keys',
  );
  await expect(frame.locator('.selected-count')).toHaveText('1 selected');
});

test('types j into the filter box', async () => {
  await frame.locator('input.filter').fill('bil');
  await frame.locator('input.filter').focus();
  await page.keyboard.press('j');
  await expect(frame.locator('input.filter')).toHaveValue('bilj');
  await expect(frame.locator('input.filter')).toBeFocused();
});

