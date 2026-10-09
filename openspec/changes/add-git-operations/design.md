## Context

`add-repo-dashboard` (archived) built the registry, the store, the read-only dashboard and the status bar. The code this
change extends:

- `src/git/registry.ts` computes `RowData` from `repository.state` and the fast paths, and holds each `Repository`.
- `src/state/store.ts` debounces per repository and emits batches every 100 ms at most; `src/ui/dashboard.ts` posts
  them as `patch` messages and validates every view message in `src/shared/protocol.ts`.
- `src/git/process.ts` is the only way to start `git` (`execFile`, 10 s, `GIT_TERMINAL_PROMPT=0`) and logs each call.
- The webview (`webview/App.tsx`) handles navigation keys; cell text comes from `src/shared/format.ts`.

The Git extension commands this change calls with a repository argument all exist in VS Code 1.141 (`git.checkout`,
`git.sync`, `git.stash`, `git.stashPopLatest`, `git.cleanAll`, `git.showOutput`). They resolve a `Uri` argument to
the repository, as `git.close` already does in the integration tests.

## Goals / Non-Goals

**Goals:**
- Pure decision modules for every table (push and pull guards, fast-forward eligibility, batch targets, summary text,
  active repository), tested with `it.each`, and thin wiring to the Git API.
- One job runner for single-row actions and batches, so the "one job per repository" rule and the row's job state
  have a single source.

**Non-Goals:**
- A cancellable Git API fetch: the API has no cancellation token (see Risks).
- The batch result panel (W8) and **Retry failed**: phase 3.

## Decisions

### D-1. Modules

```
src/git/guards.ts          push, pull and fetch guards → { run } | { skip: reason, notification }   (pure)
src/git/ffEligibility.ts   Pull (ff) rules after the fetch → result and whether to merge              (pure)
src/git/operations.ts      runs an action on one repository through the Git API or a git.* command
src/git/activeRepository.ts resolution order of the active repository (pure core + vscode adapter)
src/jobs/runner.ts         pool, per-repository lock, timeout, cancellation, results                 (vscode-free core)
src/jobs/summary.ts        summary notification text                                                (pure)
src/ui/actions.ts          commands, notifications, progress, clipboard, terminal, scm/sourceControl
webview/RowActions.tsx     hover buttons, ⋯ menu, job badge in the Sync cell, toolbar batch buttons
```

### D-2. Job state travels in the row

`RowData` gains `job?: { action, state: 'running' | 'ok' | 'skipped' | 'failed', detail?: string }`. The runner sets
it through `RowStore.setJob(id, job)`, which emits a patch like any row change. The registry clears a finished job
when the Git part of the row changes (a hash of the Git fields, not the job), so a stale `↷ dirty` disappears once the
repository is cleaned. Alternative rejected: a separate `jobUpdate` message stream, which would need its own ordering
with patches.

### D-3. Protocol

View → host gains `runAction { id, action }` (action: `fetch`, `pull`, `push`, `sync`, `switchBranch`, `terminal`,
`stash`, `stashPop`, `discardAll`, `revealInOS`, `copyPath`, `copyBranch`) and `runBatch { action: 'fetch' |
'pullFf', ids: string[] }`, both validated like the existing messages (known action, ids that are strings, at most
10 000). The host checks again that every id is a listed repository and ignores the others. Push and Publish share
`push`: the guard decides which one runs.

### D-4. Runner

- A counting semaphore of `repohangar.concurrency` slots for network steps; the local merge of Pull (ff) runs outside
  the pool.
- A per-repository lock (one job per repository); a second request returns at once with no Git call.
- Timeout: `Promise.race` between the Git API call and a timer of `repohangar.fetchTimeoutSeconds`. On timeout the
  result is `failed: timed out after <n> s` and the slot is released; the Git extension's fetch keeps running and its
  late completion does not change the result.
- Cancellation: the progress notification's token stops new starts; repositories not started get
  `skipped: canceled`.
- Idempotence: the runner remembers when the last Fetch all finished and on which ids; a new Fetch all on the same set
  within 10 s returns the message instead of running.

### D-5. Pull (ff)

After the fetch, the runner reads the fresh state from the registry (`repository.status()` first, so ahead and behind
reflect the fetched refs), evaluates `ffEligibility`, and runs `git merge --ff-only @{u}` through `runGit`. The commit
count for `fast-forwarded <n> commits` is the `behind` count before the merge. The dirty file count is the size of the
set of paths in `mergeChanges`, `indexChanges`, `workingTreeChanges` and `untrackedChanges`.

`p` on one row stays `repository.pull()` (the user's own pull configuration), while `p` on a selection and every
batch use Pull (ff): a batch must never merge or rebase (D12).

### D-6. Webview

- Hover buttons are an absolutely positioned toolbar over the last cells of the hovered or focused row, so the grid
  columns do not change. They are `button` elements with `aria-label` and `title`, out of the tab order (the keys cover
  them).
- The `⋯` menu is a `role="menu"` popup rendered by the webview: VS Code's `webview/context` menus open only on a right
  click and cannot be opened from a key.
- Toolbar: `⟳ Fetch all` / `⟳ Fetch (n)` and `⇣ Pull all (ff)` / `⇣ Pull (ff) (n)` before the filter box.

### D-7. Active repository

Pure resolution over a port: `argument → editor file → Source Control selection → quick pick`. Explorer folder paths
are matched against listed roots by path segments, case-insensitively on Windows, innermost root first. The recent-use
order is kept in memory per window (no persistence: it is not public surface).

## Risks / Trade-offs

- [A timed-out fetch keeps running in the Git extension, so more than `concurrency` fetches can be in flight] → only
  after a timeout, which is rare; the log records it. A cancellable API would remove it; none exists in `getAPI(1)`.
- [`git.cleanAll`'s confirmation text belongs to VS Code] → the spec states only what RepoHangar controls: the command
  runs with the repository, and a cancel leaves the working tree unchanged.
- [Pull (ff) after a fetch reads state that the Git extension refreshes asynchronously] → D-5 calls
  `repository.status()` before evaluating.
- [Hover buttons can cover cell text on narrow panels] → they appear only on hover or focus, and every action also has
  a key and a `⋯` item.

## Migration Plan

Not applicable: new commands, keys and settings only.

## Open Questions

None.
