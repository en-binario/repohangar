// The dashboard grid in a real VS Code window: columns, row order, groups, filtering, the open keybinding and the page
// height (dashboard: Dashboard height).

import { join } from 'node:path';
import { expect, test, type FrameLocator } from '@playwright/test';
import { createMainFixture, git, pushFromSeed } from '../integration/fixtures/repos';
import { dashboard, dismissFirstRun, focusedKey, focusRow, launch, openDashboard, row, runCommand, type VsCode } from './vscode';

let vscode: VsCode;

const BACKEND = ['auth-service', 'billing-api', 'ledger', 'notifications', 'stashed', 'stashed-hotfix'];

async function repoOrder(frame: FrameLocator): Promise<string[]> {
  return frame.locator('[data-repo]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-repo') as string));
}

function groupHeader(frame: FrameLocator, name: string) {
  return frame.locator('.row.group', { has: frame.locator('.group-name', { hasText: new RegExp(`^[▾▸] ${name} \\(`) }) });
}

function groupCheckbox(frame: FrameLocator, name: string) {
  return groupHeader(frame, name).locator('input[type="checkbox"]');
}

const selectAll = (frame: FrameLocator) => frame.locator('.row.header input[type="checkbox"]');

/** Clears the filter, the chips and the selection. */
async function clearView(frame: FrameLocator): Promise<void> {
  await frame.locator('input.filter').fill('');
  await frame.locator('[data-chip="all"]').click();
  if ((await frame.locator('.selected-count').count()) > 0) {
    await focusRow(frame, 'billing-api');
    await vscode.page.keyboard.press('Escape');
  }
  await expect(frame.locator('.selected-count')).toHaveCount(0);
}

test.beforeAll(async () => {
  vscode = await launch(createMainFixture());
});

test.afterAll(async () => {
  await vscode?.close();
});

test('opens the dashboard with Ctrl+Alt+H', async () => {
  const { page } = vscode;
  // Wait until the extension has activated (the status bar summary appears).
  await expect(page.locator('[id="enbinario.repohangar.repohangar.summary"], .statusbar-item[aria-label^="RepoHangar:"]').first()).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press(process.platform === 'darwin' ? 'Control+Meta+H' : 'Control+Alt+H');
  await dismissFirstRun(dashboard(page));
  await expect(row(dashboard(page), 'billing-api')).toBeVisible({ timeout: 60_000 });
});

// dashboard :: Column headers and default row order
test('shows the column headers with the default sort and orders rows by name', async () => {
  const frame = await openDashboard(vscode.page);
  await expect(frame.locator('.row.header [role="columnheader"]')).toHaveText(['', 'Repository ▲', 'Branch', 'Sync', 'Changes', 'Fetched', 'MR / PR']);
  await expect(frame.locator('.row.header [role="columnheader"]').nth(1)).toHaveAttribute('aria-sort', 'ascending');
  await expect(frame.locator('.row.header [aria-sort]')).toHaveCount(1);
  const backendRows = (await repoOrder(frame)).filter((n) => BACKEND.includes(n));
  expect(backendRows).toEqual(['auth-service', 'billing-api', 'ledger', 'notifications', 'stashed', 'stashed-hotfix']);
  const groups = await frame.locator('.row.group').allTextContents();
  expect(groups.map((g) => g.replace(/ \(\d+\)$/, ''))).toEqual([...groups.map((g) => g.replace(/ \(\d+\)$/, ''))].sort((a, b) => a.slice(2).localeCompare(b.slice(2))));
});

test('collapses a group and keeps it collapsed after a reload', async () => {
  const { page } = vscode;
  let frame = await openDashboard(page);
  const header = frame.locator('.row.group', { hasText: 'infra' });
  await expect(header).toHaveText('▾ infra (3)');
  await header.locator('.group-name').click();
  await expect(header).toHaveText('▸ infra (3)');
  await expect(row(frame, 'merging')).toHaveCount(0);

  await runCommand(page, 'Developer: Reload Window');
  await page.waitForSelector('.monaco-workbench', { timeout: 60_000 });
  frame = dashboard(page);
  await expect(frame.locator('.row.group', { hasText: 'infra' })).toHaveText('▸ infra (3)', { timeout: 60_000 });
  // Expand it again for the next tests.
  await frame.locator('.row.group', { hasText: 'infra' }).locator('.group-name').click();
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

/** Sets the size of the VS Code window. */
async function windowSize(width: number, height: number): Promise<void> {
  await vscode.app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]?.setSize(w as number, h as number), [width, height]);
  await vscode.page.waitForTimeout(500);
}

