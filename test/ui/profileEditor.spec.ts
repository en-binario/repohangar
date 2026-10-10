// mr-profiles :: Open the editor twice, Title preview, Delete the default profile, Forget a repository memory.

import { expect, test, type Frame, type FrameLocator, type Page } from '@playwright/test';
import { startProviderStub, type StubRequest } from '../integration/fixtures/providerStub';
import { createProvidersFixture, git } from '../integration/fixtures/repos';
import { focusRow, launch, notification, openDashboard, row, runCommand, type VsCode } from './vscode';

let vscode: VsCode;
let page: Page;
let frame: FrameLocator;
let stub: Awaited<ReturnType<typeof startProviderStub>>;

/** git.acme.com: no open merge request, a project without a squash policy, ana.perez signed in. */
function routes(request: StubRequest) {
  const { method, host, path } = request;
  if (method === 'GET' && path === '/api/v4/user') return { body: { username: 'ana.perez' } };
  if (method === 'GET' && path === '/api/v3/user') return { body: { login: 'ana' } };
  if (method === 'GET' && path === '/api/v4/version' && host === 'git.acme.com') return { body: { version: '17.10.0' } };
  if (method === 'POST' && path.endsWith('/graphql')) {
    const query = (request.body as { query: string }).query;
    const data: Record<string, unknown> = {};
    for (const m of query.matchAll(/\b(r\d+):\s*(project|repository)\(/g)) {
      data[m[1] as string] = m[2] === 'project' ? { mergeRequests: { nodes: [] } } : { pullRequests: { nodes: [] } };
    }
    return { body: { data } };
  }
  if (method === 'GET' && path === '/api/v4/projects/payments%2Fbilling-api') return { body: { id: 31, default_branch: 'main', squash_option: 'default_off' } };
  return undefined;
}

/** The editor's document: VS Code's webview frames are searched for it (the dashboard has its own). */
async function editorFrame(): Promise<Frame> {
  let found: Frame | undefined;
  await expect(async () => {
    found = undefined;
    for (const f of page.frames()) {
      if (await f.locator('.profiles-editor').count().catch(() => 0)) found = f;
    }
    expect(found).toBeDefined();
  }).toPass({ timeout: 30_000 });
  return found as Frame;
}

const tabs = () => page.locator('.tabs-container .tab', { hasText: 'MR Profiles' });
const billing = () => vscode.fixture.repo('backend/billing-api');

test.beforeAll(async () => {
  stub = await startProviderStub([routes]);
  vscode = await launch(createProvidersFixture(), {
    env: {
      REPOHANGAR_HTTP_STUB: stub.url,
      REPOHANGAR_TEST_TOKENS: JSON.stringify({ 'git.acme.com': 'glpat-x1y2', 'github.acme.com': 'ghp_a1b2' }),
    },
    settings: { 'repohangar.mr.profiles': { default: { reviewers: ['ana.perez'] } } },
  });
  page = vscode.page;
});

test.afterAll(async () => {
  await vscode?.close();
  await stub?.close();
});

test('Open the editor twice: ⚙ reveals the open MR Profiles panel', async () => {
  await runCommand(page, 'RepoHangar: Edit MR Profiles');
  await editorFrame();
  // The dashboard becomes the active tab; the editor waits in a background tab.
  frame = await openDashboard(page);
  await expect(page.locator('.tabs-container .tab.active')).not.toContainText('MR Profiles');

  await frame.locator('[data-button="editProfiles"]').click();

  await expect(page.locator('.tabs-container .tab.active')).toContainText('MR Profiles');
  await expect(tabs()).toHaveCount(1);
  await editorFrame();
});

test('Title preview: the focused row’s repository and branch', async () => {
  git(billing(), 'checkout', '-b', 'feature/ABC-12-add-notes');
  try {
    frame = await openDashboard(page);
    await expect(row(frame, 'billing-api').locator('[data-col="branch"]')).toContainText('feature/ABC-12-add-notes', { timeout: 30_000 });
    await focusRow(frame, 'billing-api');
    await frame.locator('[data-button="editProfiles"]').click();
    const editor = await editorFrame();

    await editor.locator('[data-field="title"]').fill('{type}: {ticket} {branchTitle}');

    await expect(editor.locator('[data-preview]')).toHaveText('→ feat: ABC-12 Add notes');
    // The focused row, not the example repository.
    await editor.locator('[data-field="title"]').fill('{repo}: {branchTitle}');
    await expect(editor.locator('[data-preview]')).toHaveText('→ billing-api: Add notes');
  } finally {
    git(billing(), 'checkout', 'feature/ABC-12-notes');
  }
});

test('Delete the default profile: Delete is disabled', async () => {
  await runCommand(page, 'RepoHangar: Edit MR Profiles');
  const editor = await editorFrame();

  await editor.locator('[data-profile="default"] .profile-actions').click();

  const remove = editor.locator('[data-profile="default"] [data-action="delete"]');
  await expect(remove).toBeDisabled();
  await expect(remove).toHaveAttribute('title', 'The default profile cannot be deleted.');
});

test('Forget a repository memory: the entry and its line are gone', async () => {
  // billing-api → reviewers +carla.ruiz, saved with For this repo only.
  frame = await openDashboard(page);
  await expect(row(frame, 'billing-api').locator('[data-col="review"]')).toHaveText('[Create MR]', { timeout: 30_000 });
  await focusRow(frame, 'billing-api');
  await page.keyboard.press('Shift+M');
  const drawer = frame.locator('.drawer');
  await expect(drawer).toBeVisible({ timeout: 15_000 });
  await drawer.locator('[aria-label="Add to reviewers"]').fill('carla.ruiz');
  await drawer.locator('[aria-label="Add to reviewers"]').press('Enter');
  await drawer.locator('[data-button="saveDefaults"]').click();
  await drawer.locator('[data-save="repo"]').click();
  await expect(notification(page, 'Saved reviewers for billing-api in this workspace.')).toBeVisible({ timeout: 15_000 });
  await drawer.locator('[data-button="cancel"]').click();

  await frame.locator('[data-button="editProfiles"]').click();
  let editor = await editorFrame();
  const line = () => editor.locator('[data-memory="git.acme.com/payments/billing-api"]');
  await expect(line().locator('.memory-line')).toHaveText('billing-api → reviewers +carla.ruiz');

  await line().locator('[data-button="forget"]').click();

  await expect(line()).toHaveCount(0);
  // The entry is gone from the workspace state too: a new editor lists nothing.
  await runCommand(page, 'View: Close Editor');
  await expect(tabs()).toHaveCount(0);
  await runCommand(page, 'RepoHangar: Edit MR Profiles');
  editor = await editorFrame();
  await expect(editor.locator('[aria-label="Repository memory"] .note')).toBeVisible();
  await expect(line()).toHaveCount(0);
});
