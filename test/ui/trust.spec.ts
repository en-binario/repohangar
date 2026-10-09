// dashboard :: Restricted Mode — window opened untrusted, then trusted without a reload.

import { expect, test } from '@playwright/test';
import { createManyFixture } from '../integration/fixtures/repos';
import { launch, openDashboard, row, type VsCode } from './vscode';

let vscode: VsCode;

test.beforeAll(async () => {
  vscode = await launch(createManyFixture(2), { trusted: false, installed: true });
});

test.afterAll(async () => {
  await vscode?.close();
});

const summary = (vs: VsCode) => vs.page.locator('.statusbar-item[aria-label^="RepoHangar:"]');

test('contributes nothing in Restricted Mode', async () => {
  const { page } = vscode;
  // A fresh profile opens the fixture untrusted: VS Code shows the Restricted Mode banner.
  await expect(page.getByRole('banner', { name: /Restricted Mode/ })).toBeVisible({ timeout: 60_000 });

  // Give an enabled extension ample time to activate (onStartupFinished).
  await page.waitForTimeout(5_000);
  await expect(summary(vscode)).toHaveCount(0);

  await page.keyboard.press('F1');
  const input = page.locator('.quick-input-widget input');
  await input.fill('>RepoHangar:');
  await expect(page.locator('.quick-input-list .monaco-list-row', { hasText: 'RepoHangar:' })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('starts without a reload once the workspace is trusted', async () => {
  const { page } = vscode;
  await page.getByRole('banner', { name: /Restricted Mode/ }).getByRole('button', { name: 'Manage' }).click();
  await page.getByRole('button', { name: /^Trust( Workspace)?$/ }).first().click();
  await expect(summary(vscode)).toHaveAttribute('aria-label', 'RepoHangar: 2 repositories, 0 behind, 0 with changes', { timeout: 60_000 });
  await expect(summary(vscode)).toContainText('2 repos');
  const frame = await openDashboard(page, 'svc-01');
  await expect(row(frame, 'svc-02')).toBeVisible();
});