/** The webview page's scroll and client heights, and where its footer ends. */
async function pageHeights(frame: ReturnType<typeof dashboard>) {
  return frame.locator('body').evaluate(() => {
    const page = document.scrollingElement as HTMLElement;
    const footer = (document.querySelector('.footer') as HTMLElement).getBoundingClientRect();
    return {
      scroll: page.scrollHeight,
      client: page.clientHeight,
      wide: page.scrollWidth > page.clientWidth,
      footerBottom: Math.round(footer.bottom),
    };
  });
}

// Both widths: a panel narrower than the grid's minimum scrolls sideways, and that scrollbar adds no vertical one.
for (const width of [2000, 1400]) {
  test(`shows no vertical scrollbar when the rows fit the panel (window ${width} px wide)`, async () => {
    await windowSize(width, 1000);
    try {
      const frame = await openDashboard(vscode.page);
      await frame.locator('input.filter').fill('stashed');
      await expect(frame.locator('[data-repo]')).toHaveCount(2);
      const heights = await pageHeights(frame);
      expect(heights.wide).toBe(width === 1400);
      expect(heights.scroll).toBe(heights.client);
      expect(Math.abs(heights.footerBottom - (heights.client - 12))).toBeLessThanOrEqual(1);
      await frame.locator('input.filter').fill('');
    } finally {
      await windowSize(1280, 800);
    }
  });
}

test('shows a vertical scrollbar when the rows are taller than the panel', async () => {
  await windowSize(1400, 400);
  try {
    const frame = await openDashboard(vscode.page);
    await frame.locator('input.filter').fill('');
    const heights = await pageHeights(frame);
    expect(heights.scroll).toBeGreaterThan(heights.client);
    expect(heights.footerBottom).toBeLessThanOrEqual(heights.client);
  } finally {
    await windowSize(1280, 800);
  }
});

// dashboard :: Group checkbox matrix R1–R5, Group checkbox leaves other groups alone, Group name click still collapses,
// Selection changes update the group checkbox. The fixture's `backend` holds 6 rows; its rows stand in for the spec's.
test('selects and clears a whole group with its checkbox', async () => {
  const frame = await openDashboard(vscode.page);
  await clearView(frame);
  const box = groupCheckbox(frame, 'backend');
  await expect(box).toHaveAttribute('aria-checked', 'false');
  await expect(box).toHaveAttribute('aria-label', 'Select group backend');
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true');
  await expect(frame.locator('.selected-count')).toHaveText('6 selected');
  for (const name of BACKEND) await expect(row(frame, name)).toHaveAttribute('aria-selected', 'true');
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'false');
  await expect(frame.locator('.selected-count')).toHaveCount(0);
});

test('selects the rest of a group that is partly selected', async () => {
  const { page } = vscode;
  const frame = await openDashboard(page);
  await clearView(frame);
  await focusRow(frame, 'ledger');
  await page.keyboard.press('Space');
  const box = groupCheckbox(frame, 'backend');
  await expect(box).toHaveAttribute('aria-checked', 'mixed');
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true');
  await expect(frame.locator('.selected-count')).toHaveText('6 selected');
  await clearView(frame);
});

test('selects the rows of a collapsed group without expanding it', async () => {
  const frame = await openDashboard(vscode.page);
  await clearView(frame);
  await groupHeader(frame, 'backend').locator('.group-name').click();
  await expect(groupHeader(frame, 'backend')).toHaveText('▸ backend (6)');
  await groupCheckbox(frame, 'backend').click();
  await expect(groupHeader(frame, 'backend')).toHaveText('▸ backend (6)');
  await expect(groupCheckbox(frame, 'backend')).toHaveAttribute('aria-checked', 'true');
  await expect(frame.locator('.selected-count')).toHaveText('6 selected');
  await groupHeader(frame, 'backend').locator('.group-name').click();
  await expect(groupHeader(frame, 'backend')).toHaveText('▾ backend (6)');
  await clearView(frame);
});

