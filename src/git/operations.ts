// Runs the Git actions of one repository through the built-in Git extension: the Git API for Fetch, Pull and Push,
// its `git.*` commands with the repository for the others, and the local `git merge --ff-only` of Pull (ff)
// (git-operations: Row actions, batch-operations: Fast-forward eligibility).

import * as vscode from 'vscode';
import { gitErrorMessage } from './errors';
import { distinctPaths, ffDecision, ffMergeResult, type FetchOutcome } from './ffEligibility';
import type { Repository } from './git';
import { fetchGuard, pullGuard, pushGuard, type GuardNotice } from './guards';
import { runGit } from './process';
import { IGNORED, UNTRACKED, type Registry } from './registry';
import { CanceledError, type Job } from '../jobs/runner';
import type { BatchAction, JobResult, RowData } from '../shared/model';

/** The `git.*` commands a row action runs with the repository as argument. */
export type GitCommand = 'git.checkout' | 'git.sync' | 'git.stash' | 'git.stashPopLatest' | 'git.cleanAll';

export interface CommandPort {
  executeCommand(command: string, ...args: unknown[]): Thenable<unknown>;
}

const gone: JobResult = { state: 'failed', detail: 'the repository is no longer open' };

export class GitOperations {
  /** How commands run; the integration tests replace it to record calls without opening VS Code's pickers. */
  commands: CommandPort = { executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args) };

  constructor(
    private readonly registry: Registry,
    private readonly gitPath: () => string,
  ) {}

  private target(id: string): { repository: Repository; row: Promise<RowData | undefined> } | undefined {
    const repository = this.registry.repository(id);
    // The guards read the state now rather than the debounced row.
    return repository && { repository, row: this.registry.compute(id) };
  }

  fetch(id: string): Job {
    return async (ctx) => {
      const target = this.target(id);
      const row = await target?.row;
      if (!target || !row) return gone;
      const decision = fetchGuard(row);
      if ('result' in decision) return decision.result;
      await ctx.network(() => target.repository.fetch({ prune: true }), { timeout: true });
      return { state: 'ok' };
    };
  }

  pull(id: string, onNotice?: (notice: GuardNotice) => void): Job {
    return async (ctx) => {
      const target = this.target(id);
      const row = await target?.row;
      if (!target || !row) return gone;
      const decision = pullGuard(row);
      if ('result' in decision) {
        onNotice?.(decision.notice);
        return decision.result;
      }
      await ctx.network(() => target.repository.pull());
      return { state: 'ok' };
    };
  }

  push(id: string, onNotice?: (notice: GuardNotice) => void): Job {
    return async (ctx) => {
      const target = this.target(id);
      const row = await target?.row;
      if (!target || !row) return gone;
      const decision = pushGuard(row);
      if ('result' in decision) {
        if (decision.notice) onNotice?.(decision.notice);
        return decision.result;
      }
      if (decision.run === 'publish') {
        await ctx.network(() => target.repository.push(decision.remote, decision.branch, true), { action: 'publish' });
      } else {
        await ctx.network(() => target.repository.push());
      }
      return { state: 'ok' };
    };
  }

  sync(id: string): Job {
    return async (ctx) => {
      const repository = this.registry.repository(id);
      if (!repository) return gone;
      await ctx.network(() => Promise.resolve(this.commands.executeCommand('git.sync', repository.rootUri)));
      return { state: 'ok' };
    };
  }

  /** Fetch, then `git merge --ff-only @{u}` when the repository is eligible (design D-5). */
  pullFf(id: string): Job {
    return async (ctx) => {
      const target = this.target(id);
      const before = await target?.row;
      if (!target || !before) return gone;
      const { repository } = target;
      let fetch: FetchOutcome;
      const guard = fetchGuard(before);
      if ('result' in guard) {
        fetch = { state: 'skipped', detail: guard.result.detail ?? 'no remote' };
      } else {
        try {
          await ctx.network(() => repository.fetch({ prune: true }), { timeout: true });
          fetch = { state: 'ok' };
        } catch (error) {
          if (error instanceof CanceledError) throw error;
          fetch = { state: 'failed', detail: gitErrorMessage(error) };
        }
      }
      // Ahead and behind must reflect the fetched refs.
      await repository.status().catch(() => undefined);
      const row = await this.registry.compute(id);
      if (!row) return gone;
      const decision = ffDecision(fetch, { operation: row.operation, head: row.head, dirtyFiles: dirtyFiles(repository) });
      if (!decision.merge) return decision.result;
      try {
        await runGit(this.gitPath(), ['merge', '--ff-only', '@{u}'], repository.rootUri.fsPath);
      } catch (error) {
        const stderr = (error as { stderr?: unknown }).stderr;
        return ffMergeResult(decision.commits, typeof stderr === 'string' && stderr.trim() ? stderr : gitErrorMessage(error));
      } finally {
        void repository.status().catch(() => undefined);
      }
      return ffMergeResult(decision.commits);
    };
  }

  /** The job of a batch action. */
  batchJob(action: BatchAction, id: string): Job {
    return action === 'fetch' ? this.fetch(id) : this.pullFf(id);
  }

  /** Runs a `git.*` command with the repository as argument. */
  async runCommand(id: string, command: GitCommand): Promise<void> {
    const repository = this.registry.repository(id);
    if (repository) await this.commands.executeCommand(command, repository.rootUri);
  }
}

/** Distinct paths with conflicts, staged, unstaged or untracked changes. */
function dirtyFiles(repository: Repository): number {
  const { mergeChanges, indexChanges, workingTreeChanges, untrackedChanges } = repository.state;
  const paths = (changes: readonly { uri: vscode.Uri; status: number }[]) => changes.map((c) => c.uri.fsPath);
  return distinctPaths(
    paths(mergeChanges),
    paths(indexChanges),
    paths(workingTreeChanges.filter((c) => c.status !== IGNORED)),
    paths(untrackedChanges.filter((c) => c.status === UNTRACKED)),
  );
}
