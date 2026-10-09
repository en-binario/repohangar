// Global setup of the nightly GitLab compatibility job (PROPOSAL.md §14, hosting-providers task 5.1): a GitLab CE
// 17.10.0 container, an API token for root, and a seeded project with a branch and a merge request. With
// REPOHANGAR_GITLAB_URL and REPOHANGAR_GITLAB_TOKEN set, an existing instance is used instead and nothing is started.

import { execFileSync, spawnSync } from 'node:child_process';
import type { TestProject } from 'vitest/node';

export const IMAGE = 'gitlab/gitlab-ce:17.10.0-ce.0';
const CONTAINER = 'repohangar-gitlab-ce';
const PORT = 8929;
const TOKEN = 'glpat-repohangar-nightly-0001';
const BOOT_TIMEOUT_MS = 15 * 60_000;

export interface NightlyGitLab {
  url: string;
  token: string;
  projectPath: string;
  branch: string;
  branchWithoutMr: string;
  iid: number;
}

declare module 'vitest' {
  export interface ProvidedContext {
    gitlab: NightlyGitLab;
  }
}

function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function api<T>(url: string, token: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${url}/api/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

async function waitForGitLab(url: string): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      // 401 without a token means the API is up (hosting-providers: Probe matrix R3).
      const response = await fetch(`${url}/api/v4/version`);
      if (response.status === 401 || response.status === 200) return;
    } catch {
      // Still booting.
    }
    if (Date.now() - started > BOOT_TIMEOUT_MS) throw new Error(`GitLab did not start within ${BOOT_TIMEOUT_MS / 60_000} min`);
    await new Promise((r) => setTimeout(r, 5_000));
  }
}

/** Creates the root API token with a known value through the Rails runner (no UI step). */
function createToken(): void {
  const script = [
    "user = User.find_by_username('root')",
    "user.personal_access_tokens.where(name: 'repohangar-nightly').destroy_all",
    "token = user.personal_access_tokens.create!(scopes: ['api'], name: 'repohangar-nightly', expires_at: 30.days.from_now)",
    `token.set_token('${TOKEN}')`,
    'token.save!',
  ].join('; ');
  docker('exec', CONTAINER, 'gitlab-rails', 'runner', script);
}

async function seed(url: string, token: string): Promise<Omit<NightlyGitLab, 'url' | 'token'>> {
  const groups = await api<{ id: number; full_path: string }[]>(url, token, 'GET', '/groups?search=payments');
  const group = groups.find((g) => g.full_path === 'payments') ?? (await api<{ id: number }>(url, token, 'POST', '/groups', { name: 'payments', path: 'payments' }));
  const projectPath = 'payments/billing-api';
  const encoded = encodeURIComponent(projectPath);
  let project = await api<{ id: number }>(url, token, 'GET', `/projects/${encoded}`).catch(() => undefined);
  project ??= await api<{ id: number }>(url, token, 'POST', '/projects', {
    name: 'billing-api',
    path: 'billing-api',
    namespace_id: group.id,
    initialize_with_readme: true,
    default_branch: 'main',
  });
  const branch = 'feature/ABC-12-notes';
  const branchWithoutMr = 'feature/ABC-13-no-mr';
  for (const name of [branch, branchWithoutMr]) {
    await api(url, token, 'POST', `/projects/${project.id}/repository/branches?branch=${encodeURIComponent(name)}&ref=main`).catch(() => undefined);
  }
  await api(url, token, 'POST', `/projects/${project.id}/repository/commits`, {
    branch,
    commit_message: 'Add notes field to invoice',
    actions: [{ action: 'create', file_path: `notes-${Date.now()}.md`, content: 'notes\n' }],
  });
  const open = await api<{ iid: number }[]>(url, token, 'GET', `/projects/${project.id}/merge_requests?state=opened&source_branch=${encodeURIComponent(branch)}`);
  const mr =
    open[0] ??
    (await api<{ iid: number }>(url, token, 'POST', `/projects/${project.id}/merge_requests`, {
      source_branch: branch,
      target_branch: 'main',
      title: 'feat: ABC-12 Add billing notes',
    }));
  return { projectPath, branch, branchWithoutMr, iid: mr.iid };
}

export default async function setup(project: TestProject): Promise<() => void> {
  let url = process.env.REPOHANGAR_GITLAB_URL;
  let token = process.env.REPOHANGAR_GITLAB_TOKEN;
  let started = false;
  if (!url || !token) {
    url = `http://localhost:${PORT}`;
    token = TOKEN;
    const running = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER], { encoding: 'utf8' }).stdout.trim();
    if (running !== 'true') {
      spawnSync('docker', ['rm', '-f', CONTAINER]);
      docker(
        'run',
        '-d',
        '--name',
        CONTAINER,
        '--shm-size',
        '256m',
        '-p',
        `${PORT}:${PORT}`,
        '-e',
        `GITLAB_OMNIBUS_CONFIG=external_url 'http://localhost:${PORT}'; prometheus_monitoring['enable'] = false; gitlab_rails['usage_ping_enabled'] = false; puma['worker_processes'] = 0`,
        IMAGE,
      );
      started = true;
    }
    console.log(`Waiting for ${IMAGE} at ${url} …`);
    await waitForGitLab(url);
    createToken();
  }
  const seeded = await seed(url, token);
  project.provide('gitlab', { url, token, ...seeded });
  return () => {
    if (started && !process.env.REPOHANGAR_KEEP_GITLAB) spawnSync('docker', ['rm', '-f', CONTAINER]);
  };
}
