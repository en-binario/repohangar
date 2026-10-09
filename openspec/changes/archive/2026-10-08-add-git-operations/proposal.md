## Why

The dashboard shows which repositories are behind, dirty or unpublished, but every fix still takes a trip to the Source
Control view, one repository at a time (PROPOSAL.md §2.1, goals G2 and G3). Phase 1 of the roadmap (§13) closes that
gap: one key or click per repository action, and **Fetch all** and **Pull all (ff)** for every repository at once,
skipping the ones that cannot be fast-forwarded instead of forcing them.

Roadmap phase: **1. Dashboard MVP** (§13), second slice: the row actions and the batch operations. The third slice,
`add-git-graph-and-explorer`, builds on this one.

## What Changes

- **Row actions** on one repository (§5.2, §8.3, W2, W12): Fetch, Pull, Push or Publish, Switch Branch (VS Code's own
  branch picker), Open Terminal, Stash Changes, Pop Latest Stash, Discard All Changes… (VS Code's own confirmation),
  Reveal in File Explorer, Copy Path and Copy Branch Name. They run from the keys `f` `p` `P` `b` `t` `.`, the hover
  buttons at the right edge of a row, the row's `⋯` menu, and clicks on the Branch, Sync and Fetched cells.
- **Network operations through the Git API** (D3): `repository.fetch({ prune: true })`, `repository.pull()` and
  `repository.push()`, so VS Code's credential prompts and the Git output channel keep working. Push and Pull refuse
  the cases Git would reject or that need a decision (behind the upstream, detached HEAD, operation in progress), with
  a notification that says why.
- **Per-repository job state** in the row: `⟳ fetching` while an action runs, and the skip reason or failure afterwards
  (`↷ dirty (3 files)`, `✗ fetch failed`), with a notification for single-row actions.
- **Batch operations** (§5.3, §11.1, D12): **Fetch all** (`repohangar.fetchAll`, `F`, toolbar `⟳ Fetch all`) and
  **Pull all (ff)** (`repohangar.pullAllFf`, toolbar `⇣ Pull all (ff)`) on every repository or on the selected rows,
  `f` and `p` on a selection, and `repohangar.pullFf` for one repository. A job pool of `repohangar.concurrency`
  (default `6`), a per-repository fetch timeout `repohangar.fetchTimeoutSeconds` (default `60`), cancellation from the
  progress notification, and a summary notification `Pull all (ff) — finished in 6.2 s: ✓ 9 updated · ↷ 4 skipped ·
  ✗ 1 failed`.
- **Fast-forward only**: Pull (ff) fetches through the API, then runs the local `git merge --ff-only @{u}` only when no
  operation is in progress, HEAD is on a clean branch with an upstream, and the branch is behind and not ahead. Every
  other repository is skipped with its reason; nothing is ever forced, stashed or rebased.
- **Commands for the active repository** (§10.1): `repohangar.fetch` and `repohangar.pullFf` resolve the repository
  from an Explorer folder, a Source Control repository, the active editor, the Source Control selection, or a quick
  pick sorted by recent use. **Fetch** appears in the Source Control Repositories context menu (`scm/sourceControl`).
- The dashboard footer and key help list the new keys.

Not in this change: Open in Git Graph, Reveal in Explorer, Show in Source Control and the Changes and name cell clicks
(`add-git-graph-and-explorer`); switching or creating a branch across repositories, the batch result panel with
**Retry failed** and per-row fix buttons (phase 3); pushing a selection; the compare page and every merge request
action (phase 2).

## Capabilities

### New Capabilities

- `git-operations`: actions on one repository: what each key, click, hover button and `⋯` menu item runs, the guards
  for Push and Pull, the job state shown in the row, single-row notifications, and the active repository resolution
  for commands.
- `batch-operations`: Fetch and Pull (ff) on all or the selected repositories: which repositories a trigger covers,
  the job pool, timeouts and cancellation, the fast-forward eligibility rules and skip reasons, idempotence, and the
  summary notification.

### Modified Capabilities

- `dashboard`: `Keyboard navigation` — the footer and the "keys that do nothing" rule now account for the action keys
  that other capabilities assign.

## Impact

- **Code**: `src/git/operations.ts` (Git API calls and guards), `src/jobs/runner.ts` (pool, timeout, cancellation,
  results), `src/git/ffEligibility.ts` (pure), `src/git/activeRepository.ts`, new webview parts (hover buttons, `⋯`
  menu, job badges, toolbar buttons), `package.json` contributions (commands, `scm/sourceControl` menu, settings).
- **Settings** (Appendix A): `repohangar.concurrency` (`6`), `repohangar.fetchTimeoutSeconds` (`60`).
- **Public surface**: the commands `repohangar.fetch`, `repohangar.fetchAll`, `repohangar.pullFf`,
  `repohangar.pullAllFf`, the dashboard keys `f` `F` `p` `P` `b` `t` `.`, two settings and one menu item; CHANGELOG
  `Added` entries.
- **Depends on**: none; `add-repo-dashboard` is archived. `add-git-graph-and-explorer` depends on this change.
