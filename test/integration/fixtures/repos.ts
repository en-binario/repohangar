// Builds real Git repositories in a temp folder, each with a bare "remote", for the integration and UI tests.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Luis Gómez',
  GIT_AUTHOR_EMAIL: 'luis@acme.test',
  GIT_COMMITTER_NAME: 'Luis Gómez',
  GIT_COMMITTER_EMAIL: 'luis@acme.test',
  GIT_TERMINAL_PROMPT: '0',
  GIT_CONFIG_NOSYSTEM: '1',
};

export function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', ['-c', 'init.defaultBranch=main', '-c', 'protocol.file.allow=always', ...args], {
    cwd,
    env: ENV,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} in ${cwd} failed:\n${result.stderr}`);
  return result.stdout;
}

function write(path: string, content: string): void {
  writeFileSync(path, content);
}

export interface Fixture {
  root: string;
  /** The single workspace folder */
  workspace: string;
  remotes: string;
  /** The .code-workspace file to open */
  workspaceFile: string;
  /** Absolute path of a repository in the workspace, by its path below the workspace folder */
  repo(relative: string): string;
}

export function createRoot(prefix = 'repohangar-'): { root: string; workspace: string; remotes: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  const workspace = join(root, 'acme');
  const remotes = join(root, 'remotes');
  mkdirSync(workspace, { recursive: true });
  mkdirSync(remotes, { recursive: true });
  return { root, workspace, remotes };
}

/** A bare remote with one commit on main, and a clone of it at `path`. */
export function cloned(remotes: string, path: string, name: string): string {
  const bare = join(remotes, `${name}.git`);
  git(remotes, 'init', '--bare', bare);
  const seed = join(remotes, `${name}-seed`);
  git(remotes, 'init', seed);
  write(join(seed, 'README.md'), `# ${name}\n`);
  git(seed, 'add', '.');
  git(seed, 'commit', '-m', 'Initial import');
  git(seed, 'remote', 'add', 'origin', bare);
  git(seed, 'push', '-u', 'origin', 'main');
  mkdirSync(join(path, '..'), { recursive: true });
  git(join(path, '..'), 'clone', bare, path);
  return seed;
}

/** Adds a commit in `seed` and pushes it, so clones fall behind. */
export function pushFromSeed(seed: string, file: string, message: string): void {
  write(join(seed, file), `${message}\n`);
  git(seed, 'add', '.');
  git(seed, 'commit', '-m', message);
  git(seed, 'push', 'origin', 'main');
}

export function commit(repo: string, file: string, message: string): void {
  write(join(repo, file), `${message}\n`);
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', message);
}

export function writeWorkspaceFile(root: string, workspace: string, settings: Record<string, unknown>): string {
  const file = join(root, 'fixture.code-workspace');
  writeFileSync(
    file,
    JSON.stringify(
      {
        folders: [{ path: workspace }],
        settings: {
          'git.repositoryScanMaxDepth': 3,
          'git.autofetch': false,
          'git.openRepositoryInParentFolders': 'never',
          'git.detectSubmodules': true,
          'git.confirmSync': false,
          ...settings,
        },
      },
      null,
      2,
    ),
  );
  return file;
}

/**
 * The main fixture: 14 repositories in the workspace folder `acme`, in the groups backend, frontend, infra, tools
 * and platform, covering every row state the dashboard shows.
 */
