// mr-creation :: Selection result matrix (R1–R10): the single-repository flow with the batch flag, against stubbed
// provider and Git ports, as the repository's job result and its result panel line.

import { describe, expect, it } from 'vitest';
import { CreateFlow, type CreateFlowPort } from '../../src/mr/create';
import { batchEntry, entryDetail, type LinkState } from '../../src/mr/multi';
import { mergeScopes } from '../../src/mr/profiles';
import { readRules } from '../../src/mr/rules';
import type { CreateInput, HostingProvider, ReviewItem } from '../../src/providers/provider';
import { resultLine, type FixId } from '../../src/shared/batchResult';
import type { JobResult, RowData } from '../../src/shared/model';
import { counts, row } from './rows';

const BRANCH = 'feature/ABC-12-notes';

function gitlabRow(name: string, overrides: Partial<RowData> = {}): RowData {
  return row({
    id: name,
    name,
    provider: 'gitlab',
    hosted: { host: 'git.acme.com', projectPath: `payments/${name}`, webUrl: `https://git.acme.com/payments/${name}` },
    head: { kind: 'branch', name: BRANCH },
    defaultBranch: 'main',
    ...overrides,
  });
}

function githubRow(name: string, overrides: Partial<RowData> = {}): RowData {
  return row({
    id: name,
    name,
    provider: 'github',
    remote: { name: 'origin', displayUrl: `https://github.com/acme/${name}.git` },
    hosted: { host: 'github.com', projectPath: `acme/${name}`, webUrl: `https://github.com/acme/${name}` },
    head: { kind: 'branch', name: BRANCH },
    defaultBranch: 'main',
    ...overrides,
  });
}

interface Case {
  row: RowData;
  /** Subjects of the commits ahead of main */
  commits?: string[];
  /** An open review of the branch */
  existing?: { number: number; description: string };
  /** The number the create request answers */
  number?: number;
  credentials?: string[];
  pushError?: string;
  pushOutput?: string;
  link?: LinkState;
}

/** The fake provider of a host: the review check, the project, and the create request. */
function provider(kind: 'gitlab' | 'github', c: Case): HostingProvider {
  const url = (projectPath: string, n: number) =>
    kind === 'gitlab' ? `https://git.acme.com/${projectPath}/-/merge_requests/${n}` : `https://github.com/${projectPath}/pull/${n}`;
  const fake: Partial<HostingProvider> = {
    kind,
    async reviewStates(items: readonly ReviewItem[]) {
      const item = items[0] as ReviewItem;
      const results = new Map();
      results.set(
        item.key,
        c.existing
          ? {
              kind: 'review',
              review: {
                provider: kind,
                number: c.existing.number,
                url: url(item.projectPath, c.existing.number),
                title: 't',
                draft: false,
                pipeline: null,
                mergeStatus: null,
                autoMerge: false,
                headSha: '',
                description: c.existing.description,
              },
            }
          : { kind: 'none' },
      );
      return { results, requests: 1 };
    },
    async projectInfo() {
      return { defaultBranch: 'main' };
    },
    async createReview(input: CreateInput) {
      const n = c.number ?? 142;
      return { kind: 'created', number: n, url: url(input.projectPath, n), applied: { reviewers: [], assignees: [], labels: [] }, notices: [] };
    },
  };
  return fake as HostingProvider;
}

async function run(c: Case) {
  const credentials = c.credentials ?? ['git.acme.com', 'github.com'];
  const port: CreateFlowPort = {
    row: (id) => (id === c.row.id ? c.row : undefined),
    root: () => '/nowhere',
    settings: () => ({ profiles: mergeScopes({}, undefined), rules: readRules([]), usePushOptions: 'whenNoToken' }),
    credential: async (host) => (credentials.includes(host) ? { token: 't', apiHost: host } : undefined),
    provider: (kind) => provider(kind, c),
    projectInfo: async () => ({ defaultBranch: 'main' }),
    me: async () => 'ana.perez',
    stores: { userId: () => undefined, setUserId: () => undefined, singleReviewer: () => false, setSingleReviewer: () => undefined },
    files: { readFile: async () => undefined, list: async () => [] },
    git: {
      remoteBranches: async () => ['main'],
      commitsAhead: async () => c.commits ?? ['Add notes field to invoice', 'Expose notes in PDF'],
      push: async () => {
        if (c.pushError) throw Object.assign(new Error('Failed to execute git'), { stderr: c.pushError });
      },
      pushWithOptions: async () => c.pushOutput ?? '',
    },
  };
  const outcome = await new CreateFlow(port).create(c.row.id, { batch: true });
  const r = c.row;
  const entry = batchEntry(outcome, {
    name: r.name,
    provider: r.provider === 'github' ? 'github' : 'gitlab',
    host: r.hosted?.host ?? '',
    projectPath: r.hosted?.projectPath ?? '',
  });
  const detail = entryDetail(entry, c.link ?? { kind: 'none' });
  const line = resultLine('createMr', undefined, r.id, r.name, entry.result, { ...(detail === undefined ? {} : { detail }), review: !!entry.review });
  return { result: entry.result, text: line.text, fixes: line.fixes };
}

