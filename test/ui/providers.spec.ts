// hosting-providers :: Host choice dismissed, Choose GitLab for an unknown host, Row details of a pull request;
// provider-auth :: First-run summary line, Panel shown once.

import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { startProviderStub, type StubRequest } from '../integration/fixtures/providerStub';
import { createProvidersFixture } from '../integration/fixtures/repos';
import { dashboard, focusRow, launch, openDashboard, row, runCommand, type VsCode } from './vscode';

let vscode: VsCode;
let page: Page;
let frame: FrameLocator;
let stub: Awaited<ReturnType<typeof startProviderStub>>;

const userSettings = () => (existsSync(vscode.settingsFile) ? readFileSync(vscode.settingsFile, 'utf8') : '');

/** The aliases of a status query by project: `r0` → `payments/billing-api`. */
function aliases(query: string): [string, string][] {
  return [...query.matchAll(/\b(r\d+):\s*(?:project\(fullPath: "([^"]+)"\)|repository\(owner: "([^"]+)", name: "([^"]+)"\))/g)].map((m) => [
    m[1] as string,
    (m[2] ?? `${m[3]}/${m[4]}`) as string,
  ]);
}

const MERGE_REQUEST = {
  iid: '142',
  webUrl: 'https://git.acme.com/payments/billing-api/-/merge_requests/142',
  title: 'feat: ABC-12 Add billing notes',
  draft: false,
  detailedMergeStatus: 'MERGEABLE',
  approvalsRequired: 0,
  approvalsLeft: 0,
  autoMergeEnabled: false,
  diffHeadSha: 'c3d4e5f',
  headPipeline: { status: 'SUCCESS' },
};

const PULL_REQUEST = {
  number: 311,
  url: 'https://github.acme.com/acme/admin-portal/pull/311',
  title: 'feat: ABC-12 Add billing notes',
  isDraft: false,
  mergeable: 'MERGEABLE',
  reviewDecision: 'CHANGES_REQUESTED',
  headRefOid: 'c3d4e5f',
  autoMergeRequest: null,
  commits: { nodes: [{ commit: { statusCheckRollup: { state: 'FAILURE' } } }] },
};

function routes(request: StubRequest) {
  const token = request.authorization?.replace(/^Bearer /, '');
  if (request.method === 'GET' && request.path === '/api/v4/user') {
    return token === 'glpat-x1y2' ? { body: { username: 'ana.perez' } } : { status: 401, body: { message: '401 Unauthorized' } };
  }
  if (request.method === 'GET' && request.path === '/api/v3/user') {
    return token === 'ghp_a1b2' ? { body: { login: 'ana' } } : { status: 401, body: { message: 'Bad credentials' } };
  }
  // Only git.acme.com answers as GitLab, so the probe leaves git.unknown.test unknown.
  if (request.method === 'GET' && request.path === '/api/v4/version' && request.host === 'git.acme.com') return { body: { version: '17.10.0' } };
  if (request.method === 'POST' && request.path === '/api/graphql') {
    const query = (request.body as { query: string }).query;
    const data: Record<string, unknown> = {};
    for (const [alias, project] of aliases(query)) {
      if (request.host === 'git.acme.com') data[alias] = { mergeRequests: { nodes: project === 'payments/billing-api' ? [MERGE_REQUEST] : [] } };
      else data[alias] = { pullRequests: { nodes: project === 'acme/admin-portal' ? [PULL_REQUEST] : [] } };
    }
    return { body: { data } };
  }
  return undefined;
}

test.beforeAll(async () => {
  stub = await startProviderStub([routes]);
  vscode = await launch(createProvidersFixture(), {
    env: {
      REPOHANGAR_HTTP_STUB: stub.url,
      REPOHANGAR_TEST_TOKENS: JSON.stringify({ 'git.acme.com': 'glpat-x1y2', 'github.acme.com': 'ghp_a1b2' }),
    },
  });
  page = vscode.page;
  frame = dashboard(page);
});

/** Every test after the first one starts from the grid, also when a failure restarted VS Code. */
test.beforeEach(async ({}, info) => {
  if (!info.title.startsWith('shows the first-run')) frame = await openDashboard(page);
});

