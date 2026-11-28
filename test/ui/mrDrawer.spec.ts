// mr-creation :: Drawer actions matrix (R1–R5), and the note of Squash policy matrix R1 (mr-profiles) under the box.
// mr-profiles :: Save as defaults matrix (R1–R3), end to end with the notifications.
// mr-creation :: User selection matrix (R1–R10), with the user search answered by the provider stub.

import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { startProviderStub, type StubRequest } from '../integration/fixtures/providerStub';
import { createProvidersFixture } from '../integration/fixtures/repos';
import { focusRow, launch, notification, openDashboard, writeSettings, type VsCode } from './vscode';

let vscode: VsCode;
let page: Page;
let frame: FrameLocator;
let stub: Awaited<ReturnType<typeof startProviderStub>>;

const USERS: Record<string, number> = { 'ana.perez': 11, 'luis.gomez': 12 };

/** GitLab on git.acme.com: no open merge request, the project's `squash_option`, and the create request. */
const routes = (squashOption: string) => (request: StubRequest) => {
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
  if (method === 'GET' && path === '/api/v4/projects/payments%2Fbilling-api') return { body: { id: 31, default_branch: 'main', squash_option: squashOption } };
  if (method === 'GET' && path.startsWith('/api/v4/users?username=')) {
    const name = decodeURIComponent(path.slice('/api/v4/users?username='.length));
    return { body: USERS[name] ? [{ id: USERS[name], username: name }] : [] };
  }
  if (method === 'POST' && path === '/api/v4/projects/payments%2Fbilling-api/merge_requests') {
    const body = request.body as { title: string };
    return { status: 201, body: { iid: 142, web_url: 'https://git.acme.com/payments/billing-api/-/merge_requests/142', title: body.title, reviewers: [], assignees: [], labels: [] } };
  }
  return undefined;
};

const creates = () => stub.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/merge_requests'));
const drawer = () => frame.locator('.drawer');
const field = (name: string) => drawer().locator(`[data-field="${name}"]`);

