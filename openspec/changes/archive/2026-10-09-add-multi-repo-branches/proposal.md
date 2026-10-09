## Why

Starting a feature that spans four services means creating the same branch four times, and coming back to it means
switching four repositories one by one (PROPOSAL.md §2.1, goal G3; §3.1: 12 steps today, 4 with RepoHangar). Batches
also end with a one-line summary today: a skipped or failed repository has no next step in reach, and a network
failure cannot be retried without running the whole batch again.

Roadmap phase: **3. Batch and profiles UX** (§13), first slice: multi-repo branch switch and create, and the batch
result panel with **Retry failed** and fix buttons. It implements §5.2 (switch and new branch on a selection), §5.3
(remote-only branches become tracking branches), W7, W8 (Git batches), §10.1 (`repohangar.switchBranch`,
`repohangar.createBranch`), §10.2 (`b` and `n` on a selection), §12 (branch name validation) and design principles 2
and 4.

**Depends on: `add-git-graph-and-explorer`** — the fix button **Open SCM** runs its `repohangar.showInSourceControl`.

## What Changes

- **Switch branch in repositories** (W7): `b` with rows selected, the toolbar button `⎇ Switch…` and
  `repohangar.switchBranch` (*RepoHangar: Switch Branch in Repositories…*) open one quick pick of the branches the
  target repositories have, from local refs only, ranked by how many repositories have them, with
  `local in 2 · remote in 1 (tracking branch will be created)` details. A remote-only branch becomes a tracking branch;
  a repository without the branch is skipped. Repositories with uncommitted changes follow one choice:
  **Skip** (default), **Stash and switch** or **Switch anyway**.
- **Create branch in repositories**: `n`, the toolbar button `＋ Branch…` and `repohangar.createBranch` (*RepoHangar:
  Create Branch in Repositories…*) ask for one name, validated with `git check-ref-format --branch`, and create and
  check it out from the current HEAD of each repository. The switch quick pick also offers `＋ Create "<name>"`.
- **Batch result panel** (W8): after Fetch all, Pull all (ff), Switch or Create with any skipped or failed repository,
  a panel above the grid lists every repository with its result and a fix button (**Stash and pull**, **Pull with
  rebase**, **Publish**, **Push**, **Open SCM**, **Show Git Output**, **Stash and switch**, **Create branch here**),
  with **Retry failed** and **Close**. The summary notification gains **Show Details**.
- `b` on a selection now switches the selected repositories instead of only the focused one. **BREAKING** for the key
  only: the focused-row switch stays on `b` without a selection, the Branch cell click and the `⎇` hover button.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `batch-operations`: new requirements for switching and creating a branch across repositories, branch suggestions,
  the result panel, fix buttons and **Retry failed**; `Batch results` gains **Show Details** and the switch and create
  summaries.
- `git-operations`: `Row action keys` — `b` with rows selected belongs to `batch-operations`.

## Impact

- **Code**: `src/git/branchBatch.ts` (eligibility and suggestions, no `vscode` import), `src/jobs/runner.ts` (retry and
  result list), `src/git/fastPaths.ts` (`git stash push`), `src/ui/quickInputs.ts`, webview toolbar buttons and result
  panel; `src/shared/protocol.ts` messages.
- **Public surface**: commands `repohangar.switchBranch`, `repohangar.createBranch`; dashboard key `n`; `b` on a
  selection; toolbar buttons `⎇ Switch…` and `＋ Branch…`. CHANGELOG `Added` and `Changed` entries.
- **Git**: checkout and branch creation through the Git API; `git stash push --include-untracked` as a new local fast
  path, run only after the user picks **Stash and switch** or **Stash and pull**. No network.
- After archiving, the `## Purpose` non-goals of `openspec/specs/batch-operations/spec.md` and
  `openspec/specs/git-operations/spec.md` that say "no capability yet" for these features are edited by hand.
