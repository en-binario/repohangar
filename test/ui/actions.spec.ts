// git-operations scenarios in a real VS Code window: Publish tooltip on an unpublished branch, Menu by keyboard,
// Discard canceled in VS Code's confirmation, Pull from the behind notification, Fetch fails (Push key with rows
// selected is in keys.spec.ts) and the Row context menu (add-row-context-menu).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type FrameLocator, type Locator, type Page } from '@playwright/test';
import { createMainFixture, git, type Fixture } from '../integration/fixtures/repos';
import { focusRow, launch, notification, openDashboard, row, watchContextMenu, type VsCode } from './vscode';

let vscode: VsCode;
let page: Page;
let frame: FrameLocator;
let fixture: Fixture;

const samePath = (a: string, b: string) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);

test.beforeAll(async () => {
  fixture = createMainFixture();
  // web-shop pushes to its local remote instead of GitHub.
  git(fixture.repo('frontend/web-shop'), 'remote', 'set-url', '--push', 'origin', join(fixture.remotes, 'web-shop.git'));
  // VS Code's own dialogs and menus as DOM, so the test can click and see them.
  vscode = await launch(fixture, { settings: { 'window.dialogStyle': 'custom', 'window.menuStyle': 'custom' } });
  page = vscode.page;
  frame = await openDashboard(page);
});

test.afterAll(async () => {
  await vscode?.close();
});

test('names the push button Publish on a branch without upstream', async () => {
  await row(frame, 'auth-service').hover();
  const button = row(frame, 'auth-service').locator('button.row-action').nth(2);
  await expect(button).toBeVisible();
  await expect(button).toHaveText('⇡');
  await expect(button).toHaveAttribute('title', 'Publish');
  await expect(button).toHaveAttribute('aria-label', 'Publish');
  await expect(row(frame, 'web-shop').locator('button.row-action').nth(2)).toHaveAttribute('title', 'Push');
});