test.describe('Drawer actions matrix', () => {
  test.beforeAll(async () => {
    stub = await startProviderStub([routes('never')]);
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
});

test.describe('Save as defaults matrix', () => {
  // Profile `default` (user scope) has reviewers ["ana.perez"], squash false; the drawer for billing-api gets
  // reviewers ["ana.perez", "carla.ruiz"], squash true and an edited title. The project has no squash policy.
  const PROFILES = { default: { reviewers: ['ana.perez'], squash: false } };
  const SAVED = { reviewers: ['ana.perez', 'carla.ruiz'], squash: true };
  const PROFILES_KEY = 'repohangar.mr.profiles';

  const userProfiles = () => (JSON.parse(readFileSync(vscode.settingsFile, 'utf8')) as Record<string, unknown>)[PROFILES_KEY];
  const workspaceSettings = () => (JSON.parse(readFileSync(vscode.fixture.workspaceFile, 'utf8')) as { settings: Record<string, unknown> }).settings;
  const chips = (name: string) => drawer().locator(`[data-chips="${name}"] .chip-value`);

  test.beforeAll(async () => {
    stub = await startProviderStub([routes('default_off')]);
    vscode = await launch(createProvidersFixture(), {
      env: {
        REPOHANGAR_HTTP_STUB: stub.url,
        REPOHANGAR_TEST_TOKENS: JSON.stringify({ 'git.acme.com': 'glpat-x1y2', 'github.acme.com': 'ghp_a1b2' }),
      },
      settings: { [PROFILES_KEY]: PROFILES },
    });
    page = vscode.page;
    frame = await openDashboard(page);
    await expect(frame.locator('[data-repo="billing-api"] [data-col="review"]')).toHaveText('[Create MR]', { timeout: 30_000 });
  });

  /** Each row starts from the profile above at user scope only, with the drawer of billing-api edited as above. */
  test.beforeEach(async () => {
    writeSettings(vscode, { [PROFILES_KEY]: PROFILES });
    const workspace = JSON.parse(readFileSync(vscode.fixture.workspaceFile, 'utf8')) as { settings: Record<string, unknown> };
    delete workspace.settings[PROFILES_KEY];
    writeFileSync(vscode.fixture.workspaceFile, JSON.stringify(workspace, null, 2));
    // VS Code reads the changed files on its own; open the drawer again until it shows the profile as written.
    await expect(async () => {
      if (await drawer().isVisible()) await drawer().locator('[data-button="cancel"]').click();
      frame = await openDashboard(page);
      await focusRow(frame, 'billing-api');
      await page.keyboard.press('Shift+M');
      await expect(drawer()).toBeVisible({ timeout: 15_000 });
      await expect(chips('reviewers')).toHaveText(['ana.perez✕'], { timeout: 2_000 });
      await expect(field('squash')).not.toBeChecked({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
    await drawer().locator('[aria-label="Add to reviewers"]').fill('carla.ruiz');
    await drawer().locator('[aria-label="Add to reviewers"]').press('Enter');
    await field('squash').check();
    await field('title').fill('feat: ABC-12 Notes on invoices');
    await expect(chips('reviewers')).toHaveText(['ana.perez✕', 'carla.ruiz✕']);
  });

  test.afterAll(async () => {
    await vscode?.close();
    await stub?.close();
  });

  const saveAs = async (target: 'user' | 'workspace' | 'repo') => {
    await drawer().locator('[data-button="saveDefaults"]').click();
    await drawer().locator(`[data-save="${target}"]`).click();
  };

  test('R1 For me (all workspaces) writes reviewers and squash to the user-scope profile, no title', async () => {
    await saveAs('user');
    await expect(notification(page, 'Saved reviewers, squash to the MR profile "default" (user settings).')).toBeVisible({ timeout: 15_000 });
    await expect.poll(userProfiles).toEqual({ default: SAVED });
    expect(workspaceSettings()[PROFILES_KEY]).toBeUndefined();
    expect(creates()).toHaveLength(0);
  });

  test('R2 For this workspace (shared) writes them to the workspace-scope profile', async () => {
    await saveAs('workspace');
    await expect(notification(page, 'Saved reviewers, squash to the MR profile "default" (workspace settings).')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => workspaceSettings()[PROFILES_KEY]).toEqual({ default: SAVED });
    expect(userProfiles()).toEqual(PROFILES);
  });

  test('R3 For this repo only keeps them for billing-api in this workspace, and writes no setting', async () => {
    await saveAs('repo');
    await expect(notification(page, 'Saved reviewers, squash for billing-api in this workspace.')).toBeVisible({ timeout: 15_000 });
    expect(userProfiles()).toEqual(PROFILES);
    expect(workspaceSettings()[PROFILES_KEY]).toBeUndefined();
    // The memory applies to the next drawer of billing-api (mr-profiles: Per-repository memory).
    await drawer().locator('[data-button="cancel"]').click();
    await focusRow(frame, 'billing-api');
    await page.keyboard.press('Shift+M');
    await expect(chips('reviewers')).toHaveText(['ana.perez✕', 'carla.ruiz✕']);
    await expect(field('squash')).toBeChecked();
  });
});

test.describe('User selection matrix', () => {
  const MEMBERS = '/api/v4/projects/payments%2Fbilling-api/members/all?query=';
  /** `jhon` matches two active members; `jdoe` matches nobody, answered after 2 s so `Searching…` shows first. */
  const members = (request: StubRequest) => {
    if (request.method !== 'GET' || !request.path.startsWith(MEMBERS)) return undefined;
    const query = decodeURIComponent(request.path.slice(MEMBERS.length).split('&')[0] ?? '');
    if (query === 'jhon') {
      return {
        body: [
          { id: 21, username: 'jtapia', name: 'Jhon Tapia', state: 'active' },
          { id: 22, username: 'jruiz', name: 'Jhon Ruiz', state: 'active' },
        ],
      };
    }
    return { body: [], delayMs: 2_000 };
  };
  const input = (name: string) => drawer().locator(`[aria-label="Add to ${name}"]`);
  const list = (name: string) => drawer().locator(`[data-users="${name}"]`);
  const options = (name: string) => list(name).locator('[role="option"]');
  const chips = (name: string) => drawer().locator(`[data-chips="${name}"] .chip-value`);

  test.beforeAll(async () => {
    stub = await startProviderStub([members, routes('never')]);
    vscode = await launch(createProvidersFixture(), {
      env: {
        REPOHANGAR_HTTP_STUB: stub.url,
        REPOHANGAR_TEST_TOKENS: JSON.stringify({ 'git.acme.com': 'glpat-x1y2', 'github.acme.com': 'ghp_a1b2' }),
      },
      settings: { 'repohangar.mr.profiles': { default: { squash: true } } },
    });
    page = vscode.page;
  });

  /** Every row starts with the drawer of billing-api and no reviewers. */
  test.beforeEach(async () => {
    frame = await openDashboard(page);
    await expect(frame.locator('[data-repo="billing-api"] [data-col="review"]')).toHaveText('[Create MR]', { timeout: 30_000 });
    await focusRow(frame, 'billing-api');
    await page.keyboard.press('Shift+M');
    await expect(drawer()).toBeVisible({ timeout: 15_000 });
    await expect(chips('reviewers')).toHaveCount(0);
  });

  test.afterAll(async () => {
    await vscode?.close();
    await stub?.close();
  });

  /** `jhon` typed in Reviewers, its two users listed, the first highlighted. */
  const typeJhon = async () => {
    await input('reviewers').fill('jhon');
    await expect(options('reviewers')).toHaveText(['Jhon Tapia @jtapia', 'Jhon Ruiz @jruiz']);
    await expect(options('reviewers').first()).toHaveAttribute('aria-selected', 'true');
  };
  const closeDrawer = async () => {
    if (await drawer().isVisible()) await drawer().locator('[data-button="cancel"]').click();
  };
  const addedAndClosed = async (chip: string) => {
    await expect(chips('reviewers')).toHaveText([`${chip}✕`]);
    await expect(input('reviewers')).toHaveValue('');
    await expect(list('reviewers')).toHaveCount(0);
    await expect(drawer()).toBeVisible();
    await closeDrawer();
  };

  test('R1 adds the highlighted first user with Enter', async () => {
    await typeJhon();
    await input('reviewers').press('Enter');
    await addedAndClosed('jtapia');
  });

  test('R2 adds the second user after ↓', async () => {
    await typeJhon();
    await input('reviewers').press('ArrowDown');
    await input('reviewers').press('Enter');
    await addedAndClosed('jruiz');
  });

  test('R3 wraps to the last user with ↑', async () => {
    await typeJhon();
    await input('reviewers').press('ArrowUp');
    await input('reviewers').press('Enter');
    await addedAndClosed('jruiz');
  });

  test('R4 adds the user clicked in the list', async () => {
    await typeJhon();
    await options('reviewers').filter({ hasText: '@jruiz' }).click();
    await addedAndClosed('jruiz');
  });

  test('R5 adds the typed text without its @ while the search runs', async () => {
    await input('reviewers').fill('@jdoe');
    await expect(list('reviewers')).toHaveText('Searching…');
    await input('reviewers').press('Enter');
    await addedAndClosed('jdoe');
  });

  test('R6 adds the typed text when no user matches', async () => {
    await input('reviewers').fill('jdoe');
    await expect(list('reviewers')).toHaveText('No users on git.acme.com match "jdoe".');
    await input('reviewers').press('Enter');
    await addedAndClosed('jdoe');
  });

  test('R7 closes only the list with Esc', async () => {
    await typeJhon();
    await input('reviewers').press('Escape');
    await expect(list('reviewers')).toHaveCount(0);
    await expect(chips('reviewers')).toHaveCount(0);
    await expect(input('reviewers')).toHaveValue('jhon');
    await expect(drawer()).toBeVisible();
    await closeDrawer();
  });

  test('R8 closes the drawer with Esc when the list is closed, and sends nothing', async () => {
    const before = creates().length;
    await typeJhon();
    await input('reviewers').press('Escape');
    await expect(list('reviewers')).toHaveCount(0);
    await input('reviewers').press('Escape');
    await expect(drawer()).toHaveCount(0);
    expect(creates().length).toBe(before);
  });

  test('R10 closes the list and keeps the text when the focus moves to Assignees', async () => {
    await typeJhon();
    // The open list covers Assignees, so the focus moves there without a click.
    await input('assignees').focus();
    await expect(input('assignees')).toBeFocused();
    await expect(list('reviewers')).toHaveCount(0);
    await expect(chips('reviewers')).toHaveCount(0);
    await expect(input('reviewers')).toHaveValue('jhon');
    await expect(drawer()).toBeVisible();
    await closeDrawer();
  });

  // Last: it creates the merge request.
  test('R9 creates with the values shown on Ctrl+Enter, without the typed text', async () => {
    const before = creates().length;
    await typeJhon();
    await input('reviewers').press('Control+Enter');
    await expect(drawer()).toHaveCount(0);
    await expect(notification(page, 'Created !142 in billing-api')).toBeVisible({ timeout: 15_000 });
    const sent = creates().slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).not.toHaveProperty('reviewer_ids');
  });
});
