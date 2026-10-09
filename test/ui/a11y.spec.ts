// dashboard :: Accessible names matrix, one test per row in row order R1–R14, plus the grid role and roving tabindex.

import { utimesSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type FrameLocator } from '@playwright/test';
import { createMainFixture, git } from '../integration/fixtures/repos';
import { focusRow, launch, openDashboard, row, type VsCode } from './vscode';

let vscode: VsCode;
let frame: FrameLocator;

test.beforeAll(async () => {
  const fixture = createMainFixture({ 'repohangar.hosts': { 'git.acme.test': 'gitlab' } });
  // ledger on an unknown host; notifications fetched 3 hours ago.
  git(fixture.repo('backend/ledger'), 'remote', 'set-url', 'origin', 'https://git.other.test/team/ledger.git');
  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
  utimesSync(join(fixture.repo('backend/notifications'), '.git', 'FETCH_HEAD'), threeHoursAgo, threeHoursAgo);
  vscode = await launch(fixture);
  frame = await openDashboard(vscode.page);
});

test.afterAll(async () => {
  await vscode?.close();
});

/** The element with accessible name `label` inside the column `col` of a row, and its visible text. */
async function expectSymbol(repo: string, col: string, text: string, label: string): Promise<void> {
  const symbol = row(frame, repo).locator(`[data-col="${col}"] [role="img"][aria-label="${label}"]`);
  await expect(symbol).toHaveText(text);
}

const cases: [string, string, string, string, string][] = [
  ['names the GitLab badge', 'billing-api', 'repository', 'GL', 'GitLab'],
  ['names the GitHub badge', 'new-service', 'repository', 'GH', 'GitHub'],
  ['names the unknown host badge', 'ledger', 'repository', '?', 'Unknown host'],
  ['names commits ahead', 'billing-api', 'sync', '↑2', '2 commits ahead'],
  ['names commits behind', 'ledger', 'sync', '↓2', '2 commits behind'],
  ['names an unpublished branch', 'auth-service', 'sync', '⇡ publish', 'Branch not published'],
  ['names the no upstream badge', 'auth-service', 'branch', 'no upstream', 'No upstream branch'],
  ['names unstaged files', 'billing-api', 'changes', '●2', '2 files with unstaged changes'],
  ['names staged files', 'billing-api', 'changes', '+1', '1 file with staged changes'],
  ['names untracked files', 'auth-service', 'changes', '?2', '2 untracked files'],
  ['names conflicts', 'merging', 'changes', '⚠ 1 confl', '1 file with conflicts'],
  ['names stashes', 'stashed', 'changes', '≡2', '2 stashes'],
  ['names the stale fetch marker', 'notifications', 'fetched', '⚠', 'Last fetch more than 1 h ago'],
  ['names an empty Sync cell', 'live', 'sync', '—', 'Nothing to sync'],
];

for (const [name, repo, col, text, label] of cases) {
  test(name, async () => {
    await expectSymbol(repo, col, text, label);
  });
}

test('exposes a grid with one focusable cell at a time', async () => {
  await expect(frame.getByRole('grid', { name: 'Repositories' })).toBeVisible();
  await focusRow(frame, 'ledger');
  await expect(frame.locator('[role="grid"] [tabindex="0"]')).toHaveCount(1);
  await expect(row(frame, 'ledger').locator('[data-col="repository"]')).toHaveAttribute('tabindex', '0');
});
