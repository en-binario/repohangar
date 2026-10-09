// The repository registry: one row per repository of the Git extension's API (repo-registry), with live updates
// from `state.onDidChange` and watchers on FETCH_HEAD and the stash reflog (design D-8).

import { basename } from 'node:path';
import * as vscode from 'vscode';
import type { API, Repository } from './git';
import { readLastFetch, readOperation, readRemoteHead, readStashCount } from './fastPaths';
import { nodeFileSystem } from './fsPort';
import { resolveGitDirs, type GitDirs } from './gitDirs';
import { assignGroup } from './groups';
import { runGit } from './process';
import { chooseRemote } from './remoteChoice';
import { parseRemoteUrl } from './remoteUrl';
import { detectProvider } from '../providers/detect';
import type { Head, Provider, RowData, RowDetails } from '../shared/model';
import type { RowStore } from '../state/store';
import type { ViewState } from '../ui/viewState';

// Status values of the Git API (git.d.ts `Status`), which is a const enum and cannot be imported.
export const UNTRACKED = 7;
export const IGNORED = 8;

/** Files in the repository's own git dir whose change means HEAD or an operation changed. */
const GIT_DIR_FILES = 'HEAD,logs/HEAD,MERGE_HEAD,CHERRY_PICK_HEAD,REVERT_HEAD,rebase-merge/**,rebase-apply/**,FETCH_HEAD';
/** Files in the common git dir: refs (branches, remotes, stash) and the last fetch. Never the index (D-8). */
const COMMON_DIR_FILES = 'refs/**,packed-refs,FETCH_HEAD,logs/refs/stash';
const STATUS_DEBOUNCE_MS = 150;

interface Entry {
  repository: Repository;
  dirs: Promise<GitDirs | undefined>;
  disposables: vscode.Disposable[];
}

/**
 * `repohangar.hosts` with the entries of every scope: user, then workspace, then workspace folder, the narrower scope
 * winning per host. VS Code returns only the narrowest scope's object, which would hide a host chosen at user scope
 * (hosting-providers: Host choice for an unknown host) in a workspace that sets its own hosts.
 */
export function hostsSetting(): Record<string, unknown> {
  const inspected = vscode.workspace.getConfiguration('repohangar').inspect<Record<string, unknown>>('hosts');
  return { ...(inspected?.globalValue ?? {}), ...(inspected?.workspaceValue ?? {}), ...(inspected?.workspaceFolderValue ?? {}) };
}

export class Registry implements vscode.Disposable {
  private readonly entries = new Map<string, Entry>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly apiDisposables: vscode.Disposable[] = [];
  private readonly detailsCache = new Map<string, { head: string; details: RowDetails }>();
  private readonly countEmitter = new vscode.EventEmitter<void>();
  /** Fires when a repository is added or removed. */
  readonly onDidChangeRepositories = this.countEmitter.event;
  private api: API | undefined;
  /** The provider the unknown-host probe found for a host (hosting-providers: Unknown host probe) */
  probed: ((host: string) => Provider | undefined) | undefined;

