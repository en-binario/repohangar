# batch-operations Specification

## Purpose

Fetch and fast-forward many repositories in one step: which repositories a batch covers, how many run at once, how a
batch is canceled or times out, which repositories Pull (ff) skips and why, and the summary of the results. A batch
never forces, stashes, merges or rebases.

**Non-goals:**
- Actions on one repository, their guards and the job state shown in a row, owned by `git-operations`.
- Switching or creating a branch across repositories, the batch result panel with **Retry failed**, and fix buttons
  such as **Stash and pull**: no capability yet (roadmap phase 3).
- Merge requests for several repositories, owned by `mr-creation`.

## Requirements

### Requirement: Batch targets
The system SHALL run Fetch or Pull (ff) on the selected dashboard rows when at least one is selected, and on every
listed repository otherwise, and SHALL label the toolbar buttons after their target.

#### Scenario: Batch target matrix

| # | Trigger | Rows selected in the dashboard | Repositories | Toolbar label |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `repohangar.fetchAll`, `F`, toolbar Fetch | None, or dashboard closed | **Every listed repository** | **`⟳ Fetch all`** |
| R2 | `repohangar.fetchAll`, `F`, toolbar Fetch | `billing-api`, `ledger`, `web-shop` | **The 3 selected** | **`⟳ Fetch (3)`** |
| R3 | `f` | `billing-api`, `ledger`, `web-shop` | **The 3 selected** | *N/A* |
| R4 | `repohangar.pullAllFf`, toolbar Pull | None, or dashboard closed | **Every listed repository** | **`⇣ Pull all (ff)`** |
| R5 | `repohangar.pullAllFf`, toolbar Pull | `billing-api`, `ledger`, `web-shop` | **The 3 selected** | **`⇣ Pull (ff) (3)`** |
| R6 | `p` | `billing-api`, `ledger`, `web-shop` | **Pull (ff) on the 3 selected** | *N/A* |
| R7 | `repohangar.pullFf` | *Any* | **The active repository (`git-operations`)** | *N/A* |

### Requirement: Job pool
The system SHALL run the repositories of a batch with at most `repohangar.concurrency` (default `6`) Git network
operations at a time, SHALL show a progress notification `<Fetch all|Pull all (ff)>: <done>/<total>` with a `Cancel`
button, and SHALL record for each repository one result: `ok`, `ok: <detail>`, `skipped: <reason>` or
`failed: <message>`.

**Constraints:**
- `repohangar.concurrency`: integer from `1` to `32`, default `6`
- `repohangar.fetchTimeoutSeconds`: integer from `5` to `600`, default `60`, per repository

#### Scenario: Concurrency limit
- **GIVEN** 14 repositories with remotes and `repohangar.concurrency` at `6`
- **WHEN** the user runs Fetch all
- **THEN** at no moment more than 6 `repository.fetch` calls are unfinished
- **AND** each of the 14 repositories gets a result

#### Scenario: Fetch timeout
- **GIVEN** `repohangar.fetchTimeoutSeconds` is `5` and the remote of `ledger` does not answer
- **WHEN** the user runs Fetch all
- **THEN** `ledger` gets `failed: timed out after 5 s` 5 s after its fetch started
- **AND** the other repositories get their own results

#### Scenario: Cancel a batch
- **GIVEN** Fetch all runs on 14 repositories, 6 at a time, and 6 have finished
- **WHEN** the user clicks `Cancel` in the progress notification
- **THEN** the 6 running fetches finish and record their results
- **AND** the 2 repositories not started get `skipped: canceled` and no fetch

### Requirement: Fetch in a batch
The system SHALL fetch each repository of a batch with `repository.fetch({ prune: true })`, record `skipped: no remote`
for a repository without remote, and SHALL start no fetch when the same set of repositories finished a Fetch all less
than 10 seconds ago, showing `These repositories were fetched <n> s ago.` instead.

#### Scenario: Fetch all twice in a row
- **GIVEN** Fetch all on all 14 repositories finished 6 s ago
- **WHEN** the user runs Fetch all again on the same 14 repositories
- **THEN** no `repository.fetch` call starts and the notification reads `These repositories were fetched 6 s ago.`

### Requirement: Fast-forward eligibility
Pull (ff) SHALL fetch each repository first and then, on the state after the fetch, run the local
`git merge --ff-only @{u}` only when the fetch did not fail, no operation is in progress, HEAD is on a branch, the
working tree is clean, the branch has an upstream, is behind it and is not ahead of it, applying the rules in row
order. Every other repository SHALL keep HEAD, branches and working tree unchanged and record its reason.

