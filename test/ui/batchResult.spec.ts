// batch-operations :: Pull all result panel, on the main fixture: Pull (ff) of 4 selected rows from the toolbar ends
// with one failure (billing-api's remote host does not exist), two skips and one fast-forward.
// mr-creation :: Copy all links, on the providers fixture: `m` on 3 selected rows creates !142 and !143 and finds the
// open #88, then Copy all links. (github.com signs in only through a VS Code session, which UI tests cannot seed.)

import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { startProviderStub, type StubRequest } from '../integration/fixtures/providerStub';
import { commit, createMainFixture, createProvidersFixture, git } from '../integration/fixtures/repos';
import { focusRow, launch, openDashboard, type VsCode } from './vscode';

let vscode: VsCode;
let page: Page;
let frame: FrameLocator;

test.describe('Pull all result panel', () => {
  test.beforeAll(async () => {
    vscode = await launch(createMainFixture());
    page = vscode.page;
    frame = await openDashboard(page);
  });

  test.afterAll(async () => {
    await vscode?.close();
  });

  test('shows the result panel above the grid after Pull (ff) from the dashboard', async () => {
    for (const repo of ['ledger', 'billing-api', 'notifications', 'auth-service']) {
      await focusRow(frame, repo);
      await page.keyboard.press('Space');
    }
    await expect(frame.locator('.selected-count')).toHaveText('4 selected');
    await frame.locator('[data-batch="pullFf"]').click();

    const panel = frame.locator('.batch-result');
    await expect(panel).toBeVisible({ timeout: 60_000 });
    // Above the grid.
    const [panelBox, gridBox] = await Promise.all([panel.boundingBox(), frame.locator('.grid').boundingBox()]);
    expect((panelBox?.y ?? 0) < (gridBox?.y ?? 0)).toBe(true);

    await expect(panel.locator('.batch-result-title')).toHaveText(/^Pull all \(ff\) — finished in \d+\.\d s$/);
    await expect(panel.locator('.batch-result-counts')).toHaveText('✓ 1 updated · ↷ 2 skipped · ✗ 1 failed');
    const lines = await panel.locator('.batch-result-text').allTextContents();
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^✗ billing-api {2}fetch failed: .+/);
    expect(lines.slice(1)).toEqual(['↷ auth-service  dirty (2 files)', '↷ notifications  diverged (↑1 ↓1)', '✓ ledger  fast-forwarded 2 commits']);

    const buttons = (repo: string) => panel.locator(`[data-result-repo="${repo}"] button`).allTextContents();
    expect(await buttons('billing-api')).toEqual(['Show Git Output']);
    expect(await buttons('auth-service')).toEqual(['Stash and pull']);
    expect(await buttons('notifications')).toEqual(['Pull with rebase', 'Open SCM']);
    expect(await buttons('ledger')).toEqual([]);
    await expect(panel.locator('.batch-result-buttons button')).toHaveText(['Retry failed', 'Close']);

    // The grid stays usable while the panel is shown.
    await focusRow(frame, 'ledger');
    await page.keyboard.press('Enter');
    await expect(frame.locator('[data-details="ledger"]')).toBeVisible();

    await panel.locator('[data-button="close"]').click();
    await expect(panel).toHaveCount(0);
  });
});