test('selects only the rows the filter shows and keeps a hidden selected row', async () => {
  const { page } = vscode;
  const frame = await openDashboard(page);
  await clearView(frame);
  await focusRow(frame, 'ledger');
  await page.keyboard.press('Space');
  await frame.locator('input.filter').fill('bill');
  await expect(groupHeader(frame, 'backend')).toHaveText('▾ backend (1)');
  await expect(groupCheckbox(frame, 'backend')).toHaveAttribute('aria-checked', 'false');
  await groupCheckbox(frame, 'backend').click();
  await expect(groupCheckbox(frame, 'backend')).toHaveAttribute('aria-checked', 'true');
  await expect(frame.locator('.selected-count')).toHaveText('2 selected');
  await frame.locator('input.filter').fill('');
  await expect(row(frame, 'ledger')).toHaveAttribute('aria-selected', 'true');
  await expect(row(frame, 'billing-api')).toHaveAttribute('aria-selected', 'true');
  await expect(row(frame, 'auth-service')).toHaveAttribute('aria-selected', 'false');
  await clearView(frame);
});

test('leaves the selection of other groups alone', async () => {
  const { page } = vscode;
  const frame = await openDashboard(page);
  await clearView(frame);
  await focusRow(frame, 'scratch');
  await page.keyboard.press('Space');
  await groupCheckbox(frame, 'backend').click();
  await expect(frame.locator('.selected-count')).toHaveText('7 selected');
  await expect(row(frame, 'scratch')).toHaveAttribute('aria-selected', 'true');
  await expect(row(frame, 'live')).toHaveAttribute('aria-selected', 'false');
  await expect(groupCheckbox(frame, 'tools')).toHaveAttribute('aria-checked', 'mixed');
  await clearView(frame);
});

test('still collapses a group from a click on its name', async () => {
  const frame = await openDashboard(vscode.page);
  await clearView(frame);
  await groupHeader(frame, 'infra').locator('.group-name').click();
  await expect(groupHeader(frame, 'infra')).toHaveText('▸ infra (3)');
  await expect(groupCheckbox(frame, 'infra')).toHaveAttribute('aria-checked', 'false');
  await expect(frame.locator('.selected-count')).toHaveCount(0);
  await groupHeader(frame, 'infra').locator('.group-name').click();
  await expect(groupHeader(frame, 'infra')).toHaveText('▾ infra (3)');
});

test('shows a group as mixed after Space clears one of its rows', async () => {
  const { page } = vscode;
  const frame = await openDashboard(page);
  await clearView(frame);
  await groupCheckbox(frame, 'backend').click();
  await focusRow(frame, 'ledger');
  await page.keyboard.press('Space');
  await expect(row(frame, 'ledger')).toHaveAttribute('aria-selected', 'false');
  await expect(groupCheckbox(frame, 'backend')).toHaveAttribute('aria-checked', 'mixed');
  await clearView(frame);
});

// dashboard :: Select-all checkbox matrix R2, R3, R4 and R6
test('selects and clears every matching row from the column header', async () => {
  const { page } = vscode;
  const frame = await openDashboard(page);
  await clearView(frame);
  const total = await frame.locator('[data-repo]').count();
  await expect(selectAll(frame)).toHaveAttribute('aria-label', 'Select all matching repositories');
  await focusRow(frame, 'ledger');
  await page.keyboard.press('Space');
  await expect(selectAll(frame)).toHaveAttribute('aria-checked', 'mixed');
  await selectAll(frame).click();
  await expect(selectAll(frame)).toHaveAttribute('aria-checked', 'true');
  await expect(frame.locator('.selected-count')).toHaveText(`${total} selected`);
  await selectAll(frame).click();
  await expect(frame.locator('.selected-count')).toHaveCount(0);

  await focusRow(frame, 'ledger');
  await page.keyboard.press('Space');
  await frame.locator('input.filter').fill('bill');
  await expect(selectAll(frame)).toHaveAttribute('aria-checked', 'false');
  await selectAll(frame).click();
  await expect(frame.locator('.selected-count')).toHaveText('2 selected');

  await frame.locator('input.filter').fill('zzz');
  await expect(selectAll(frame)).toBeDisabled();
  await expect(frame.locator('.selected-count')).toHaveText('2 selected');
  await clearView(frame);
});