**Constraints:**
- The dirty file count is the number of distinct paths with conflicts, unstaged, staged or untracked changes
- `git merge --ff-only @{u}` runs through `execFile` with an argument array, in the repository root, with a 10 s
  timeout and `GIT_TERMINAL_PROMPT=0`; it uses no network

#### Scenario: Pull (ff) eligibility matrix

| # | Fetch | Operation in progress | HEAD | Working tree | Upstream | Ahead | Behind | Result | Git after the fetch |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Failed: `Permission denied (publickey)` | *Any* | *Any* | *Any* | *Any* | *Any* | *Any* | **`failed: fetch failed: Permission denied (publickey)`** | **No merge** |
| R2 | ok | Rebase | *Any* | *Any* | *Any* | *Any* | *Any* | **`skipped: rebase in progress`** | **No merge** |
| R3 | ok | Merge | *Any* | *Any* | *Any* | *Any* | *Any* | **`skipped: merge in progress`** | **No merge** |
| R4 | ok | Cherry-pick | *Any* | *Any* | *Any* | *Any* | *Any* | **`skipped: cherry-pick in progress`** | **No merge** |
| R5 | ok | Revert | *Any* | *Any* | *Any* | *Any* | *Any* | **`skipped: revert in progress`** | **No merge** |
| R6 | ok | None | Detached | *Any* | *Any* | *Any* | *Any* | **`skipped: detached HEAD`** | **No merge** |
| R7 | ok | None | Branch | Dirty, 3 files | *Any* | *Any* | *Any* | **`skipped: dirty (3 files)`** | **No merge** |
| R8 | ok or `skipped: no remote` | None | Branch | Clean | None | *N/A* | *N/A* | **`skipped: no upstream`** | **No merge** |
| R9 | ok | None | Branch | Clean | Yes | 2 | 3 | **`skipped: diverged (↑2 ↓3)`** | **No merge** |
| R10 | ok | None | Branch | Clean | Yes | *Any* | 0 | **`ok: up to date`** | **No merge** |
| R11 | ok | None | Branch | Clean | Yes | 0 | 4 | **`ok: fast-forwarded 4 commits`** | **`git merge --ff-only @{u}`** |
| R12 | ok | None | Branch | Clean | Yes | 0 | 4, merge exits non-zero | **`failed: <first line of git's error output>`** | **`git merge --ff-only @{u}`, HEAD unchanged** |

### Requirement: Batch results
The system SHALL show each `skipped` and `failed` result in the repository's row as `git-operations` describes, and
SHALL show at the end of a batch one notification `<Fetch all|Pull all (ff)> — finished in <seconds> s: <counts>`,
where the counts are `✓ <n> fetched` (Fetch) or `✓ <n> updated · = <n> up to date` (Pull), then `↷ <n> skipped` and
`✗ <n> failed`, leaving out every count of 0 except the first. A batch with a failure SHALL show the notification as a
warning with the button `Show Git Output`.

#### Scenario: Batch summary matrix

| # | Batch | ok | Up to date | Skipped | Failed | Notification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Fetch all, 4.1 s | 14 | *N/A* | 0 | 0 | **Information: `Fetch all — finished in 4.1 s: ✓ 14 fetched`** |
| R2 | Fetch all, 6.0 s | 12 | *N/A* | 1 | 1 | **Warning: `Fetch all — finished in 6.0 s: ✓ 12 fetched · ↷ 1 skipped · ✗ 1 failed` with `Show Git Output`** |
| R3 | Pull all (ff), 6.2 s | 9 updated | 0 | 4 | 1 | **Warning: `Pull all (ff) — finished in 6.2 s: ✓ 9 updated · ↷ 4 skipped · ✗ 1 failed` with `Show Git Output`** |
| R4 | Pull all (ff), 2.0 s | 0 updated | 14 | 0 | 0 | **Information: `Pull all (ff) — finished in 2.0 s: ✓ 0 updated · = 14 up to date`** |

### Requirement: Pull (ff) command for one repository
The system SHALL provide `repohangar.pullFf` (*RepoHangar: Pull (Fast-Forward Only)*) that runs Pull (ff) with the
eligibility rules on the active repository and shows a skip or failure as `git-operations` shows single-row results.

#### Scenario: Pull (ff) on a dirty repository
- **GIVEN** the active editor's file is in `billing-api`, which has 3 changed files
- **WHEN** the user runs `repohangar.pullFf`
- **THEN** `billing-api` is fetched, no merge runs, and the notification reads `Pull (ff) skipped in billing-api: dirty (3 files).`
