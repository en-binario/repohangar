## ADDED Requirements

### Requirement: Branch batch targets
The system SHALL switch or create a branch in the selected dashboard rows when at least one is selected, and in every
listed repository otherwise, from the triggers of the matrix.

#### Scenario: Branch batch target matrix

| # | Trigger | Rows selected | Repositories | Toolbar label |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `b` | `billing-api`, `ledger`, `web-shop` | **Switch in the 3 selected** | *N/A* |
| R2 | `b` | None | **The focused row only, as `git-operations` states** | *N/A* |
| R3 | `repohangar.switchBranch`, toolbar Switch | `billing-api`, `ledger`, `web-shop` | **Switch in the 3 selected** | **`⎇ Switch… (3)`** |
| R4 | `repohangar.switchBranch`, toolbar Switch | None, or dashboard closed | **Switch in every listed repository** | **`⎇ Switch…`** |
| R5 | `n` | `billing-api`, `ledger`, `web-shop`, `notifications` | **Create in the 4 selected** | *N/A* |
| R6 | `n` | None | **Create in the focused row** | *N/A* |
| R7 | `repohangar.createBranch`, toolbar Branch | `billing-api`, `ledger` | **Create in the 2 selected** | **`＋ Branch… (2)`** |
| R8 | `repohangar.createBranch`, toolbar Branch | None, or dashboard closed | **Create in every listed repository** | **`＋ Branch…`** |

### Requirement: Branch suggestions
The switch quick pick SHALL be titled `Switch branch in <n> repositories` and SHALL list every branch name that a
target repository has as a local branch or as a branch of its chosen remote, read from local refs only, ordered by the
number of target repositories that have it (descending), then by name, with the detail `local in <a> · remote in <r>`
followed by ` (tracking branch will be created)` when `<r>` is at least 1 and by ` · missing in <m> (those repositories
will be skipped)` when `<m>` is at least 1. When the typed text is a valid branch name that no target repository has, the
first item SHALL be `＋ Create "<text>" from current HEAD in all <n>`.

**Constraints:**
- Suggestions read the local refs (the loose refs and `packed-refs` of the common git dir), since the Git extension no
  longer fills `repository.state.refs`; no fetch and no `git` process runs
- A branch counts as `local` in a repository that has it locally, else as `remote` when `<remote>/<name>` exists
- `<remote>/HEAD` is not listed

#### Scenario: Suggestion matrix

Targets `billing-api`, `notifications`, `web-shop`.

| # | Branch | `billing-api` | `notifications` | `web-shop` | Position | Detail |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `feature/ABC-12-notes` | Local | Local | `origin/feature/ABC-12-notes` | **1** | **`local in 2 · remote in 1 (tracking branch will be created)`** |
| R2 | `main` | Local | Local | Local | **2** | **`local in 3`** |
| R3 | `feature/ABC-12-invoice-pdf` | None | None | `origin/feature/ABC-12-invoice-pdf` | **3** | **`remote in 1 (tracking branch will be created) · missing in 2 (those repositories will be skipped)`** |

#### Scenario: Create from the switch quick pick
- **GIVEN** the switch quick pick targets `billing-api`, `notifications` and `web-shop`
- **WHEN** the user types `feature/ABC-31-refunds`, which none of them has
- **THEN** the first item reads `＋ Create "feature/ABC-31-refunds" from current HEAD in all 3`
- **AND WHEN** the user picks it
- **THEN** the branch is created in the 3 repositories as `Create branch in repositories` states

### Requirement: Uncommitted changes choice
When at least one target repository of a switch is dirty, the system SHALL ask once, after the branch is picked, with
a quick pick titled `<d> of <n> repositories have uncommitted changes` and the items **Skip** (first),
**Stash and switch** and **Switch anyway**, and SHALL apply the choice to every dirty target. `Esc` SHALL cancel the
whole switch with no Git operation. Stashing SHALL run
`git stash push --include-untracked -m "RepoHangar: before switching to <branch>"` in the repository, through
`execFile` with an argument array, a 10 s timeout and `GIT_TERMINAL_PROMPT=0`, and SHALL NOT pop the stash afterwards.

