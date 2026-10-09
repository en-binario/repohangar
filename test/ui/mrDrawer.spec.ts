// mr-creation :: Drawer actions matrix (R1–R5), and the note of Squash policy matrix R1 (mr-profiles) under the box.

import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { startProviderStub, type StubRequest } from '../integration/fixtures/providerStub';
import { createProvidersFixture } from '../integration/fixtures/repos';
import { focusRow, launch, notification, openDashboard, type VsCode } from './vscode';

let vscode: VsCode;
let page: Page;
let frame: FrameLocator;
let stub: Awaited<ReturnType<typeof startProviderStub>>;

const USERS: Record<string, number> = { 'ana.perez': 11, 'luis.gomez': 12 };

function routes(request: StubRequest) {
  const { method, host, path } = request;
  if (method === 'GET' && path === '/api/v4/user') return { body: { username: 'ana.perez' } };
  if (method === 'GET' && path === '/api/v3/user') return { body: { login: 'ana' } };
  if (method === 'GET' && path === '/api/v4/version' && host === 'git.acme.com') return { body: { version: '17.10.0' } };
  if (method === 'POST' && path.endsWith('/graphql')) {
    // No open merge request or pull request anywhere.
    const query = (request.body as { query: string }).query;
    const data: Record<string, unknown> = {};
    for (const m of query.matchAll(/\b(r\d+):\s*(project|repository)\(/g)) {
      data[m[1] as string] = m[2] === 'project' ? { mergeRequests: { nodes: [] } } : { pullRequests: { nodes: [] } };
    }
    return { body: { data } };
  }
  if (method === 'GET' && path === '/api/v4/projects/payments%2Fbilling-api') return { body: { id: 31, default_branch: 'main', squash_option: 'never' } };
  if (method === 'GET' && path.startsWith('/api/v4/users?username=')) {
    const name = decodeURIComponent(path.slice('/api/v4/users?username='.length));
    return { body: USERS[name] ? [{ id: USERS[name], username: name }] : [] };
  }
  if (method === 'POST' && path === '/api/v4/projects/payments%2Fbilling-api/merge_requests') {
    const body = request.body as { title: string };
    return { status: 201, body: { iid: 142, web_url: 'https://git.acme.com/payments/billing-api/-/merge_requests/142', title: body.title, reviewers: [], assignees: [], labels: [] } };
  }
  return undefined;
}

const creates = () => stub.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/merge_requests'));
const drawer = () => frame.locator('.drawer');
const field = (name: string) => drawer().locator(`[data-field="${name}"]`);

test.beforeAll(async () => {
  stub = await startProviderStub([routes]);
  vscode = await launch(createProvidersFixture(), {
    env: {
      REPOHANGAR_HTTP_STUB: stub.url,
      REPOHANGAR_TEST_TOKENS: JSON.stringify({ 'git.acme.com': 'glpat-x1y2', 'github.acme.com': 'ghp_a1b2' }),
    },
    settings: {
      'repohangar.mr.profiles': { default: { squash: true }, hotfix: { labels: ['hotfix'] } },
    },
  });
  page = vscode.page;
});

/** Every test starts with the drawer of billing-api, opened with M on its row. */
test.beforeEach(async () => {
  frame = await openDashboard(page);
  await expect(row().locator('[data-col="review"]')).toHaveText('[Create MR]', { timeout: 30_000 });
  await focusRow(frame, 'billing-api');
  await page.keyboard.press('Shift+M');
  await expect(drawer()).toBeVisible({ timeout: 15_000 });
  await expect(drawer().locator('h2')).toHaveText('Create merge request — billing-api');
});

test.afterAll(async () => {
  await vscode?.close();
  await stub?.close();
});

function row() {
  return frame.locator('[data-repo="billing-api"]');
}

test('shows the squash policy note under the box, with the box cleared, for a project that turns squash off', async () => {
  await expect(field('squash')).not.toBeChecked();
  await expect(drawer().locator('[data-note]')).toContainText(['Squash is turned off for payments/billing-api.']);
  await page.keyboard.press('Escape');
});

test('R2 closes with Esc and sends nothing', async () => {
  const before = creates().length;
  await field('title').focus();
  await page.keyboard.press('Escape');
  await expect(drawer()).toHaveCount(0);
  expect(creates().length).toBe(before);
});

test('R3 closes with Cancel and sends nothing', async () => {
  const before = creates().length;
  await drawer().locator('[data-button="cancel"]').click();
  await expect(drawer()).toHaveCount(0);
  expect(creates().length).toBe(before);
});

test('R4 resolves hotfix after a profile change and keeps the edited title', async () => {
  const before = creates().length;
  await field('title').fill('feat: ABC-12 Notes on invoices');
  await field('profile').selectOption('hotfix');
  await expect(drawer().locator('[data-chips="labels"] .chip-value')).toHaveText(['hotfix✕']);
  await expect(field('title')).toHaveValue('feat: ABC-12 Notes on invoices');
  await expect(drawer()).toBeVisible();
  expect(creates().length).toBe(before);
  await page.keyboard.press('Escape');
});

test('R5 stays open with the guard text at the top when a guard stops Ctrl+Enter', async () => {
  const before = creates().length;
  await field('target').selectOption('feature/ABC-12-notes');
  await field('title').focus();
  await page.keyboard.press('Control+Enter');
  await expect(drawer().locator('.drawer-error')).toHaveText("You're on feature/ABC-12-notes. Create a branch for your changes first.");
  await expect(drawer()).toBeVisible();
  expect(creates().length).toBe(before);
  await page.keyboard.press('Escape');
});

test('R1 creates with the edited title and the other values shown on Ctrl+Enter, then closes', async () => {
  await field('title').fill('feat: ABC-12 Notes on invoices');
  await page.keyboard.press('Control+Enter');
  await expect(drawer()).toHaveCount(0);
  await expect(notification(page, 'Created !142 in billing-api')).toBeVisible({ timeout: 15_000 });
  const sent = creates();
  expect(sent).toHaveLength(1);
  expect(sent[0]?.body).toMatchObject({
    source_branch: 'feature/ABC-12-notes',
    target_branch: 'main',
    title: 'feat: ABC-12 Notes on invoices',
    squash: false,
    remove_source_branch: true,
    assignee_ids: [11],
  });
});
