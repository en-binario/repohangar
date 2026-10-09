// Nightly GitLab compatibility for merge request creation without an API token (mr-creation: Push options, Push option
// matrix, Reviewers after connecting): `git push` with every option against GitLab CE 17.10.0, the `remote:` line read
// back, and the merge request it created checked through the API.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { GitLabProvider } from '../../src/providers/gitlab';
import { Http } from '../../src/providers/http';
import type { UserStores } from '../../src/providers/provider';
import { pushArguments, reportedMergeRequest } from '../../src/mr/pushOptions';

const gitlab = inject('gitlab');
const http = new Http();
const host = new URL(gitlab.url).hostname;
const provider = new GitLabProvider(http, host, gitlab.url);
const credential = { token: gitlab.token, apiHost: new URL(gitlab.url).host };
const encoded = encodeURIComponent(gitlab.projectPath);

function stores(): UserStores {
  const ids = new Map<string, number>();
  return {
    userId: (_h, name) => ids.get(name),
    setUserId: (_h, name, id) => void ids.set(name, id),
    singleReviewer: () => false,
    setSingleReviewer: () => undefined,
  };
}

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${gitlab.url}/api/v4${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${gitlab.token}`, 'Content-Type': 'application/json' },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status}`);
  return (await response.json()) as T;
}

/** Runs git in `cwd` with no prompt and no credential helper; the output is never printed (it may hold the URL). */
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'credential.helper=', '-c', 'user.name=Ana Pérez', '-c', 'user.email=ana@acme.test', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}

/** `git push` as the extension runs it; GitLab prints its `remote:` lines on stderr. */
function push(cwd: string, args: string[]): string {
  const result = spawnSync('git', ['-c', 'credential.helper=', ...args], { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (result.status !== 0) throw new Error(`git push exited with ${result.status}`);
  return `${result.stdout}${result.stderr}`;
}

describe('GitLab CE 17.10.0 push options', () => {
  let work: string;
  const branch = `feature/ABC-21-push-options-${Date.now()}`;

  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), 'repohangar-nightly-push-'));
    const url = new URL(`${gitlab.url}/${gitlab.projectPath}.git`);
    url.username = 'root';
    url.password = gitlab.token;
    git(work, 'clone', '-q', url.toString(), 'billing-api');
    work = join(work, 'billing-api');
    git(work, 'checkout', '-q', '-b', branch);
    for (const n of [1, 2]) {
      writeFileSync(join(work, `push-options-${n}.md`), `${n}\n`);
      git(work, 'add', '.');
      git(work, 'commit', '-q', '-m', `Push options change ${n}`);
    }
  });

  afterAll(() => {
    rmSync(join(work, '..'), { recursive: true, force: true });
  });

  let iid = 0;

  it('creates the merge request during the push with every option of the matrix and reports it on a remote: line', async () => {
    const { args, descriptionLeftOut } = pushArguments('origin', branch, {
      target: 'main',
      title: 'feat: ABC-21 Push options',
      description: 'Ticket ABC-21',
      draft: true,
      labels: ['needs-review', 'payments'],
      assignees: ['root', 'luis.gomez'],
      squash: true,
      deleteSourceBranch: true,
    });
    expect(descriptionLeftOut).toBe(false);
    const output = push(work, args);
    const reported = reportedMergeRequest(output);
    expect(reported?.url).toMatch(new RegExp(`/${gitlab.projectPath}/-/merge_requests/\\d+$`));
    iid = reported?.iid ?? 0;

    const mr = await api<{
      title: string;
      draft: boolean;
      target_branch: string;
      description: string;
      labels: string[];
      assignees: { username: string }[];
      squash: boolean;
      force_remove_source_branch: boolean;
    }>(`/projects/${encoded}/merge_requests/${iid}`);
    expect(mr).toMatchObject({
      title: 'Draft: feat: ABC-21 Push options',
      draft: true,
      target_branch: 'main',
      description: 'Ticket ABC-21',
      squash: true,
      force_remove_source_branch: true,
    });
    expect([...mr.labels].sort()).toEqual(['needs-review', 'payments']);
    expect(mr.assignees.map((a) => a.username)).toEqual(['root']);
  });

  it('reads the merge request back through the API, as the review state after Connect does', async () => {
    const answer = await provider.reviewStates([{ key: 'pushed', projectPath: gitlab.projectPath, branch }], credential, {});
    const result = answer.results.get('pushed');
    expect(result?.kind).toBe('review');
    expect(result?.kind === 'review' ? result.review.number : 0).toBe(iid);
  });

  it('adds the reviewers after connecting with one PUT', async () => {
    const result = await provider.updateReviewers(gitlab.projectPath, iid, ['root'], [], credential, stores());
    expect(result).toEqual({ notices: [], reviewers: ['root'] });
    const mr = await api<{ reviewers: { username: string }[] }>(`/projects/${encoded}/merge_requests/${iid}`);
    expect(mr.reviewers.map((r) => r.username)).toEqual(['root']);
  });

  it('pushes nothing new and reports no merge request for a branch already pushed', () => {
    const { args } = pushArguments('origin', branch, {
      target: 'main',
      title: 'feat: ABC-21 Push options',
      description: '',
      draft: false,
      labels: [],
      assignees: [],
      squash: false,
      deleteSourceBranch: false,
    });
    const output = push(work, args);
    expect(output).toContain('Everything up-to-date');
    expect(reportedMergeRequest(output)).toBeUndefined();
  });
});