#### Scenario: Dirty choice dismissed
- **GIVEN** a switch to `feature/ABC-12-notes` targets 3 repositories and `billing-api` has 3 changed files
- **WHEN** the user presses `Esc` in the uncommitted changes quick pick
- **THEN** no checkout, branch creation or stash runs in any of the 3 repositories

### Requirement: Switch branch in repositories
The system SHALL switch each target repository to the picked branch in a job of the job pool, applying the rules in row
order, and SHALL record one result per repository. A switch MUST NOT use the network, force a checkout, discard changes,
or delete a branch.

**Constraints:**
- Local branch: `repository.checkout(<branch>)`
- Remote-only branch: `repository.createBranch(<branch>, true, '<remote>/<branch>')`, then
  `repository.setBranchUpstream(<branch>, '<remote>/<branch>')`
- Jobs run with at most `repohangar.concurrency` (default `6`) at a time
- While a switch or create job runs, the Sync cell reads `⟳ switching` or `⟳ creating branch` (`git-operations`
  `Job state in the row`)

#### Scenario: Switch eligibility matrix

| # | Operation in progress | HEAD | `feature/ABC-12-notes` in the repository | Working tree | Dirty choice | Git | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Rebase | *Any* | *Any* | *Any* | *Any* | **None** | **`skipped: rebase in progress`** |
| R2 | Merge, cherry-pick or revert | *Any* | *Any* | *Any* | *Any* | **None** | **`skipped: <operation> in progress`** |
| R3 | None | On `feature/ABC-12-notes` | Local | *Any* | *Any* | **None** | **`ok: already on feature/ABC-12-notes`** |
| R4 | None | *Any* other | None, local or remote | *Any* | *Any* | **None** | **`skipped: no branch feature/ABC-12-notes`** |
| R5 | None | *Any* other | *Any* | Dirty, 3 files | Skip | **None** | **`skipped: dirty (3 files)`** |
| R6 | None | `main` | Local | Clean | *N/A* | **`repository.checkout('feature/ABC-12-notes')`** | **`ok`** |
| R7 | None | Detached | Local | Clean | *N/A* | **`repository.checkout('feature/ABC-12-notes')`** | **`ok`** |
| R8 | None | `main` | Only `origin/feature/ABC-12-notes` | Clean | *N/A* | **`createBranch('feature/ABC-12-notes', true, 'origin/feature/ABC-12-notes')`, upstream set** | **`ok: tracking origin/feature/ABC-12-notes created`** |
| R9 | None | `main` | Local | Dirty, 3 files | Stash and switch | **`git stash push --include-untracked -m "RepoHangar: before switching to feature/ABC-12-notes"`, then checkout** | **`ok: stashed 3 files`** |
| R10 | None | `main` | Local | Dirty, 3 files | Switch anyway | **`repository.checkout('feature/ABC-12-notes')`; changes carried** | **`ok`** |
| R11 | None | `main` | Local | Dirty, a file the checkout would overwrite | Switch anyway | **`repository.checkout('feature/ABC-12-notes')`, which Git refuses; HEAD and working tree unchanged** | **`failed: <first line of Git's message>`** |

### Requirement: Create branch in repositories
The system SHALL ask for the branch name in one input box titled `Create branch in <n> repositories`, SHALL reject a
name that `git check-ref-format --branch <name>` refuses with the input message `"<name>" is not a valid branch name.`
before any repository is touched, and SHALL then create and check out the branch from the current HEAD of each target
repository with `repository.createBranch(<name>, true)` in a job of the job pool, applying the rules in row order.

#### Scenario: Create eligibility matrix

