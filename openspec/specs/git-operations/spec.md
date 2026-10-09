# git-operations Specification

## Purpose

Actions on one repository from its dashboard row and from commands: fetch, pull, push or publish, switch branch, open a
terminal, stash, pop, discard, reveal in the OS file manager and copy, run through the built-in Git extension, with
their guards, the job state shown in the row and the repository a command acts on.

**Non-goals:**
- Fetch and Pull (ff) on several repositories, `f` and `p` on a selection, and the fast-forward rules, owned by
  `batch-operations`.
- Open in Git Graph, Reveal in Explorer, Show in Source Control, and clicks on the Repository name and the Changes
  cell, owned by `explorer-open-in-git-graph`, `explorer-reveal` and `source-control-reveal`.
- Switching or creating a branch across repositories, `b` on a selection and `n`, owned by `batch-operations`.
- Pushing a selection: no capability yet.
- The compare page and merge request actions, owned by `hosting-providers` and `mr-creation`.

## Requirements

### Requirement: Row actions
The system SHALL run each row action on its repository as listed in the matrix below, through the built-in Git
extension's API or its commands with the repository as argument, and SHALL NOT start a `git` process of its own for
these actions.

**Constraints:**
- Network actions (Fetch, Pull, Push, Publish) run only through the Git API, so VS Code's credential prompts and the
  **Git** output channel apply
- **Reveal in File Explorer** is labeled **Reveal in Finder** on macOS and **Open Containing Folder** on Linux

#### Scenario: Row action matrix