const added: LinkState = { kind: 'added' };

// mr-creation :: Selection result matrix
const cases: [string, Case, JobResult, string, FixId[]][] = [
  ['R1 publishes 2 commits and creates', { row: gitlabRow('billing-api'), link: added },
    { state: 'ok', detail: 'created !142, pushed 2' }, '✓ billing-api  !142  git.acme.com/payments/billing-api  (pushed 2)', ['openReview']],
  ['R2 finds the open review', { row: gitlabRow('notifications'), existing: { number: 88, description: 'Closes ABC-12' }, link: added },
    { state: 'ok', detail: 'already existed' }, '✓ notifications  !88  already existed — description updated with related links', ['openReview']],
  ['R3 pushes 3 commits on GitHub and creates', {
      row: githubRow('web-shop', { head: { kind: 'branch', name: BRANCH, upstream: `origin/${BRANCH}`, ahead: 3, behind: 0 } }),
      commits: ['a', 'b', 'c'], number: 311, link: added },
    { state: 'ok', detail: 'created #311, pushed 3' }, '✓ web-shop  #311  github.com/acme/web-shop  (pushed 3)', ['openReview']],
  ['R4 skips a repository on the target', { row: gitlabRow('ledger', { head: { kind: 'branch', name: 'main', upstream: 'origin/main', ahead: 0, behind: 0 } }) },
    { state: 'skipped', detail: 'on main' }, '↷ ledger  on main', []],
  ['R5 skips a branch with nothing to merge', { row: gitlabRow('ledger'), commits: [] },
    { state: 'skipped', detail: 'nothing to merge into main' }, '↷ ledger  nothing to merge into main', []],
  ['R6 skips a rebase in progress', { row: gitlabRow('admin-portal', { operation: { kind: 'rebase', step: 1, total: 3 } }) },
    { state: 'skipped', detail: 'rebase in progress' }, '↷ admin-portal  rebase in progress', ['openScm']],
  ['R7 skips a GitHub host without a credential', { row: githubRow('web-shop'), credentials: ['git.acme.com'] },
    { state: 'skipped', detail: 'not signed in to github.com' }, '↷ web-shop  not signed in to github.com', ['signIn']],
  ['R8 fails when the push fails', {
      row: gitlabRow('infra-charts'),
      pushError: 'git@git.acme.com: Permission denied (publickey).\nfatal: Could not read from remote repository.' },
    { state: 'failed', detail: 'push failed: Permission denied (publickey)' }, '✗ infra-charts  push failed: Permission denied (publickey)', ['showGitOutput']],
  ['R9 creates through push options without a token, with no related links', {
      row: gitlabRow('auth-service'), commits: ['Fix login timeout'], credentials: ['github.com'],
      pushOutput: 'remote: View merge request for fix:\nremote:   https://git.acme.com/payments/auth-service/-/merge_requests/143\n' },
    { state: 'ok', detail: 'created !143, pushed 1, no related links' },
    '✓ auth-service  !143  git.acme.com/payments/auth-service  (pushed 1, no related links: not signed in)', ['openReview']],
  ['R10 creates without the uncommitted files', {
      row: gitlabRow('ledger', { head: { kind: 'branch', name: BRANCH, upstream: `origin/${BRANCH}`, ahead: 0, behind: 0 }, counts: counts(0, 3, 0, 0) }),
      commits: ['Add ledger notes'], number: 144, link: added },
    { state: 'ok', detail: 'created !144' }, '✓ ledger  !144  git.acme.com/payments/ledger  (3 uncommitted files not included)', ['openReview']],
];

describe('merge requests on a selection', () => {
  it.each(cases)('%s', async (_name, c, result, text, fixes) => {
    expect(await run(c)).toEqual({ result, text, fixes });
  });
});