| # | Operation in progress | HEAD | `feature/ABC-31-refunds` exists locally | Working tree | Git | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Rebase, merge, cherry-pick or revert | *Any* | *Any* | *Any* | **None** | **`skipped: <operation> in progress`** |
| R2 | None | *Any* | Yes | *Any* | **None** | **`skipped: branch exists`** |
| R3 | None | `main` at `a1b2c3d` | No | Clean | **`repository.createBranch('feature/ABC-31-refunds', true)`** | **`ok: created from a1b2c3d`** |
| R4 | None | `main` at `a1b2c3d` | No | Dirty, 3 files | **`repository.createBranch('feature/ABC-31-refunds', true)`; changes carried** | **`ok: created from a1b2c3d`** |
| R5 | None | Detached at `9f8e7d6` | No | Clean | **`repository.createBranch('feature/ABC-31-refunds', true)`** | **`ok: created from 9f8e7d6`** |

#### Scenario: Invalid branch name
- **GIVEN** `n` was pressed with 4 rows selected
- **WHEN** the user types `feature/a..b` and presses `Enter`
- **THEN** the input box stays open with the message `"feature/a..b" is not a valid branch name.`
- **AND** no branch is created in any repository

### Requirement: Branch keys
`b` with rows selected and `n` SHALL act as `Branch batch target matrix` states. The footer SHALL show `n branch`
directly before the merge request hints, or before the navigation hints when there are none, and the key help overlay
SHALL list `n` and `b` on a selection.

#### Scenario: n with no row selected
- **GIVEN** no row is selected and the focus is on `ledger`
- **WHEN** the user presses `n`, types `feature/ABC-31-refunds` and presses `Enter`
- **THEN** `repository.createBranch('feature/ABC-31-refunds', true)` runs for `ledger` only

### Requirement: Batch result panel
After a batch of Fetch, Pull (ff), Switch or Create ends with at least one `skipped` or `failed` result, the system SHALL
show a result panel above the grid when the batch was started from the dashboard, and SHALL otherwise offer it through
the **Show Details** button of the summary notification, which opens the dashboard with the panel. The panel SHALL be
titled `<batch> — finished in <seconds> s`, SHALL show the counts line of the summary, then one line per repository
ordered failed, skipped, then ok, each by repository name, with its result and its fix buttons, and the buttons
**Retry failed** (when at least one result is `failed`) and **Close**.

**Constraints:**
- A line reads `<✓|↷|✗> <repository>  <detail>`, where the detail is the text after `ok: `, `skipped: ` or `failed: `, or
  `fetched`, `updated`, `switched to <branch>` or `created` for a plain `ok`

#### Scenario: Pull all result panel
- **GIVEN** Pull all (ff) was started from the dashboard and ended in 6.2 s with `ledger` `ok: fast-forwarded 4 commits`,
  `billing-api` `skipped: dirty (3 files)` and `infra-charts` `failed: fetch failed: Permission denied (publickey)`
- **WHEN** the batch ends
- **THEN** the panel above the grid is titled `Pull all (ff) — finished in 6.2 s`
- **AND** its lines read, in order, `✗ infra-charts  fetch failed: Permission denied (publickey)`,
  `↷ billing-api  dirty (3 files)` and `✓ ledger  fast-forwarded 4 commits`
- **AND** the panel shows `Retry failed` and `Close`

### Requirement: Fix buttons
The result panel SHALL offer, on each repository line, the fix buttons of the matrix, each acting on that repository
only and updating the line with the new result.

#### Scenario: Fix button matrix