test('copies the path from the more-actions menu by keyboard', async () => {
  await vscode.app.evaluate(({ clipboard }) => clipboard.writeText(''));
  await focusRow(frame, 'billing-api');
  await page.keyboard.press('.');
  const menu = frame.getByRole('menu', { name: 'Actions for billing-api' });
  await expect(menu).toBeVisible();
  for (let i = 0; i < 12; i++) {
    const action = await frame.locator('body').evaluate(() => document.activeElement?.getAttribute('data-action'));
    if (action === 'copyPath') break;
    await page.keyboard.press('ArrowDown');
  }
  await expect(menu.locator('[data-action="copyPath"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect
    .poll(async () => samePath(await vscode.app.evaluate(({ clipboard }) => clipboard.readText()), fixture.repo('backend/billing-api')))
    .toBe(true);
});

test("leaves the working tree unchanged when VS Code's discard confirmation is canceled", async () => {
  const billing = fixture.repo('backend/billing-api');
  const status = git(billing, 'status', '--porcelain');
  const readme = readFileSync(join(billing, 'README.md'), 'utf8');
  await focusRow(frame, 'billing-api');
  await page.keyboard.press('.');
  await frame.locator('[data-action="discardAll"]').click();
  const dialog = page.locator('.monaco-dialog-box');
  await expect(dialog).toBeVisible();
  await dialog.locator('.monaco-button', { hasText: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  expect(git(billing, 'status', '--porcelain')).toBe(status);
  expect(readFileSync(join(billing, 'README.md'), 'utf8')).toBe(readme);
});

test('pulls from the behind notification', async () => {
  await focusRow(frame, 'ledger');
  await page.keyboard.press('Shift+P');
  const toast = notification(page, "The remote branch of ledger has 2 commits you don't have.");
  await expect(toast).toBeVisible();
  await expect(row(frame, 'ledger').locator('[data-col="sync"]')).toHaveText('↷ behind (↓2)');
  await toast.locator('.monaco-button', { hasText: 'Pull' }).click();
  await expect(row(frame, 'ledger').locator('[data-col="sync"]')).toHaveText('—', { timeout: 30_000 });
});

test('shows a failed fetch with Show Git Output', async () => {
  await focusRow(frame, 'billing-api');
  await page.keyboard.press('f');
  // billing-api's remote host does not exist.
  const toast = notification(page, 'Fetch failed in billing-api: ');
  await expect(toast).toBeVisible({ timeout: 30_000 });
  await expect(toast.locator('.monaco-button', { hasText: 'Show Git Output' })).toBeVisible();
  await expect(row(frame, 'billing-api').locator('[data-col="sync"]')).toHaveText('✗ fetch failed');
  // Dismiss the toast so it does not cover bottom-right menu items in subsequent tests.
  const clear = toast.locator('.codicon-notifications-clear, [aria-label*="Clear Notification"]').first();
  if ((await clear.count()) > 0) await clear.click();
});

test.describe('row context menu', () => {
  const menu = (repo: string) => frame.getByRole('menu', { name: `Actions for ${repo}` });
  const anyMenu = () => frame.getByRole('menu');
  /** VS Code's Cut / Copy / Paste menu of the webview (`window.menuStyle` custom) */
  const defaultMenu = () => page.locator('.context-view .monaco-menu:visible');
  const focusedRepo = async () => {
    const focused = frame.locator('.row.repo.focused');
    return (await focused.count()) > 0 ? focused.getAttribute('data-repo') : null;
  };
  /** Where inside the target element the right-click lands */
  const AT = { x: 6, y: 6 };

  /** Right-clicks `target` at AT and returns the pointer in page coordinates, as boundingBox reports them. */
  async function rightClick(target: Locator): Promise<{ x: number; y: number }> {
    // Scroll first so click() does not shift the viewport after boundingBox() was measured.
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error('target not visible');
    await target.click({ button: 'right', position: AT });
    return { x: box.x + AT.x, y: box.y + AT.y };
  }

  async function closeAll(): Promise<void> {
    if ((await defaultMenu().count()) > 0) await page.keyboard.press('Escape');
    await expect(defaultMenu()).toHaveCount(0);
    if ((await anyMenu().count()) > 0) {
      await anyMenu().locator('[role="menuitem"]:not([aria-disabled="true"])').first().focus();
      await page.keyboard.press('Escape');
    }
    await expect(anyMenu()).toHaveCount(0);
  }

  test.beforeEach(closeAll);

  interface TargetCase {
    id: string;
    /** The row whose menu a right-click on its Branch cell opened before the right-click under test */
    before: string | null;
    target(): Locator;
    /** Opens and closes what the target needs (the row details) */
    setup?(): Promise<void>;
    teardown?(): Promise<void>;
    menu: string | null;
    /** The focused row afterwards; null for unchanged */
    focused: string | null;
  }

  const toggleDetails = async () => {
    await focusRow(frame, 'billing-api');
    await page.keyboard.press('Enter');
  };

  // Right-click target matrix (git-operations: Row context menu); the fixture's rows stand in for the spec's names. R4
  // needs a merge request link in the MR / PR column, which only the providers window has: providers.spec.ts.
  const cases: TargetCase[] = [
    { id: 'R1', before: 'billing-api', target: () => menu('billing-api').locator('[role="menuitem"]').first(), menu: 'billing-api', focused: 'billing-api' },
    { id: 'R2', before: null, target: () => row(frame, 'billing-api').locator('[data-col="branch"]'), menu: 'billing-api', focused: 'billing-api' },
    { id: 'R3', before: null, target: () => row(frame, 'billing-api').locator('button.repo-name'), menu: 'billing-api', focused: 'billing-api' },
    { id: 'R5', before: 'billing-api', target: () => row(frame, 'ledger').locator('[data-col="changes"]'), menu: 'ledger', focused: 'ledger' },
    { id: 'R6', before: null, target: () => frame.locator('.row.group', { hasText: 'backend' }), menu: null, focused: null },
    {
      id: 'R7',
      before: null,
      target: () => frame.locator('[data-details="billing-api"] .detail-line').first(),
      setup: toggleDetails,
      teardown: toggleDetails,
      menu: null,
      focused: null,
    },
    { id: 'R8', before: null, target: () => frame.locator('input.filter'), menu: null, focused: null },
  ];

  for (const c of cases) {
    test(`${c.id}: right-click target matrix`, async () => {
      await c.setup?.();
      try {
        // When another row's cell is targeted while a prior menu is open (R5), scroll it into view before opening
        // `c.before` so scrolling does not close `c.before` or shift the viewport between measurement and click.
        if (c.before && c.id !== 'R1') await c.target().scrollIntoViewIfNeeded();
        let openRect: { left: number; top: number } | null = null;
        if (c.before) {
          await rightClick(row(frame, c.before).locator('[data-col="branch"]'));
          await expect(menu(c.before)).toBeVisible();
          openRect = await menu(c.before).evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top };
          });
        }
        await expect(c.target()).toBeVisible();
        const focusedBefore = await focusedRepo();
        const suppressed = await watchContextMenu(frame);
        // Capture the pointer in the dashboard's own viewport coordinates so scroll shifts cannot skew the check.
        await frame.locator('body').evaluate(() => {
          const w = window as unknown as { rhContextPoint?: { x: number; y: number } | null };
          w.rhContextPoint = null;
          window.addEventListener('contextmenu', (e) => (w.rhContextPoint = { x: e.clientX, y: e.clientY }), { capture: true, once: true });
        });
        await c.target().click({ button: 'right', position: AT });
        await expect.poll(suppressed).toBe(c.menu !== null);

        if (c.menu) {
          await expect(anyMenu()).toHaveCount(1);
          await expect(menu(c.menu)).toBeVisible();
          await expect(defaultMenu()).toHaveCount(0);
          const point = await frame.locator('body').evaluate(() => (window as unknown as { rhContextPoint?: { x: number; y: number } | null }).rhContextPoint ?? null);
          const rect = await menu(c.menu).evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, width: r.width, height: r.height };
          });
          const inner = await frame.locator('body').evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
          // R1 leaves the open menu where it was; the others open at the pointer, clamped to window.innerWidth/Height.
          expect(point).not.toBeNull();
          const expectedX =
            c.id === 'R1' ? (openRect?.left ?? 0) : Math.max(0, Math.min(point?.x ?? 0, inner.width - rect.width));
          const expectedY =
            c.id === 'R1' ? (openRect?.top ?? 0) : Math.max(0, Math.min(point?.y ?? 0, inner.height - rect.height));
          expect(Math.abs(rect.left - expectedX)).toBeLessThanOrEqual(2);
          expect(Math.abs(rect.top - expectedY)).toBeLessThanOrEqual(2);
          expect(await focusedRepo()).toBe(c.focused);
        } else {
          await expect(anyMenu()).toHaveCount(0);
          await expect(defaultMenu().getByRole('menuitem', { name: /^Copy/ })).toBeVisible();
          expect(await focusedRepo()).toBe(focusedBefore);
        }
      } finally {
        await closeAll();
        await c.teardown?.();
      }
    });
  }

  test('copies the path from the right-click menu and keeps the selection', async () => {
    await vscode.app.evaluate(({ clipboard }) => clipboard.writeText(''));
    for (const repo of ['billing-api', 'ledger']) await row(frame, repo).locator('input[type="checkbox"]').check();
    await focusRow(frame, 'web-shop');
    await rightClick(row(frame, 'billing-api').locator('[data-col="fetched"]'));
    await menu('billing-api').locator('[data-action="copyPath"]').click();
    await expect(anyMenu()).toHaveCount(0);
    await expect
      .poll(async () => samePath(await vscode.app.evaluate(({ clipboard }) => clipboard.readText()), fixture.repo('backend/billing-api')))
      .toBe(true);
    expect(await focusedRepo()).toBe('billing-api');
    for (const repo of ['billing-api', 'ledger']) {
      await expect(row(frame, repo).locator('input[type="checkbox"]')).toBeChecked();
      await row(frame, repo).locator('input[type="checkbox"]').uncheck();
    }
  });

  test('keeps a menu opened near the right edge inside the dashboard', async () => {
    const view = await page.locator('iframe.webview.ready').boundingBox();
    const target = row(frame, 'billing-api');
    const box = await target.boundingBox();
    if (!view || !box) throw new Error('dashboard not visible');
    // 10 px from the right edge of the row, where a 220 px menu at the pointer would overflow.
    await target.click({ button: 'right', position: { x: box.width - 10, y: box.height / 2 } });
    const opened = await menu('billing-api').boundingBox();
    if (!opened) throw new Error('menu not visible');
    expect(opened.x).toBeGreaterThanOrEqual(view.x - 1);
    expect(opened.x + opened.width).toBeLessThanOrEqual(view.x + view.width + 1);
    expect(opened.y + opened.height).toBeLessThanOrEqual(view.y + view.height + 1);
  });

  test('disables the same items as the ⋯ button on a clean detached HEAD', async () => {
    await rightClick(row(frame, 'detached').locator('[data-col="branch"]'));
    for (const action of ['stash', 'stashPop', 'discardAll', 'copyBranch']) {
      await expect(menu('detached').locator(`[data-action="${action}"]`)).toHaveAttribute('aria-disabled', 'true');
    }
  });
});
