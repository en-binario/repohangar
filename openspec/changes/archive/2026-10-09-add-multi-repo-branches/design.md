## Context

`add-git-operations` gave the job runner (`src/jobs/runner.ts`: pool of `repohangar.concurrency`, per-job timeout,
cancel, per-repository `JobResult`), the batch summary (`src/jobs/summary.ts`), the batch targets and the Pull (ff)
eligibility as pure functions (`src/git/ffEligibility.ts`). Branch switching today is per repository through
`git.checkout` (VS Code's picker). See proposal.md for the scope.

## Goals / Non-Goals

**Goals:**
- Reuse the job runner and the summary for two more batch kinds, with no second pool.
- Keep every eligibility rule a pure function over a repository snapshot, so each matrix is an `it.each` table.
- Make each fix button and **Retry failed** a normal job, so the row's job state and the one-job-per-repository rule
  keep working.

**Non-Goals:**
- Pushing a selection: the proposal lists it nowhere in phase 3; it stays without a capability.
- Fetching before suggesting branches: suggestions are local only (W7), so a branch only on the server needs a Fetch all
  first.
- Restoring the stash after a switch: the stash stays, named, for the user to pop.

## Decisions

### D-1. Two new job kinds

`JobAction` gains `switch` and `createBranch`, with a `params` object (`branch`, `dirtyChoice`). The runner already
records `ok`, `ok: <detail>`, `skipped: <reason>`, `failed: <message>`; the Sync cell shows `⟳ switching` and
`⟳ creating branch` while they run (job state labels follow the existing pattern). The batch keeps its parameters in
the result list, so **Retry failed** re-runs `runBatch(kind, failedIds, params)`.

### D-2. Eligibility as pure functions

`src/git/branchBatch.ts` holds `switchPlan(snapshot, branch, dirtyChoice)` and `createPlan(snapshot, name)`, returning
either a skip reason or the list of Git steps (`checkout`, `createBranch` + `setBranchUpstream`, `stash`). The job
executes the steps through `src/git/operations.ts`. `suggestBranches(snapshots)` ranks names for the quick pick.

### D-3. Stash as a local fast path

The Git API v1 has no stash call, and the `git.stash` command asks for a message, which a batch cannot answer.
`fastPaths.stashPush(repo, message)` runs `git stash push --include-untracked -m <message>` through
`src/git/process.ts` (execFile, argument array, 10 s, `GIT_TERMINAL_PROMPT=0`), local only, which fits §5.3. It runs
only after the user picks **Stash and switch** or **Stash and pull**, never as a default (§12, destructive actions are
never a batch default; stashing keeps the changes).

### D-4. Branch name validation

`git check-ref-format --branch <name>` runs once per name (in the first target repository, no network), as §12
requires, before any repository is touched. The input box validates on `Enter`, not on every key, to avoid one process
per keystroke.

### D-5. Quick picks, not an inline panel

W7 draws the switch picker inside the dashboard. A VS Code quick pick gives the same list from the command palette and
from the dashboard with one implementation, keyboard handling and accessibility for free. The dirty-changes choice is a
second quick pick shown only when a target is dirty.

### D-6. Result panel in the webview

The host sends `batchResult { kind, title, counts, lines[], canRetry }` after a batch with a skipped or failed result,
and `batchResultLine` updates when a fix button or **Retry failed** finishes. The view sends `fix { id, fix }`,
`retryFailed`, `closeBatchResult`. The panel sits above the grid and keeps the grid usable; a new batch replaces it.
Fix button ids are a closed enum in the protocol, validated by the host.

`Pull with rebase` uses `git.pullRebase` with the repository (the Git API's `pull()` has no rebase flag); `Publish`
reuses `git-operations`' publish; `Open SCM` runs `repohangar.showInSourceControl`.

## Risks / Trade-offs

- [`b` on a selection changes what an existing key does] → only with rows selected, the old behaviour stays on the
  focused row without a selection, and the CHANGELOG lists it as `Changed`.
- [**Switch anyway** carries changes into another branch] → it is never the default; Git refuses a checkout that would
  overwrite files, recorded as `failed` with Git's message (R11).
- [Switching 30 repositories at once] → the pool limits concurrency; checkouts are local and fast.

## Migration Plan

No settings change. After archiving, edit the `## Purpose` non-goals of `openspec/specs/batch-operations/spec.md` and
`openspec/specs/git-operations/spec.md` that still say "no capability yet" for multi-repository branches and the
result panel (task 5.3).