test.afterAll(async () => {
  await vscode?.close();
  await stub?.close();
});

test('shows the first-run hosts panel once, with the summary line', async () => {
  await runCommand(page, 'RepoHangar: Open Dashboard');
  await expect(frame.locator('.first-run-summary')).toHaveText(
    'Found 6 repositories: 2 on git.acme.com (GitLab) · 1 on github.acme.com (GitHub) · 1 on github.com (GitHub) · 1 local only',
    { timeout: 60_000 },
  );
  await expect(frame.locator('[data-host="git.acme.com"] .first-run-line')).toHaveText('git.acme.com  ✓ Signed in as ana.perez (token)');
  await expect(frame.locator('[data-host="github.com"] .first-run-line')).toHaveText('github.com  ○ Not connected');
  await expect(frame.locator('[data-host="github.com"] button')).toHaveText(['Sign in to GitHub', 'Skip — git only']);
  await frame.locator('.first-run-done').click();
  await expect(row(frame, 'billing-api')).toBeVisible();
  // Closed and opened again: the grid, not the panel.
  // The dashboard tab is pinned: unpin it, then close it.
  await page.locator('.tabs-container .tab', { hasText: 'RepoHangar' }).click();
  await runCommand(page, 'View: Unpin Editor');
  await runCommand(page, 'View: Close Editor');
  await expect(row(frame, 'billing-api')).toHaveCount(0);
  await runCommand(page, 'RepoHangar: Open Dashboard');
  await expect(row(frame, 'billing-api')).toBeVisible({ timeout: 60_000 });
  await expect(frame.locator('.first-run')).toHaveCount(0);
});

test('shows the loaded merge request and Sign in in the MR / PR column', async () => {
  await expect(row(frame, 'billing-api').locator('[data-col="review"]')).toHaveText('!142✓ passed', { timeout: 30_000 });
  await expect(row(frame, 'web-shop').locator('[data-col="review"]')).toHaveText('Sign in');
  await expect(row(frame, 'charts').locator('[data-col="review"]')).toHaveText('?');
  await expect(row(frame, 'scratch').locator('[data-col="review"]')).toHaveText('—');
});

test('writes no setting when the host choice is dismissed', async () => {
  const before = userSettings();
  await row(frame, 'charts').locator('[data-review="unknownHost"]').click();
  const input = page.locator('.quick-input-widget');
  await expect(input).toBeVisible();
  await expect(input.locator('.quick-input-list .monaco-list-row')).toHaveText([/This host is GitLab/, /This host is GitHub/]);
  await page.keyboard.press('Escape');
  await expect(input).toBeHidden();
  expect(userSettings()).toBe(before);
});

test('writes repohangar.hosts at user scope when GitLab is chosen for an unknown host', async () => {
  await row(frame, 'charts').locator('[data-review="unknownHost"]').click();
  await page.locator('.quick-input-list .monaco-list-row', { hasText: 'This host is GitLab' }).click();
  await expect(row(frame, 'charts').locator('.badge')).toHaveText('GL', { timeout: 10_000 });
  const settings = JSON.parse(readFileSync(vscode.settingsFile, 'utf8')) as Record<string, unknown>;
  expect(settings['repohangar.hosts']).toEqual({ 'git.unknown.test': 'gitlab' });
});

test('shows the pull request lines and buttons in the row details', async () => {
  await expect(row(frame, 'admin-portal').locator('[data-col="review"]')).toHaveText('#311✗ failedchanges requested', { timeout: 30_000 });
  await focusRow(frame, 'admin-portal');
  await page.keyboard.press('Enter');
  const details = frame.locator('[data-details="admin-portal"]');
  await expect(details.locator('.review-details .detail-line')).toHaveText([
    'PR  #311  feat: ABC-12 Add billing notes  Draft: no  changes requested  Mergeable: yes',
    'Checks  ✗ failed Open checks ↗',
  ]);
  await expect(details.locator('.review-details .detail-buttons button')).toHaveText(['Open PR ↗', 'Copy link', 'Compare with main']);
  await expect(details.locator('[data-action="openCompare"]')).toBeEnabled();
});