export function createMainFixture(settings: Record<string, unknown> = {}): Fixture {
  const { root, workspace, remotes } = createRoot();
  const at = (relative: string) => join(workspace, relative);

  // backend/billing-api: feature branch with upstream, 2 commits ahead, unstaged and staged changes, remote with credentials.
  cloned(remotes, at('backend/billing-api'), 'billing-api');
  const billing = at('backend/billing-api');
  git(billing, 'checkout', '-b', 'feature/ABC-12-notes');
  git(billing, 'push', '-u', 'origin', 'feature/ABC-12-notes');
  commit(billing, 'notes.md', 'Add notes field');
  commit(billing, 'pdf.md', 'Expose notes in PDF');
  write(join(billing, 'README.md'), 'changed\n');
  write(join(billing, 'notes.md'), 'changed\n');
  write(join(billing, 'staged.md'), 'staged\n');
  git(billing, 'add', 'staged.md');
  git(billing, 'remote', 'set-url', 'origin', `https://ci-bot:glpat-x1y2z3@git.acme.test/payments/billing-api.git`);
  git(billing, 'remote', 'add', 'local', join(remotes, 'billing-api.git'));

  // backend/ledger: 2 commits behind, fetched.
  const ledgerSeed = cloned(remotes, at('backend/ledger'), 'ledger');
  pushFromSeed(ledgerSeed, 'a.md', 'Ledger change A');
  pushFromSeed(ledgerSeed, 'b.md', 'Ledger change B');
  git(at('backend/ledger'), 'fetch');

  // backend/notifications: diverged 1 and 1.
  const notifSeed = cloned(remotes, at('backend/notifications'), 'notifications');
  pushFromSeed(notifSeed, 'remote.md', 'Remote change');
  commit(at('backend/notifications'), 'local.md', 'Local change');
  git(at('backend/notifications'), 'fetch');

  // backend/auth-service: branch without upstream, untracked file.
  cloned(remotes, at('backend/auth-service'), 'auth-service');
  git(at('backend/auth-service'), 'checkout', '-b', 'fix/login-timeout');
  write(join(at('backend/auth-service'), 'todo.txt'), 'untracked\n');
  write(join(at('backend/auth-service'), 'todo2.txt'), 'untracked\n');

  // backend/stashed: clean with 2 stashes.
  cloned(remotes, at('backend/stashed'), 'stashed');
  for (const n of [1, 2]) {
    write(join(at('backend/stashed'), 'README.md'), `stash ${n}\n`);
    git(at('backend/stashed'), 'stash', 'push', '-m', `wip ${n}`);
  }

  // frontend/web-shop: 1 commit ahead, GitHub-style remote.
  cloned(remotes, at('frontend/web-shop'), 'web-shop');
  commit(at('frontend/web-shop'), 'shop.md', 'Add credit note link to invoice page');
  git(at('frontend/web-shop'), 'remote', 'set-url', '--push', 'origin', 'git@github.com:acme/web-shop.git');

  // infra/detached: detached HEAD.
  cloned(remotes, at('infra/detached'), 'detached');
  git(at('infra/detached'), 'checkout', '--detach', 'HEAD');

  // infra/rebasing: rebase stopped on a conflict.
  const rebasingSeed = cloned(remotes, at('infra/rebasing'), 'rebasing');
  pushFromSeed(rebasingSeed, 'README.md', 'Remote readme');
  const rebasing = at('infra/rebasing');
  commit(rebasing, 'README.md', 'Local readme');
  git(rebasing, 'fetch');
  spawnSync('git', ['rebase', 'origin/main'], { cwd: rebasing, env: ENV });

  // infra/merging: merge stopped on a conflict.
  const mergingSeed = cloned(remotes, at('infra/merging'), 'merging');
  pushFromSeed(mergingSeed, 'README.md', 'Remote readme');
  const merging = at('infra/merging');
  commit(merging, 'README.md', 'Local readme');
  git(merging, 'fetch');
  spawnSync('git', ['merge', 'origin/main'], { cwd: merging, env: ENV });

  // tools/scratch: no remote.
  mkdirSync(at('tools/scratch'), { recursive: true });
  git(at('tools/scratch'), 'init');
  commit(at('tools/scratch'), 'a.txt', 'Initial import');

  // tools/new-service: no commits yet, with a remote.
  mkdirSync(at('tools/new-service'), { recursive: true });
  git(at('tools/new-service'), 'init');
  git(at('tools/new-service'), 'remote', 'add', 'origin', 'git@github.com:acme/new-service.git');

  // platform with the submodule vendor/shared-proto.
  cloned(remotes, join(remotes, 'shared-proto-src'), 'shared-proto');
  cloned(remotes, at('platform/core'), 'core');
  git(at('platform/core'), 'submodule', 'add', join(remotes, 'shared-proto.git'), 'vendor/shared-proto');
  git(at('platform/core'), 'commit', '-m', 'Add shared-proto');

  // A worktree of stashed, which shares its 2 stashes.
  git(at('backend/stashed'), 'worktree', 'add', '-b', 'hotfix/x', at('backend/stashed-hotfix'), 'main');

  // tools/live: clean and level, for the live update tests.
  cloned(remotes, at('tools/live'), 'live');

  // tools/ignored: a repository listed in git.ignoredRepositories.
  mkdirSync(at('tools/ignored'), { recursive: true });
  git(at('tools/ignored'), 'init');

  const workspaceFile = writeWorkspaceFile(root, workspace, {
    'git.ignoredRepositories': [at('tools/ignored')],
    ...settings,
  });
  return { root, workspace, remotes, workspaceFile, repo: at };
}

/** `count` clean clones of one remote under `services/`, for the startup and performance tests. */
export function createManyFixture(count: number, settings: Record<string, unknown> = {}): Fixture {
  const { root, workspace, remotes } = createRoot('repohangar-many-');
  const at = (relative: string) => join(workspace, relative);
  cloned(remotes, join(remotes, 'template-src'), 'template');
  for (let i = 1; i <= count; i++) {
    git(workspace, 'clone', '--quiet', join(remotes, 'template.git'), at(`services/svc-${String(i).padStart(2, '0')}`));
  }
  const workspaceFile = writeWorkspaceFile(root, workspace, settings);
  return { root, workspace, remotes, workspaceFile, repo: at };
}
