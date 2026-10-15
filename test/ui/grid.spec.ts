// The dashboard grid in a real VS Code window: columns, row order, groups, filtering, the open keybinding and the page
// height (dashboard: Dashboard height).

import { expect, test } from '@playwright/test';
import { createMainFixture } from '../integration/fixtures/repos';
import { dashboard, dismissFirstRun, focusRow, launch, openDashboard, row, runCommand, type VsCode } from './vscode';

let vscode: VsCode;

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

test('shows the column headers and orders rows by name', async () => {
  const frame = await openDashboard(vscode.page);
  await expect(frame.locator('.row.header [role="columnheader"]')).toHaveText(['', 'Repository', 'Branch', 'Sync', 'Changes', 'Fetched', 'MR / PR']);
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

