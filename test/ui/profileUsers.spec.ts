// mr-profiles :: Find users in the profile editor: Search users in default matrix R4 (no hosted repository), Pick a
// reviewer for a profile, Change the repository searched. R1–R3 are unit cases of searchDefault.

import { readFileSync } from 'node:fs';
import { expect, test, type Frame, type Page } from '@playwright/test';
import { startProviderStub, type StubRequest } from '../integration/fixtures/providerStub';
import { createManyFixture, createProvidersFixture } from '../integration/fixtures/repos';
import { focusRow, launch, openDashboard, row, runCommand, type VsCode } from './vscode';

let vscode: VsCode;
let page: Page;
let stub: Awaited<ReturnType<typeof startProviderStub>>;

const MEMBERS = '/api/v4/projects/payments%2Fbilling-api/members/all?query=';
const PROFILES_KEY = 'repohangar.mr.profiles';

/** git.acme.com and GitHub: no open review; `jhon` matches two members of billing-api; `ana` one assignable user. */
function routes(request: StubRequest) {
  const { method, host, path } = request;
  if (method === 'GET' && path === '/api/v4/user') return { body: { username: 'ana.perez' } };
  if (method === 'GET' && path === '/api/v3/user') return { body: { login: 'ana' } };
  if (method === 'GET' && path === '/api/v4/version' && host === 'git.acme.com') return { body: { version: '17.10.0' } };
  if (method === 'GET' && path.startsWith(MEMBERS)) {
    const query = decodeURIComponent(path.slice(MEMBERS.length).split('&')[0] ?? '');
    return {
      body:
        query === 'jhon'
          ? [
              { id: 21, username: 'jtapiap', name: 'Jhon Wilber Tapia Pinto', state: 'active' },
              { id: 22, username: 'jruiz', name: 'Jhon Ruiz', state: 'active' },
            ]
          : [],
    };
  }
  if (method === 'POST' && path.endsWith('/graphql')) {
    const query = (request.body as { query: string }).query;
    if (query.includes('assignableUsers')) {
      return { body: { data: { repository: { assignableUsers: { nodes: [{ login: 'ana-perez', name: 'Ana Pérez' }] } } } } };
    }
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

const userProfiles = () => (JSON.parse(readFileSync(vscode.settingsFile, 'utf8')) as Record<string, unknown>)[PROFILES_KEY];

test.describe('Search users in with hosted repositories', () => {
  test.beforeAll(async () => {
    stub = await startProviderStub([routes]);
    vscode = await launch(createProvidersFixture(), {
      env: {
        REPOHANGAR_HTTP_STUB: stub.url,
        REPOHANGAR_TEST_TOKENS: JSON.stringify({ 'git.acme.com': 'glpat-x1y2', 'github.acme.com': 'ghp_a1b2' }),
      },
      settings: { [PROFILES_KEY]: { default: {} } },
    });
    page = vscode.page;
  });

  test.afterAll(async () => {
    await vscode?.close();
    await stub?.close();
  });

  /** The editor opened from the dashboard with billing-api focused. */
  async function openEditor(): Promise<Frame> {
    const frame = await openDashboard(page);
    await expect(row(frame, 'billing-api').locator('[data-col="review"]')).toHaveText('[Create MR]', { timeout: 30_000 });
    await focusRow(frame, 'billing-api');
    await frame.locator('[data-button="editProfiles"]').click();
    return editorFrame();
  }

  test('Pick a reviewer for a profile: an unsaved chip, written on Save', async () => {
    const editor = await openEditor();
    const searchIn = editor.locator('[data-field="searchRepo"]');
    await expect(searchIn.locator('option:checked')).toHaveText('billing-api (git.acme.com)');

    const reviewers = editor.locator('[aria-label="Add to reviewers"]');
    await reviewers.fill('jhon');
    await expect(editor.locator('[data-users="reviewers"] [role="option"]')).toHaveText(['Jhon Wilber Tapia Pinto @jtapiap', 'Jhon Ruiz @jruiz']);
    await reviewers.press('Enter');

    await expect(editor.locator('[data-chips="reviewers"] .chip-value')).toHaveText(['jtapiap✕']);
    // Unsaved: Save is enabled and the setting is as it was.
    await expect(editor.locator('[data-button="save"]')).toBeEnabled();
    expect(userProfiles()).toEqual({ default: {} });

    await editor.locator('[data-button="save"]').click();

    await expect.poll(userProfiles).toEqual({ default: { reviewers: ['jtapiap'] } });
    await runCommand(page, 'View: Close Editor');
  });

  // github.com takes only a VS Code account, which the test window has none of; admin-portal on the GitHub Enterprise
  // host github.acme.com sends the same GraphQL search with a test token.
  test('Change the repository searched: the GitHub repository answers, git.acme.com gets no request', async () => {
    const editor = await openEditor();
    await editor.locator('[data-field="searchRepo"]').selectOption({ label: 'admin-portal (github.acme.com)' });
    const before = stub.requests.length;

    await editor.locator('[aria-label="Add to assignees"]').fill('ana');

    await expect(editor.locator('[data-users="assignees"] [role="option"]')).toHaveText(['Ana Pérez @ana-perez']);
    const sent = stub.requests.slice(before);
    const searches = sent.filter((r) => r.method === 'POST' && (r.body as { query?: string } | undefined)?.query?.includes('assignableUsers'));
    expect(searches).toHaveLength(1);
    expect(`${searches[0]?.host}${searches[0]?.path}`).toBe('github.acme.com/api/graphql');
    expect((searches[0]?.body as { variables: unknown }).variables).toEqual({ owner: 'acme', name: 'admin-portal', q: 'ana' });
    expect(sent.filter((r) => r.path.startsWith(MEMBERS))).toHaveLength(0);
    await runCommand(page, 'View: Close Editor');
  });
});

test.describe('Search users in without a hosted repository', () => {
  test.beforeAll(async () => {
    stub = await startProviderStub([routes]);
    vscode = await launch(createManyFixture(2), { env: { REPOHANGAR_HTTP_STUB: stub.url } });
    page = vscode.page;
  });

  test.afterAll(async () => {
    await vscode?.close();
    await stub?.close();
  });

  test('R4 shows the note in place of the list, and typing sends no search', async () => {
    await runCommand(page, 'RepoHangar: Edit MR Profiles');
    const editor = await editorFrame();

    await expect(editor.locator('[data-note="searchUsers"]')).toHaveText('Add a GitLab or GitHub repository to search users.');
    await expect(editor.locator('[data-field="searchRepo"]')).toHaveCount(0);
    const reviewers = editor.locator('[aria-label="Add to reviewers"]');
    await reviewers.fill('jhon');
    await reviewers.press('Enter');

    await expect(editor.locator('[data-chips="reviewers"] .chip-value')).toHaveText(['jhon✕']);
    await expect(editor.locator('[data-users="reviewers"]')).toHaveCount(0);
    expect(stub.requests.filter((r) => r.path.includes('/members/all') || (r.body as { query?: string } | undefined)?.query?.includes('assignableUsers'))).toHaveLength(0);
  });
});