| # | Action | Triggers | Runs | Network |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Fetch | `f`, a click on the Fetched cell, the `⟳` hover button | **`repository.fetch({ prune: true })`** | **Yes** |
| R2 | Pull | `p`, the `⇣` hover button, a click on a Sync cell reading `↓n` | **`repository.pull()`, which follows the user's `pull.rebase`** | **Yes** |
| R3 | Push | `P`, the `⇡` hover button, a click on a Sync cell reading `↑n` | **`repository.push()` to the upstream** | **Yes** |
| R4 | Publish | `P`, the `⇡` hover button, a click on a Sync cell reading `⇡ publish` | **`repository.push(<chosen remote>, <branch>, true)`** | **Yes** |
| R5 | Sync | A click on a Sync cell reading `↑a ↓b` | **`git.sync` with the repository** | **Yes** |
| R6 | Switch Branch… | `b`, a click on the Branch cell, the `⎇` hover button | **`git.checkout` with the repository (VS Code's branch picker)** | **No** |
| R7 | Open Terminal | `t`, `⋯` **Open terminal** | **`window.createTerminal({ cwd: <root>, name: <repository name> })`, shown** | **No** |
| R8 | Stash Changes | `⋯` **Stash changes** | **`git.stash` with the repository** | **No** |
| R9 | Pop Latest Stash | `⋯` **Pop latest stash** | **`git.stashPopLatest` with the repository** | **No** |
| R10 | Discard All Changes… | `⋯` **Discard all changes…** | **`git.cleanAll` with the repository, which shows VS Code's confirmation** | **No** |
| R11 | Reveal in File Explorer | `⋯` **Reveal in File Explorer** | **`revealFileInOS` with the repository root** | **No** |
| R12 | Copy Path | `⋯` **Copy path** | **The clipboard holds the repository root path** | **No** |
| R13 | Copy Branch Name | `⋯` **Copy branch name** | **The clipboard holds the branch name** | **No** |

#### Scenario: Discard canceled in VS Code's confirmation
- **GIVEN** `billing-api` has 3 changed files
- **WHEN** the user chooses **Discard all changes…** in its `⋯` menu
- **AND WHEN** the user cancels VS Code's confirmation
- **THEN** the working tree of `billing-api` is unchanged

### Requirement: Push and Publish guards
The system SHALL push or publish only a branch that has no operation in progress, is not detached, has a remote to
publish to, and is not behind its upstream, and SHALL otherwise start no push, record the job result
`skipped: <reason>` and show the notification of the matrix. A branch level with its upstream SHALL record
`ok: nothing to push` without pushing.

#### Scenario: Push matrix

| # | Operation in progress | HEAD | Upstream | Remote | Ahead | Behind | Git | Job result | Notification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Rebase | *Any* | *Any* | *Any* | *Any* | *Any* | **No push** | **`skipped: rebase in progress`** | **`Finish the rebase in billing-api first.`** |
| R2 | Merge | *Any* | *Any* | *Any* | *Any* | *Any* | **No push** | **`skipped: merge in progress`** | **`Finish the merge in billing-api first.`** |
| R3 | Cherry-pick | *Any* | *Any* | *Any* | *Any* | *Any* | **No push** | **`skipped: cherry-pick in progress`** | **`Finish the cherry-pick in billing-api first.`** |
| R4 | Revert | *Any* | *Any* | *Any* | *Any* | *Any* | **No push** | **`skipped: revert in progress`** | **`Finish the revert in billing-api first.`** |
| R5 | None | Detached | *N/A* | *Any* | *N/A* | *N/A* | **No push** | **`skipped: detached HEAD`** | **`billing-api has a detached HEAD. Check out a branch to push.`** |
| R6 | None | Branch | None | None | *N/A* | *N/A* | **No push** | **`skipped: no remote`** | **`billing-api has no remote to publish to.`** |
| R7 | None | Branch | None | `origin` | *N/A* | *N/A* | **`repository.push('origin', <branch>, true)`** | **`ok`** | **None** |
| R8 | None | Branch | Yes | *Any* | *Any* | ≥ 1 | **No push** | **`skipped: behind (↓2)`** | **`The remote branch of billing-api has 2 commits you don't have.` with `Pull`** |
| R9 | None | Branch | Yes | *Any* | 0 | 0 | **No push** | **`ok: nothing to push`** | **None** |
| R10 | None | Branch | Yes | *Any* | ≥ 1 | 0 | **`repository.push()`** | **`ok`** | **None** |

#### Scenario: Pull from the behind notification
- **GIVEN** the notification `The remote branch of billing-api has 2 commits you don't have.` is shown
- **WHEN** the user clicks `Pull`
- **THEN** `repository.pull()` runs for `billing-api`

### Requirement: Pull guards
The system SHALL pull only a branch that has no operation in progress, is not detached and has an upstream, and SHALL
otherwise start no pull, record `skipped: <reason>` and show `Pull skipped in <repository>: <reason>.` A pull that Git
reports as failed SHALL record `failed: <message>`.

#### Scenario: Pull matrix

| # | Operation in progress | HEAD | Upstream | Git | Job result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Rebase, merge, cherry-pick or revert | *Any* | *Any* | **No pull** | **`skipped: <operation> in progress`** |
| R2 | None | Detached | *N/A* | **No pull** | **`skipped: detached HEAD`** |
| R3 | None | Branch | None | **No pull** | **`skipped: no upstream`** |
| R4 | None | Branch | Yes | **`repository.pull()`** | **`ok`, or `failed: <message>` when Git reports an error** |

### Requirement: Fetch guard
The system SHALL fetch a repository that has a remote and SHALL record `skipped: no remote` without fetching a
repository that has none.

#### Scenario: Fetch a repository without a remote
- **GIVEN** `scratch` has no remote
- **WHEN** the user presses `f` on its row
- **THEN** no fetch runs and the job result is `skipped: no remote`

### Requirement: One job per repository at a time
While a Fetch, Pull, Push, Publish or Sync runs on a repository, the system SHALL start no other of these actions on
it, from any trigger.

#### Scenario: Fetch pressed twice
- **GIVEN** a fetch of `ledger` started by `f` is still running
- **WHEN** the user presses `f` on `ledger` again
- **THEN** `repository.fetch` has been called once for `ledger`

### Requirement: Job state in the row
The system SHALL show in the Sync cell of a row, while an action runs, `⟳ fetching`, `⟳ pulling`, `⟳ pushing`,
`⟳ publishing` or `⟳ syncing`; after it ends, a `skipped` result as `↷ <reason>` and a `failed` result as
`✗ <action> failed` with the message as tooltip, until the next action on that row starts or its Git state changes. An
`ok` result SHALL leave the Sync cell to show the repository state.

#### Scenario: Job state matrix

| # | Job | Result | Sync cell | Tooltip |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Fetch running | *N/A* | **`⟳ fetching`** | **None** |
| R2 | Pull running | *N/A* | **`⟳ pulling`** | **None** |
| R3 | Fetch ended | `ok` | **The sync state (`↓2`)** | **None** |
| R4 | Pull ended | `skipped: detached HEAD` | **`↷ detached HEAD`** | **None** |
| R5 | Fetch ended | `failed: Permission denied (publickey)` | **`✗ fetch failed`** | **`Permission denied (publickey)`** |
| R6 | Push ended | `skipped: behind (↓2)` | **`↷ behind (↓2)`** | **None** |

### Requirement: Single-row failure notifications
When an action started on one row fails, the system SHALL show `<Action> failed in <repository>: <message>` with the
button `Show Git Output`, which runs `git.showOutput`.

#### Scenario: Fetch fails
- **GIVEN** the remote of `infra-charts` rejects the SSH key
- **WHEN** the user presses `f` on its row
- **THEN** the notification reads `Fetch failed in infra-charts: Permission denied (publickey)` with `Show Git Output`

### Requirement: Hover buttons
The system SHALL show, while the pointer is over a row, buttons at its right edge for **Fetch** (`⟳`), **Pull** (`⇣`),
**Push** or **Publish** (`⇡`), **Switch Branch…** (`⎇`) and **More Actions…** (`⋯`), each with that name as tooltip
and accessible name, running the action of the row action matrix.

#### Scenario: Publish tooltip on an unpublished branch
- **GIVEN** `auth-service` is on `fix/login-timeout` without upstream
- **WHEN** the pointer is over its row
- **THEN** the `⇡` button's tooltip reads `Publish`

### Requirement: Row more-actions menu
The system SHALL open, from the `⋯` button or the `.` key, a menu for the row with the items **Open terminal** (`t`),
then **Stash changes**, **Pop latest stash** and **Discard all changes…**, then **Reveal in File Explorer**,
**Copy path** and **Copy branch name**, each group separated by a line. Items that cannot apply SHALL be disabled. The
menu SHALL be operable with `↑`, `↓`, `Enter` and `Esc`.

#### Scenario: Menu item state matrix

| # | Working tree | Stashes | HEAD | Stash changes | Pop latest stash | Discard all changes… | Copy branch name |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Dirty | 0 | Branch | **Enabled** | **Disabled** | **Enabled** | **Enabled** |
| R2 | Clean | 2 | Branch | **Disabled** | **Enabled** | **Disabled** | **Enabled** |
| R3 | Clean | 0 | Detached | **Disabled** | **Disabled** | **Disabled** | **Disabled** |

#### Scenario: Menu by keyboard
- **GIVEN** the focus is on the row of `billing-api`
- **WHEN** the user presses `.`
- **AND WHEN** the user presses `↓` and `Enter` on **Copy path**
- **THEN** the clipboard holds the root path of `billing-api` and the menu is closed

### Requirement: Row action keys
The system SHALL run on the focused row: `f` Fetch, `p` Pull, `P` Push or Publish, `b` Switch Branch…, `t` Open
Terminal and `.` the more-actions menu. With rows selected, `P`, `t` and `.` still act on the focused row only, and `b` switches
the selected repositories (`batch-operations`).
The footer SHALL show the hints `f fetch · p pull · P push · b switch · t terminal · . more` before the navigation
hints, and the key help overlay SHALL list these keys.

**Constraints:**
- `f`, `p` and `b` on a selection belong to `batch-operations`

#### Scenario: Push key with rows selected
- **GIVEN** `billing-api` and `ledger` are selected and the focus is on `web-shop`, 1 commit ahead
- **WHEN** the user presses `P`
- **THEN** `repository.push()` runs for `web-shop` only

#### Scenario: Switch key with no row selected
- **GIVEN** no row is selected and the focus is on `ledger`
- **WHEN** the user presses `b`
- **THEN** `git.checkout` runs with the repository `ledger`

### Requirement: Active repository for commands
The system SHALL resolve the repository of a command that acts on one repository from, in this order: its argument (an
Explorer folder resolves to the innermost listed repository that contains it; a Source Control repository is used as
is), the file of the active editor, the repository selected in the Source Control view, and otherwise a quick pick of
the listed repositories ordered by the last RepoHangar action on them in this window and then by name.

#### Scenario: Active repository matrix

| # | Argument | Active editor file | Source Control selection | Repository |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Explorer folder `acme/backend/billing-api/src` | *Any* | *Any* | **`billing-api`** |
| R2 | Explorer folder `acme/docs` (in no listed repository) | *Any* | *Any* | **None; notification `"acme/docs" is not in a repository RepoHangar lists.`** |
| R3 | Source Control repository `ledger` | *Any* | *Any* | **`ledger`** |
| R4 | None | In `web-shop` | *Any* | **`web-shop`** |
| R5 | None | None, or outside every listed repository | `ledger` | **`ledger`** |
| R6 | None | None | None | **Quick pick; the repository last acted on first** |
| R7 | None | None | None, and the quick pick is dismissed | **None; nothing runs** |

### Requirement: Fetch command and menu
The system SHALL provide `repohangar.fetch` (*RepoHangar: Fetch Repository*) for the active repository, and the item
**Fetch** in the Source Control Repositories context menu (`scm/sourceControl`, when `scmProvider == git`), both
running the Fetch action.

#### Scenario: Fetch from the Source Control Repositories menu
- **GIVEN** the Source Control Repositories view lists `ledger`
- **WHEN** the user chooses **Fetch** in its context menu
- **THEN** `repository.fetch({ prune: true })` runs for `ledger`