| # | Batch | Result | Buttons | Action of the first button |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Pull (ff) | `skipped: dirty (3 files)` | **`Stash and pull`** | **`git stash push --include-untracked -m "RepoHangar: before pulling"`, then the Pull (ff) rules on that repository** |
| R2 | Pull (ff) | `skipped: diverged (↑1 ↓1)` | **`Pull with rebase`, `Open SCM`** | **`git.pullRebase` with the repository** |
| R3 | Pull (ff) | `skipped: no upstream` | **`Publish`** | **`repository.push(<chosen remote>, <branch>, true)`** |
| R4 | Pull (ff), Switch or Create | `skipped: rebase in progress` (any operation) | **`Open SCM`** | **`repohangar.showInSourceControl` with the repository** |
| R5 | Fetch or Pull (ff) | `failed: <message>` | **`Show Git Output`** | **`git.showOutput`** |
| R6 | Switch | `skipped: dirty (3 files)` | **`Stash and switch`** | **The stash, then the switch rules on that repository** |
| R7 | Switch | `skipped: no branch feature/ABC-12-notes` | **`Create branch here`** | **`repository.createBranch('feature/ABC-12-notes', true)`** |
| R8 | *Any* | `ok` or `ok: <detail>` | **None** | *N/A* |

### Requirement: Retry failed
**Retry failed** SHALL run the same batch with the same parameters (branch name, dirty choice) on the repositories
whose result is `failed` only, SHALL replace their lines with the new results, and SHALL leave the `skipped` and `ok`
lines unchanged.

#### Scenario: Retry a failed fetch
- **GIVEN** the result panel of Fetch all shows `infra-charts` `failed: Could not resolve host: git.acme.com` and
  `billing-api` `skipped: no remote`
- **WHEN** the user clicks `Retry failed` and the network is back
- **THEN** `repository.fetch({ prune: true })` runs for `infra-charts` only
- **AND** its line reads `✓ infra-charts  fetched` and the `billing-api` line is unchanged

## MODIFIED Requirements

### Requirement: Batch results
The system SHALL show each `skipped` and `failed` result in the repository's row as `git-operations` describes, and
SHALL show at the end of a batch one notification `<Fetch all|Pull all (ff)|Switch to <branch>|Create branch <branch>> — finished in <seconds> s:
<counts>`, where the counts are `✓ <n> fetched` (Fetch), `✓ <n> updated · = <n> up to date` (Pull), `✓ <n> switched`
(Switch) or `✓ <n> created` (Create), then `↷ <n> skipped` and
`✗ <n> failed`, leaving out every count of 0 except the first. A batch with a failure SHALL show the notification as a
warning with the button `Show Git Output`. A batch with at least one `skipped` or `failed` result that was not started
from the dashboard SHALL add the button `Show Details` (`Batch result panel`).

#### Scenario: Batch summary matrix

| # | Batch | ok | Up to date | Skipped | Failed | Notification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Fetch all, 4.1 s | 14 | *N/A* | 0 | 0 | **Information: `Fetch all — finished in 4.1 s: ✓ 14 fetched`** |
| R2 | Fetch all, 6.0 s | 12 | *N/A* | 1 | 1 | **Warning: `Fetch all — finished in 6.0 s: ✓ 12 fetched · ↷ 1 skipped · ✗ 1 failed` with `Show Git Output` and, from a command, `Show Details`** |
| R3 | Pull all (ff), 6.2 s | 9 updated | 0 | 4 | 1 | **Warning: `Pull all (ff) — finished in 6.2 s: ✓ 9 updated · ↷ 4 skipped · ✗ 1 failed` with `Show Git Output` and, from a command, `Show Details`** |
| R4 | Pull all (ff), 2.0 s | 0 updated | 14 | 0 | 0 | **Information: `Pull all (ff) — finished in 2.0 s: ✓ 0 updated · = 14 up to date`** |
| R5 | Switch to `feature/ABC-12-notes`, 1.2 s | 2 switched | *N/A* | 1 | 0 | **Information: `Switch to feature/ABC-12-notes — finished in 1.2 s: ✓ 2 switched · ↷ 1 skipped`, and from a command `Show Details`** |
| R6 | Create branch `feature/ABC-31-refunds`, 0.4 s | 4 created | *N/A* | 0 | 0 | **Information: `Create branch feature/ABC-31-refunds — finished in 0.4 s: ✓ 4 created`** |