// dashboard :: Range selection matrix R4: from billing-api to live, skipping the collapsed group infra.
test('selects a range with Shift+click, skipping a collapsed group', async () => {
  const frame = await openDashboard(vscode.page);
  await clearView(frame);
  await groupHeader(frame, 'infra').locator('.group-name').click();
  await expect(groupHeader(frame, 'infra')).toHaveText('▸ infra (3)');
  await row(frame, 'billing-api').locator('input[type="checkbox"]').click();
  await row(frame, 'live').locator('input[type="checkbox"]').click({ modifiers: ['Shift'] });
  const order = await repoOrder(frame);
  const range = order.slice(order.indexOf('billing-api'), order.indexOf('live') + 1);
  expect(range).not.toContain('detached');
  await expect(frame.locator('.selected-count')).toHaveText(`${range.length} selected`);
  for (const name of range) await expect(row(frame, name)).toHaveAttribute('aria-selected', 'true');
  expect(await frame.locator('body').evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
  await groupHeader(frame, 'infra').locator('.group-name').click();
  await expect(row(frame, 'detached')).toHaveAttribute('aria-selected', 'false');
  await clearView(frame);
});

/** Clicks the sorted column header until the default sort is back. */
async function resetSort(frame: FrameLocator): Promise<void> {
  for (let i = 0; i < 3 && (await frame.locator('[data-sort="repository"]').textContent()) !== 'Repository ▲'; i++) {
    await frame.locator('.row.header [aria-sort] button').click();
  }
  await expect(frame.locator('[data-sort="repository"]')).toHaveText('Repository ▲');
}

// dashboard :: Groups keep their order under a sort
test('keeps the groups in name order and sorts the rows within each group', async () => {
  const frame = await openDashboard(vscode.page);
  await clearView(frame);
  const groupsBefore = await frame.locator('.row.group .group-name').allTextContents();
  await frame.locator('[data-sort="sync"]').click();
  await expect(frame.locator('[data-sort="sync"]')).toHaveText('Sync ▼');
  await expect(frame.locator('[data-sort="repository"]')).toHaveText('Repository');
  expect(await frame.locator('.row.group .group-name').allTextContents()).toEqual(groupsBefore);
  // ↓2, ↑1 ↓1, ↑2, then ⇡ publish (A→Z), then —.
  expect((await repoOrder(frame)).filter((n) => BACKEND.includes(n))).toEqual(['ledger', 'notifications', 'billing-api', 'auth-service', 'stashed-hotfix', 'stashed']);
  await resetSort(frame);
});

// dashboard :: Sorting keeps selection, filter and focus (billing-api and auth-service stand in for the dirty rows).
test('keeps the selection, the filter, the chips and the focused row when sorting', async () => {
  const { page } = vscode;
  const frame = await openDashboard(page);
  await clearView(frame);
  await focusRow(frame, 'auth-service');
  await page.keyboard.press('Space');
  await focusRow(frame, 'billing-api');
  await page.keyboard.press('Space');
  await frame.locator('input.filter').fill('a');
  await frame.locator('[data-chip="dirty"]').click();
  await frame.locator('[data-sort="changes"]').click();
  await expect(frame.locator('[data-sort="changes"]')).toHaveText('Changes ▼');
  await expect(frame.locator('input.filter')).toHaveValue('a');
  await expect(frame.locator('[data-chip="dirty"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(frame.locator('.selected-count')).toHaveText('2 selected');
  await expect(frame.locator('.row.repo.focused')).toHaveAttribute('data-repo', 'billing-api');
  await resetSort(frame);
  await clearView(frame);
});

// dashboard :: A row moves when its sort key changes. Runs last: it changes the fixture.
test('moves a row when its sort key changes and keeps the focus on the focused row', async () => {
  const { page, fixture } = vscode;
  const frame = await openDashboard(page);
  await clearView(frame);
  await frame.locator('[data-sort="sync"]').click();
  await expect(frame.locator('[data-sort="sync"]')).toHaveText('Sync ▼');
  await focusRow(frame, 'ledger');
  const ledgerKey = (await row(frame, 'ledger').getAttribute('data-key')) as string;
  expect((await repoOrder(frame)).filter((n) => BACKEND.includes(n)).slice(0, 2)).toEqual(['ledger', 'notifications']);

  // 3 more commits on the remote of notifications: ↑1 ↓4 after a fetch, ahead of ledger's ↓2.
  for (const n of [1, 2, 3]) pushFromSeed(join(fixture.remotes, 'notifications-seed'), `more-${n}.md`, `More ${n}`);
  git(fixture.repo('backend/notifications'), 'fetch');

  await expect(row(frame, 'notifications').locator('[data-col="sync"]')).toHaveText('↑1 ↓4', { timeout: 1_000 });
  expect((await repoOrder(frame)).filter((n) => BACKEND.includes(n)).slice(0, 2)).toEqual(['notifications', 'ledger']);
  expect(await focusedKey(frame)).toBe(ledgerKey);
  await resetSort(frame);
});

