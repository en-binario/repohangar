// Runs the Git actions of one repository through the built-in Git extension: the Git API for Fetch, Pull, Push,
// checkout and branch creation, its `git.*` commands with the repository for the others, and the local
// `git merge --ff-only` of Pull (ff) and `git stash push` of a switch or a fix button (git-operations: Row actions,
// batch-operations: Fast-forward eligibility, Switch branch in repositories, Create branch in repositories).

import * as vscode from 'vscode';
import { createPlan, PULL_STASH_MESSAGE, switchPlan, type BranchPlan, type BranchSnapshot, type BranchStep } from './branchBatch';
import { gitErrorMessage } from './errors';
import { readBranchRefs, stashPush, validBranchName } from './fastPaths';
import { distinctPaths, ffDecision, ffMergeResult, type FetchOutcome } from './ffEligibility';
import { nodeFileSystem } from './fsPort';
import type { Repository } from './git';
import { fetchGuard, pullGuard, pushGuard, type GuardNotice } from './guards';
import { runGit } from './process';
import { IGNORED, UNTRACKED, type Registry } from './registry';
import { CanceledError, type Job, type JobContext } from '../jobs/runner';
import type { BatchAction, BatchParams, DirtyChoice, JobResult, RowData } from '../shared/model';

/** The `git.*` commands a row action runs with the repository as argument. */
export type GitCommand = 'git.checkout' | 'git.sync' | 'git.stash' | 'git.stashPopLatest' | 'git.cleanAll' | 'git.pullRebase';

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

  /** The job of a Git batch action, with the batch's parameters for Switch and Create (merge requests: `MrService`). */
  batchJob(action: Exclude<BatchAction, 'createMr'>, id: string, params: BatchParams = {}): Job {
    switch (action) {
      case 'fetch':
        return this.fetch(id);
      case 'pullFf':
        return this.pullFf(id);
      case 'switch':
        return this.switchBranch(id, params.branch ?? '', params.dirtyChoice ?? 'skip');
      case 'createBranch':
        return this.createBranch(id, params.branch ?? '');
    }
  }

  /** What the branch rules read of a repository: its row, its changes and its branches from the local refs. */
  async branchSnapshot(id: string): Promise<BranchSnapshot | undefined> {
    const repository = this.registry.repository(id);
    const [row, dirs] = await Promise.all([this.registry.compute(id), this.registry.gitDirs(id)]);
    if (!repository || !row) return undefined;
    const remote = row.remote?.name ?? null;
    const refs = dirs ? await readBranchRefs(dirs.commonDir, remote, nodeFileSystem) : { local: [], remote: [] };
    return {
      operation: row.operation,
      head: row.head,
      ...(row.headSha ? { headCommit: row.headSha } : {}),
      dirtyFiles: dirtyFiles(repository),
      local: refs.local,
      remote,
      remoteBranches: refs.remote,
    };
  }

  /** Switch to a branch (batch-operations: Switch eligibility matrix). */
  switchBranch(id: string, branch: string, dirtyChoice: DirtyChoice): Job {
    return this.branchJob(id, (snapshot) => switchPlan(snapshot, branch, dirtyChoice));
  }

  /** Create and check out a branch from the current HEAD (batch-operations: Create eligibility matrix). */
  createBranch(id: string, branch: string): Job {
    return this.branchJob(id, (snapshot) => createPlan(snapshot, branch));
  }

  private branchJob(id: string, plan: (snapshot: BranchSnapshot) => BranchPlan): Job {
    return async (ctx) => {
      const repository = this.registry.repository(id);
      const snapshot = await this.branchSnapshot(id);
      if (!repository || !snapshot) return gone;
      const decision = plan(snapshot);
      if ('result' in decision) return decision.result;
      await this.runSteps(ctx, repository, decision.steps);
      return decision.done;
    };
  }

  /** Runs the steps in a pool slot, which also shows the job in the row; nothing is forced or discarded. */
  private async runSteps(ctx: JobContext, repository: Repository, steps: readonly BranchStep[]): Promise<void> {
    try {
      await ctx.network(async () => {
        for (const step of steps) {
          switch (step.kind) {
            case 'stash':
              await stashPush(this.gitPath(), repository.rootUri.fsPath, step.message);
              break;
            case 'checkout':
              await repository.checkout(step.branch);
              break;
            case 'track':
              await repository.createBranch(step.branch, true, step.upstream);
              await repository.setBranchUpstream(step.branch, step.upstream);
              break;
            case 'create':
              await repository.createBranch(step.branch, true);
              break;
          }
        }
      });
    } finally {
      void repository.status().catch(() => undefined);
    }
  }

  /** The fix button Stash and pull: the stash, then the Pull (ff) rules on the repository (Fix button matrix R1). */
  stashAndPullFf(id: string): Job {
    return async (ctx) => {
      const repository = this.registry.repository(id);
      if (!repository) return gone;
      await ctx.network(() => stashPush(this.gitPath(), repository.rootUri.fsPath, PULL_STASH_MESSAGE));
      await repository.status().catch(() => undefined);
      return this.pullFf(id)(ctx);
    };
  }

  /** The fix button Pull with rebase: `git.pullRebase` with the repository (Fix button matrix R2). */
  pullRebase(id: string): Job {
    return async (ctx) => {
      const repository = this.registry.repository(id);
      if (!repository) return gone;
      await ctx.network(() => Promise.resolve(this.commands.executeCommand('git.pullRebase', repository.rootUri)), { action: 'pull' });
      return { state: 'ok', detail: 'pulled with rebase' };
    };
  }

  /** Whether `git check-ref-format --branch` accepts a name, run in the repository (design D-4). */
  async validBranchName(id: string, name: string): Promise<boolean> {
    const repository = this.registry.repository(id);
    return repository ? validBranchName(this.gitPath(), repository.rootUri.fsPath, name) : false;
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