/** GitLab (git.acme.com), github.com and GitHub Enterprise (github.acme.com) for the merge request batch. */
function providerRoutes(request: StubRequest) {
  const { method, host, path } = request;
  if (method === 'GET' && path === '/api/v4/user') return { body: { username: 'ana.perez' } };
  if (method === 'GET' && (path === '/user' || path === '/api/v3/user')) return { body: { login: 'ana' } };
  if (method === 'GET' && path === '/api/v4/version' && host === 'git.acme.com') return { body: { version: '17.10.0' } };
  if (method === 'POST' && path.endsWith('/graphql')) {
    // Only admin-portal has an open pull request: #88.
    const query = (request.body as { query: string }).query;
    const data: Record<string, unknown> = {};
    for (const m of query.matchAll(/\b(r\d+):\s*(project|repository)\(([^)]*)\)/g)) {
      const nodes = m[3]?.includes('"admin-portal"')
        ? [{ number: 88, url: 'https://github.acme.com/acme/admin-portal/pull/88', title: 'ABC-12 Portal notes', isDraft: false, headRefOid: 'c3d4e5f', body: 'Closes ABC-12' }]
        : [];
      data[m[1] as string] = m[2] === 'project' ? { mergeRequests: { nodes } } : { pullRequests: { nodes } };
    }
    return { body: { data } };
  }
  if (method === 'GET' && /^\/api\/v4\/projects\/payments%2F[\w-]+$/.test(path)) return { body: { id: 31, default_branch: 'main', squash_option: 'default_off' } };
  if (method === 'GET' && path.startsWith('/api/v4/users?username=')) return { body: [{ id: 11, username: 'ana.perez' }] };
  const create = /^\/api\/v4\/projects\/payments%2F([\w-]+)\/merge_requests$/.exec(path);
  if (method === 'POST' && create) {
    const iid = create[1] === 'ledger' ? 143 : 142;
    return { status: 201, body: { iid, web_url: `https://git.acme.com/payments/${create[1]}/-/merge_requests/${iid}`, reviewers: [], assignees: [], labels: [] } };
  }
  if (method === 'GET' && path === '/api/v3/repos/acme/admin-portal') return { body: { default_branch: 'main' } };
  if (method === 'PUT' || method === 'PATCH') return { body: {} };
  return undefined;
}

test.describe('Copy all links', () => {
  let stub: Awaited<ReturnType<typeof startProviderStub>>;

  test.beforeAll(async () => {
    stub = await startProviderStub([providerRoutes]);
    const fixture = createProvidersFixture();
    // ledger on the feature branch too, pushed to its bare remote (its push URL).
    const ledger = fixture.repo('backend/ledger');
    git(ledger, 'checkout', '-b', 'feature/ABC-12-notes');
    commit(ledger, 'notes.md', 'Add notes to ledger entries');
    git(ledger, 'push', '-u', 'origin', 'feature/ABC-12-notes');
    vscode = await launch(fixture, {
      env: {
        REPOHANGAR_HTTP_STUB: stub.url,
        REPOHANGAR_TEST_TOKENS: JSON.stringify({ 'git.acme.com': 'glpat-x1y2', 'github.acme.com': 'ghp_a1b2' }),
      },
    });
    page = vscode.page;
    frame = await openDashboard(page);
  });

  test.afterAll(async () => {
    await vscode?.close();
    await stub?.close();
  });

  test('copies one line per review of the merge request panel', async () => {
    await vscode.app.evaluate(({ clipboard }) => clipboard.writeText(''));
    for (const repo of ['billing-api', 'ledger', 'admin-portal']) {
      await focusRow(frame, repo);
      await page.keyboard.press('Space');
    }
    await expect(frame.locator('[data-batch="createMr"]')).toHaveText('⤴ Create MRs (3)');
    await page.keyboard.press('m');

    const panel = frame.locator('.batch-result');
    await expect(panel.locator('.batch-result-title')).toHaveText('Create MRs — feature/ABC-12-notes', { timeout: 60_000 });
    await expect(panel.locator('.batch-result-text')).toHaveText([
      '✓ admin-portal  #88  already existed — description updated with related links',
      '✓ billing-api  !142  git.acme.com/payments/billing-api',
      '✓ ledger  !143  git.acme.com/payments/ledger',
    ]);
    await expect(panel.locator('[data-result-repo="billing-api"] button')).toHaveText(['Open ↗']);
    await expect(panel.locator('.batch-result-note')).toHaveText('Related links added to all 3 descriptions.');

    await panel.locator('[data-button="copyAllLinks"]').click();
    await expect
      .poll(() => vscode.app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe(
        [
          'admin-portal #88 https://github.acme.com/acme/admin-portal/pull/88',
          'billing-api !142 https://git.acme.com/payments/billing-api/-/merge_requests/142',
          'ledger !143 https://git.acme.com/payments/ledger/-/merge_requests/143',
        ].join('\n'),
      );
  });
});