  constructor(
    private readonly store: RowStore,
    private readonly viewState: ViewState,
  ) {
    this.disposables.push(
      this.countEmitter,
      viewState.onDidChangeGrouping(() => this.recomputeAll()),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.recomputeAll()),
      vscode.window.onDidChangeWindowState((state) => {
        if (state.focused) this.flushPendingStatus();
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          e.affectsConfiguration('repohangar.hosts') ||
          e.affectsConfiguration('repohangar.groups') ||
          e.affectsConfiguration('github-enterprise.uri')
        ) {
          this.recomputeAll();
        }
      }),
    );
  }

  /** Starts following the Git API's repositories. Call again with undefined when Git is disabled. */
  attach(api: API | undefined): void {
    if (api === this.api) return;
    for (const d of this.apiDisposables.splice(0)) d.dispose();
    for (const id of [...this.entries.keys()]) this.removeById(id);
    this.api = api;
    if (!api) return;
    this.apiDisposables.push(
      api.onDidOpenRepository((r) => this.add(r)),
      api.onDidCloseRepository((r) => this.removeById(r.rootUri.toString())),
    );
    for (const repository of api.repositories) this.add(repository);
  }

  get size(): number {
    return this.entries.size;
  }

  ids(): string[] {
    return [...this.entries.keys()];
  }

  repository(id: string): Repository | undefined {
    return this.entries.get(id)?.repository;
  }

  /** `repository.status()` for every repository, then a recompute of every row. */
  async refreshAll(): Promise<void> {
    await Promise.all(
      [...this.entries.entries()].map(async ([id, entry]) => {
        try {
          await entry.repository.status();
        } catch {
          // The row keeps its last state; the Git extension reports the error in its output channel.
        }
        await this.store.recompute(id);
      }),
    );
  }

  recomputeAll(): void {
    for (const id of this.entries.keys()) void this.store.recompute(id);
  }

  /** The last commit of a repository, cached by HEAD commit (design D-9). */
  async loadDetails(id: string): Promise<RowDetails | undefined> {
    const repository = this.repository(id);
    if (!repository) return undefined;
    const head = repository.state.HEAD?.commit;
    if (!head) return { commit: null };
    const cached = this.detailsCache.get(id);
    if (cached?.head === head) return cached.details;
    try {
      const commit = await repository.getCommit(head);
      const details: RowDetails = {
        commit: {
          hash: commit.hash,
          subject: commit.message.split('\n')[0] ?? '',
          author: commit.authorName ?? '',
          date: (commit.authorDate ?? commit.commitDate ?? new Date()).getTime(),
        },
      };
      this.detailsCache.set(id, { head, details });
      return details;
    } catch {
      return { commit: null };
    }
  }

  /** Computes the row of a repository from the Git API state and the local fast paths. */
  async compute(id: string): Promise<RowData | undefined> {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    const { repository } = entry;
    const state = repository.state;
    const HEAD = state.HEAD;
    const head: Head = HEAD?.name
      ? {
          kind: 'branch',
          name: HEAD.name,
          ...(HEAD.upstream ? { upstream: `${HEAD.upstream.remote}/${HEAD.upstream.name}` } : {}),
          ...(HEAD.ahead === undefined ? {} : { ahead: HEAD.ahead }),
          ...(HEAD.behind === undefined ? {} : { behind: HEAD.behind }),
        }
      : { kind: 'detached', commit: HEAD?.commit ?? '' };

    const chosen = chooseRemote(state.remotes, HEAD?.upstream?.remote);
    const parsed = chosen ? parseRemoteUrl(chosen.url) : undefined;
    const config = vscode.workspace.getConfiguration();
    const detected = detectProvider(
      parsed?.hosted ? parsed.host : undefined,
      hostsSetting(),
      config.get<string>('github-enterprise.uri'),
    );
    const provider = detected === 'unknown' && parsed?.hosted ? (this.probed?.(parsed.host) ?? detected) : detected;

    const changes = state.workingTreeChanges;
    const counts = {
      conflicts: state.mergeChanges.length,
      staged: state.indexChanges.length,
      unstaged: changes.filter((c) => c.status !== UNTRACKED && c.status !== IGNORED).length,
      untracked:
        changes.filter((c) => c.status === UNTRACKED).length +
        state.untrackedChanges.filter((c) => c.status === UNTRACKED).length,
    };

    const dirs = await entry.dirs;
    const [operation, lastFetch, stashes, defaultBranch] = dirs
      ? await Promise.all([
          readOperation(dirs.gitDir, nodeFileSystem),
          readLastFetch(dirs.gitDir, dirs.commonDir, nodeFileSystem),
          readStashCount(dirs.commonDir, nodeFileSystem),
          chosen ? readRemoteHead(dirs.commonDir, chosen.name, nodeFileSystem) : Promise.resolve(null),
        ])
      : [null, null, 0, null];

    const path = repository.rootUri.fsPath;
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => ({ name: f.name, path: f.uri.fsPath }));
    return {
      id,
      name: basename(path),
      path,
      group: assignGroup(
        this.viewState.grouping,
        path,
        folders,
        config.get<Record<string, unknown>>('repohangar.groups', {}),
        process.platform,
      ),
      provider,
      remote: chosen && parsed ? { name: chosen.name, displayUrl: parsed.displayUrl } : null,
      head,
      operation,
      counts,
      stashes,
      lastFetch,
      ...(HEAD?.commit ? { headSha: HEAD.commit } : {}),
      ...(parsed?.hosted ? { hosted: { host: parsed.host, projectPath: parsed.projectPath, webUrl: parsed.webUrl } } : {}),
      defaultBranch,
    };
  }

  private add(repository: Repository): void {
    const id = repository.rootUri.toString();
    if (this.entries.has(id)) return;
    const root = repository.rootUri.fsPath;
    const gitPath = this.api?.git.path ?? 'git';
    const dirs = resolveGitDirs(root, nodeFileSystem, (cwd) =>
      runGit(gitPath, ['rev-parse', '--absolute-git-dir', '--git-common-dir'], cwd),
    );
    const entry: Entry = {
      repository,
      dirs,
      disposables: [repository.state.onDidChange(() => this.store.schedule(id))],
    };
    this.entries.set(id, entry);
    void dirs.then((resolved) => {
      if (!resolved || this.entries.get(id) !== entry) return;
      const patterns =
        resolved.gitDir === resolved.commonDir
          ? [[resolved.gitDir, `{${GIT_DIR_FILES},${COMMON_DIR_FILES}}`]]
          : [
              [resolved.gitDir, `{${GIT_DIR_FILES}}`],
              [resolved.commonDir, `{${COMMON_DIR_FILES}}`],
            ];
      for (const [folder, glob] of patterns as [string, string][]) {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(folder), glob));
        const onChange = (uri: vscode.Uri) => this.onGitDirChange(id, uri);
        entry.disposables.push(watcher, watcher.onDidChange(onChange), watcher.onDidCreate(onChange), watcher.onDidDelete(onChange));
      }
    });
    void this.store.recompute(id);
    this.countEmitter.fire();
  }

  /** Overrides the window focus state (integration tests); undefined uses `window.state.focused`. */
  focusOverride: boolean | undefined;

  private get focused(): boolean {
    return this.focusOverride ?? vscode.window.state.focused;
  }

  /**
   * A file in the git dir changed. The row re-reads its fast paths; for HEAD, refs and operation markers RepoHangar
   * also asks the Git extension for the status, which it would otherwise do only when focused and at most every 5 s.
   */
  private onGitDirChange(id: string, uri: vscode.Uri): void {
    this.store.schedule(id);
    const path = uri.path;
    if (path.endsWith('/FETCH_HEAD') || path.endsWith('/logs/refs/stash')) return;
    if (!this.focused) {
      this.pendingStatus.add(id);
      return;
    }
    this.scheduleStatus(id);
  }

  private scheduleStatus(id: string): void {
    const previous = this.statusTimers.get(id);
    if (previous) clearTimeout(previous);
    this.statusTimers.set(
      id,
      setTimeout(() => {
        this.statusTimers.delete(id);
        this.statusCalls++;
        void this.entries.get(id)?.repository.status().catch(() => undefined);
      }, STATUS_DEBOUNCE_MS),
    );
  }

  /** Called when the window gains focus: one status call per repository whose git dir changed meanwhile. */
  flushPendingStatus(): void {
    for (const id of this.pendingStatus) this.scheduleStatus(id);
    this.pendingStatus.clear();
  }

  /** Number of `repository.status()` calls made by the git dir trigger (integration tests). */
  statusCalls = 0;
  private readonly pendingStatus = new Set<string>();
  private readonly statusTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private removeById(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    const timer = this.statusTimers.get(id);
    if (timer) clearTimeout(timer);
    this.statusTimers.delete(id);
    this.pendingStatus.delete(id);
    for (const d of entry.disposables) d.dispose();
    this.entries.delete(id);
    this.detailsCache.delete(id);
    this.store.remove(id);
    this.countEmitter.fire();
  }

  dispose(): void {
    for (const id of [...this.entries.keys()]) this.removeById(id);
    for (const d of [...this.apiDisposables, ...this.disposables]) d.dispose();
  }
}
