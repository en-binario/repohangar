# dashboard Specification

## Purpose

The RepoHangar dashboard: a panel in the editor area with one row per repository that shows its branch, sync state,
changes, stashes and last fetch, with filters, groups, row details and keyboard navigation, so the state of every
repository is visible in one view.

**Non-goals:**
- Which repositories are listed, their remotes, providers and groups, owned by `repo-registry`.
- Row actions, hover buttons, cell clicks and the action keys (`f` `F` `p` `P` `b` `n` `s` `t` `.`), owned by
  `git-operations`.
- Fetch all, Pull all (ff) and branch switching across repositories, owned by `batch-operations`.
- `g` and the graph buttons, owned by `explorer-open-in-git-graph`; `e` and a click on the repository name, owned by
  `explorer-reveal`.
- The MR / PR column, the Has MR and Pipeline failed chips, and the merge request keys (`m` `M` `o`), owned by
  `hosting-providers` and `mr-creation`.
- Sorting by column and choosing columns: no capability does yet.

## Requirements

### Requirement: Opening the dashboard
The system SHALL open the dashboard as a webview panel titled `RepoHangar` in the active editor group, with its tab
pinned, from the command `repohangar.open` (*RepoHangar: Open Dashboard*), the default keybinding `Ctrl+Alt+H`
(`Ctrl+Cmd+H` on macOS), and the **Open RepoHangar** button (`$(layout)`) in the Source Control view title bar
(`scm/title`). The system MUST keep at most one dashboard panel per window: when one exists, these entry points SHALL
reveal it instead of creating another.

#### Scenario: Open the dashboard when none is open
- **GIVEN** no dashboard panel exists in the window
- **WHEN** the user runs `repohangar.open` from the command palette
- **THEN** a panel titled `RepoHangar` opens in the active editor group
- **AND** its tab is pinned

#### Scenario: Open the dashboard when it is already open
- **GIVEN** the dashboard panel exists in a background tab
- **WHEN** the user presses `Ctrl+Alt+H`
- **THEN** the existing panel becomes the active tab
- **AND** the window has one dashboard panel

#### Scenario: Open from the Source Control title bar
- **GIVEN** the Source Control view is visible
- **WHEN** the user clicks **Open RepoHangar** in its title bar
- **THEN** `repohangar.open` runs and the dashboard panel is the active tab

### Requirement: Dashboard restored after a window reload
The system SHALL restore an open dashboard panel after a window reload in the same editor group, with the same filter
text, active chips, selected rows and expanded row details.

#### Scenario: Window reload with the dashboard open
- **GIVEN** the dashboard is open with filter text `bill`, the Dirty chip active and `billing-api` selected
- **WHEN** the user runs **Developer: Reload Window**
- **THEN** the window has one dashboard panel, in the same editor group
- **AND** its filter box reads `bill`, the Dirty chip is active and `billing-api` is selected

### Requirement: Open on startup
The system SHALL open the dashboard at startup only when `repohangar.openOnStartup` (default `"never"`) is
`"multiRepo"`, no dashboard panel was restored, and the Git extension lists at least 3 repositories when its API state
first becomes `initialized`. It SHALL open it without moving keyboard focus, and SHALL make this check once per window.

**Constraints:**
- Threshold: 3 repositories
- The check runs once, when the Git API state first becomes `initialized`

#### Scenario: Open on startup matrix

| # | `repohangar.openOnStartup` | Dashboard restored by the reload | Repositories when the Git API is initialized | Repositories opened later | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `never` | *Any* | *Any* | *Any* | **Not opened** |
| R2 | `multiRepo` | Yes | *Any* | *Any* | **No second panel** |
| R3 | `multiRepo` | No | 2 | 0 | **Not opened** |
| R4 | `multiRepo` | No | 2 | 1 | **Not opened** |
| R5 | `multiRepo` | No | 3 | *Any* | **Opened; keyboard focus stays where it was** |

### Requirement: Empty states
The system SHALL show, in place of the grid, the state text that matches the first applicable condition: the Git
extension disabled by `git.enabled`, the Git API not yet initialized, or no repositories. It SHALL show the grid when
Git is enabled, the Git API is initialized and at least one repository is listed.

#### Scenario: Dashboard state matrix

| # | `git.enabled` | Git API state | Repositories | Dashboard shows |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `false` | *N/A* | *N/A* | **`The Git extension is disabled (git.enabled is false).` with the button `Open Settings`** |
| R2 | `true` | `uninitialized` | *N/A* | **`Loading repositories…`** |
| R3 | `true` | `initialized` | 0 | **`No Git repositories found in this workspace.`** |
| R4 | `true` | `initialized` | ≥ 1 | **The grid** |

#### Scenario: Open Settings from the empty state
- **GIVEN** `git.enabled` is `false` and the dashboard shows its empty state
- **WHEN** the user clicks `Open Settings`
- **THEN** the command `workbench.action.openSettings` runs with the query `git.enabled`

### Requirement: Restricted Mode
The extension SHALL declare that it does not support untrusted workspaces (`capabilities.untrustedWorkspaces.supported`
is `false`), as the built-in Git extension it depends on does, so that in Restricted Mode RepoHangar MUST NOT start a
`git` process, call the Git extension API, show its status bar item or offer its commands. When the user trusts the
workspace, RepoHangar SHALL start without a window reload once VS Code enables it.

#### Scenario: Window opened in Restricted Mode
- **GIVEN** a folder with the repositories `billing-api` and `ledger` opened in Restricted Mode
- **WHEN** the window finishes starting
- **THEN** no `git` process is started by RepoHangar
- **AND** no RepoHangar status bar item is shown
- **AND** the command palette offers no `RepoHangar:` command

#### Scenario: Workspace trusted after opening in Restricted Mode
- **GIVEN** a folder with the repositories `billing-api` and `ledger` opened in Restricted Mode
- **WHEN** the user trusts the workspace
- **AND WHEN** VS Code enables the Git extension and RepoHangar
- **THEN** the status bar item reads `$(git-branch) 2 repos` without a window reload
- **AND** `repohangar.open` opens a dashboard with the rows `billing-api` and `ledger`

### Requirement: Grid columns
The system SHALL show the grid with these columns, in this order: a selection checkbox, **Repository**, **Branch**,
**Sync**, **Changes**, **Fetched** and **MR / PR** (`hosting-providers`), and SHALL order groups by name and the rows within a group by repository name,
both case-insensitively.

#### Scenario: Column headers and row order
- **GIVEN** the group `backend` holds `ledger`, `Billing-api` and `auth-service`
- **WHEN** the dashboard shows the grid
- **THEN** the header row reads `Repository`, `Branch`, `Sync`, `Changes`, `Fetched`, `MR / PR` after the checkbox column
- **AND** the rows of `backend` appear in the order `auth-service`, `Billing-api`, `ledger`

### Requirement: Repository cell
The system SHALL show in the Repository cell the repository name followed by the provider badge (`GL` for `gitlab`,
`GH` for `github`, `?` for `unknown`, no badge without a provider), and SHALL show as its tooltip the repository root
path on the first line and the chosen remote's URL on the second line, or `No remote`. The URL shown, and every
message sent to the webview, MUST NOT contain the user name or password of an `https://` or `http://` remote URL.

#### Scenario: Repository cell matrix

| # | Chosen remote URL | Provider | Cell | Tooltip |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `https://ci-bot:glpat-x1y2z3@git.acme.com/payments/billing-api.git` | `gitlab` | **`billing-api GL`** | **`/home/dev/code/acme/backend/billing-api` ⏎ `https://git.acme.com/payments/billing-api.git`** |
| R2 | `git@github.com:acme/web-shop.git` | `github` | **`web-shop GH`** | **`/home/dev/code/acme/frontend/web-shop` ⏎ `git@github.com:acme/web-shop.git`** |
| R3 | `https://git.other.org/team/notifications.git` | `unknown` | **`notifications ?`** | **`/home/dev/code/acme/backend/notifications` ⏎ `https://git.other.org/team/notifications.git`** |
| R4 | `/srv/git/infra-charts.git` | None | **`infra-charts`** | **`/home/dev/code/acme/infra/infra-charts` ⏎ `/srv/git/infra-charts.git`** |
| R5 | None | None | **`scratch`** | **`/home/dev/code/acme/tools/scratch` ⏎ `No remote`** |

#### Scenario: Remote credentials never reach the webview
- **GIVEN** the remote of `billing-api` is `https://ci-bot:glpat-x1y2z3@git.acme.com/payments/billing-api.git`
- **WHEN** the dashboard opens and receives its snapshot
- **THEN** no message posted to the webview contains `glpat-x1y2z3` or `ci-bot`

### Requirement: Branch cell
The system SHALL show in the Branch cell the operation in progress when there is one, checked in the order rebase,
merge, cherry-pick, revert from the markers in the repository's own git dir; otherwise `detached` and the first 7
characters of the commit when HEAD is detached; otherwise the branch name, followed by the badge `no upstream` when the
branch has no upstream.

**Constraints:**
- Rebase markers: `rebase-merge/` (step from `msgnum` and `end`) or `rebase-apply/` (step from `next` and `last`)
- Merge marker: `MERGE_HEAD`; cherry-pick marker: `CHERRY_PICK_HEAD`; revert marker: `REVERT_HEAD`
- For a worktree, the markers are read from the worktree's git dir, not the common git dir

#### Scenario: Branch cell matrix

| # | Operation in progress | HEAD | Upstream | Branch cell |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Rebase, `rebase-merge/msgnum` = 3, `rebase-merge/end` = 7 | *Any* | *Any* | **`REBASING 3/7`** |
| R2 | Rebase, `rebase-apply/next` = 2, `rebase-apply/last` = 5 | *Any* | *Any* | **`REBASING 2/5`** |
| R3 | Rebase, `rebase-merge/` without `msgnum` | *Any* | *Any* | **`REBASING`** |
| R4 | Merge | *Any* | *Any* | **`MERGING`** |
| R5 | Cherry-pick | *Any* | *Any* | **`CHERRY-PICKING`** |
| R6 | Revert | *Any* | *Any* | **`REVERTING`** |
| R7 | None | Detached at `a1b2c3d4e5f60718` | *N/A* | **`detached a1b2c3d`** |
| R8 | None | Branch `feature/ABC-12-notes` | `origin/feature/ABC-12-notes` | **`feature/ABC-12-notes`** |
| R9 | None | Branch `fix/login-timeout` | None | **`fix/login-timeout` with the badge `no upstream`** |
| R10 | None | Branch `main` with no commits yet | None | **`main` with the badge `no upstream`** |

### Requirement: Sync cell
The system SHALL show in the Sync cell `—` when an operation is in progress, HEAD is detached, the branch has no
upstream and the repository has no remote, the upstream's ahead and behind counts are unavailable, or the branch is
level with its upstream; `⇡ publish` when the branch has no upstream and the repository has a remote; and otherwise
`↑<ahead>` and `↓<behind>` for the non-zero counts, separated by one space.

#### Scenario: Sync cell matrix

| # | Operation in progress | HEAD | Remote | Upstream | Ahead | Behind | Sync cell |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Rebase, merge, cherry-pick or revert | *Any* | *Any* | *Any* | *Any* | *Any* | **`—`** |
| R2 | None | Detached | *Any* | *N/A* | *N/A* | *N/A* | **`—`** |
| R3 | None | Branch | None | None | *N/A* | *N/A* | **`—`** |
| R4 | None | Branch | `origin` | None | *N/A* | *N/A* | **`⇡ publish`** |
| R5 | None | Branch | `origin` | Yes, counts unavailable | *N/A* | *N/A* | **`—`** |
| R6 | None | Branch | `origin` | Yes | 0 | 0 | **`—`** |
| R7 | None | Branch | `origin` | Yes | 2 | 0 | **`↑2`** |
| R8 | None | Branch | `origin` | Yes | 0 | 4 | **`↓4`** |
| R9 | None | Branch | `origin` | Yes | 1 | 1 | **`↑1 ↓1`** |

### Requirement: Changes cell
The system SHALL show in the Changes cell, in this order and separated by one space, `⚠ <n> confl` for files with merge
conflicts, `●<n>` for tracked files with unstaged changes, `+<n>` for files with staged changes, `?<n>` for untracked
files and `≡<n>` for stashes, leaving out every segment whose count is 0, and SHALL show `—` when every count is 0. A
repository is **dirty** when it has at least one conflicted, unstaged, staged or untracked file; stashes do not make it
dirty.

**Constraints:**
- A file changed in both the index and the working tree counts once in `●` and once in `+`
- Ignored files are not counted

#### Scenario: Changes cell matrix

| # | Conflicts | Unstaged | Staged | Untracked | Stashes | Changes cell | Dirty |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | 0 | 0 | 0 | 0 | 0 | **`—`** | **No** |
| R2 | 0 | 0 | 0 | 0 | 2 | **`≡2`** | **No** |
| R3 | 0 | 3 | 1 | 0 | 0 | **`●3 +1`** | **Yes** |
| R4 | 0 | 0 | 1 | 0 | 0 | **`+1`** | **Yes** |
| R5 | 0 | 0 | 0 | 2 | 0 | **`?2`** | **Yes** |
| R6 | 2 | 0 | 0 | 0 | 0 | **`⚠ 2 confl`** | **Yes** |
| R7 | 2 | 1 | 1 | 2 | 1 | **`⚠ 2 confl ●1 +1 ?2 ≡1`** | **Yes** |

### Requirement: Stash count
The system SHALL count a repository's stashes as the number of lines in `logs/refs/stash` in its common git dir, as 1
when that file is missing and the ref `refs/stash` exists (loose or in `packed-refs`), and as 0 otherwise, without
starting a `git` process.

#### Scenario: Stash count matrix

| # | `logs/refs/stash` in the common git dir | `refs/stash` | Stash count | `git` process |
| :--- | :--- | :--- | :--- | :--- |
| R1 | 3 lines | *Any* | **3** | **None started** |
| R2 | Missing | Loose ref exists | **1** | **None started** |
| R3 | Missing | Only in `packed-refs` | **1** | **None started** |
| R4 | Missing | Missing | **0** | **None started** |

#### Scenario: Worktree shares the stash count of its main repository
- **GIVEN** the main working tree of `billing-api` has 2 stashes
- **AND** `/home/dev/code/acme/backend/billing-api-hotfix` is a worktree of `billing-api` that the Git extension opened
- **WHEN** the dashboard shows both rows
- **THEN** the Changes cell of both rows ends with `≡2`

### Requirement: Fetched cell
The system SHALL show in the Fetched cell the time since the newest modification of `FETCH_HEAD` in the repository's
git dir or its common git dir, as `now` under 1 minute, `<m> min` under 1 hour, `<h> h` under 24 hours and `<d> d`
otherwise (each rounded down), or `never` when neither file exists. It SHALL append ` ⚠` when the age is at least
`repohangar.staleFetchHours` hours (default `1`; `0` turns the marker off), and SHALL re-render the cell at least once
every 60 seconds while the dashboard is visible.

**Constraints:**
- Re-render interval: 60 s, only while the dashboard panel is visible
- The marker never appears with `never`

#### Scenario: Fetched cell matrix

| # | Newest `FETCH_HEAD` | Age | `repohangar.staleFetchHours` | Fetched cell |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Missing in both git dirs | *N/A* | *Any* | **`never`** |
| R2 | Present | 30 s | 1 | **`now`** |
| R3 | Present | 4 min 50 s | 1 | **`4 min`** |
| R4 | Present | 59 min | 1 | **`59 min`** |
| R5 | Present | 1 h exactly | 1 | **`1 h ⚠`** |
| R6 | Present | 2 h 10 min | 1 | **`2 h ⚠`** |
| R7 | Present | 2 h 10 min | 3 | **`2 h`** |
| R8 | Present | 26 h | 1 | **`1 d ⚠`** |
| R9 | Present | 26 h | 0 | **`1 d`** |
| R10 | Worktree: common git dir 4 min old, worktree git dir 3 h old | 4 min | 1 | **`4 min`** |

#### Scenario: Fetched cell ages while the dashboard is visible
- **GIVEN** the dashboard is visible and `ledger` shows `59 min` with `repohangar.staleFetchHours` at `1`
- **WHEN** 60 seconds pass with no Git change
- **THEN** the Fetched cell of `ledger` reads `1 h ⚠`

### Requirement: Live row updates
The system SHALL update a row after the repository's `state.onDidChange` fires, or after `FETCH_HEAD` or the stash
reflog of the repository changes on disk. Because the Git extension re-reads a repository after an outside change only
while the window is focused and at most once every 5 s, the system SHALL also call `repository.status()` when the
repository's `HEAD`, `logs/HEAD`, refs, `packed-refs` or operation markers change on disk: within 150 ms while the
window is focused, or when the window is next focused. It MUST NOT poll repository state with a timer.

**Constraints:**
- From `onDidChange` to the updated row in the webview: < 250 ms, excluding the 150 ms debounce per repository
- From `git commit` in a terminal to the updated row, window focused: < 1 s
- The webview receives at most one update batch per 100 ms
- Changes to the index or the working tree alone do not trigger a `repository.status()` call; the Git extension
  reports them

#### Scenario: Live update trigger matrix

| # | Change on disk | Window focused | `repository.status()` from RepoHangar | Row updated |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `HEAD`, `logs/HEAD` or a ref (commit, checkout, fetch, stash) | Yes | **Called once, 150 ms after the last change** | **< 1 s after the change** |
| R2 | `HEAD`, `logs/HEAD` or a ref | No | **Not called until the window is focused, then called once** | **< 1 s after the window is focused** |
| R3 | An operation marker (`MERGE_HEAD`, `rebase-merge/`) | Yes | **Called once** | **< 1 s after the change** |
| R4 | `FETCH_HEAD` only | *Any* | **Not called** | **Fetched cell < 1 s after the change** |
| R5 | A working tree file or the index only | *Any* | **Not called** | **< 250 ms after the Git extension's `onDidChange`** |

#### Scenario: Commit in a terminal while the window is focused
- **GIVEN** the dashboard is open, the window is focused, and `billing-api` shows `●1` in Changes and `—` in Sync,
  level with its upstream
- **WHEN** the user runs `git commit -am "Add notes"` in `billing-api` from a terminal
- **THEN** within 1 s the Changes cell of `billing-api` reads `—` and the Sync cell reads `↑1`
- **AND** RepoHangar started no `git` process on a timer

#### Scenario: Fetch in an external terminal
- **GIVEN** the dashboard is open and `ledger` shows `2 h ⚠` in Fetched
- **WHEN** the user runs `git fetch` in `ledger` from an external terminal
- **THEN** within 1 s the Fetched cell of `ledger` reads `now`

### Requirement: First paint
The system SHALL render the first frame of the grid within 300 ms of `repohangar.open` when the registry already holds
the state of every repository.

**Constraints:**
- 50 repositories, state already loaded, no dashboard panel open before the command

#### Scenario: Open with 50 repositories
- **GIVEN** a workspace with 50 repositories whose rows are loaded
- **WHEN** the user runs `repohangar.open`
- **THEN** the webview reports its first rendered frame with 50 rows within 300 ms of the command

### Requirement: Groups in the grid
The system SHALL show a header row `▾ <group> (<n>)` before the rows of each group, where `<n>` is the number of rows
of the group that the filters show, SHALL hide a group whose rows are all filtered out, and SHALL collapse or expand a
group (`▸` when collapsed) on a click on its header or `Enter` on the focused header. The collapsed groups SHALL be
remembered per workspace across window reloads. With the grouping mode `none` the grid has no header rows.

#### Scenario: Collapse a group
- **GIVEN** the group `infra` holds 7 repositories and is expanded
- **WHEN** the user clicks its header
- **THEN** the header reads `▸ infra (7)` and none of its 7 rows is shown
- **AND WHEN** the user reloads the window
- **THEN** the header still reads `▸ infra (7)`

#### Scenario: Group header count follows the filter
- **GIVEN** the group `backend` holds `billing-api`, `ledger`, `notifications`, `auth-service` and `req-anchor`
- **WHEN** the user types `bill` in the filter box
- **THEN** the header reads `▾ backend (1)`
- **AND** the headers of groups with no matching row are hidden

### Requirement: Group menu
The system SHALL offer a **Group** menu in the dashboard toolbar with the choices `Folder` (`parentFolder`),
`Workspace folder` (`workspaceFolder`), `Custom` (`custom`) and `None` (`none`). A choice SHALL apply to this workspace
only, be remembered in workspace state, and MUST NOT write any setting. A later change of `repohangar.groupBy` SHALL
replace the remembered choice.

#### Scenario: Group menu matrix

| # | `repohangar.groupBy` | Group menu choice remembered for the workspace | Event | Effective grouping mode | Settings written |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `parentFolder` | None | Dashboard opens | **`parentFolder`, menu reads `Folder`** | **None** |
| R2 | `parentFolder` | None | User picks `Workspace folder` | **`workspaceFolder`, menu reads `Workspace folder`** | **None** |
| R3 | `parentFolder` | `workspaceFolder` | Window reload | **`workspaceFolder`** | **None** |
| R4 | `parentFolder` | `workspaceFolder` | User sets `repohangar.groupBy` to `none` | **`none`; remembered choice cleared** | **Only the user's own edit** |

### Requirement: Filters
The system SHALL show only the rows that match the filter text and every active chip. The filter text matches a row
when it is a case-insensitive substring of the repository name, the branch name or the group name. The chips are,
in this order, **All**, **Dirty** (the repository is dirty), **Behind** (behind its upstream by at least 1), **Ahead**
(ahead of its upstream by at least 1), **Has MR** (the MR / PR cell shows an open review, loaded or cached),
**Pipeline ✗** (that review's pipeline or checks show `✗ failed`) and **No upstream** (HEAD on a branch with no
upstream). Each chip label SHALL end with the number of rows that match that chip alone (`Dirty 3`, `Has MR 5`). **All** is active when no other chip is; activating **All**
SHALL clear the other chips. Filtering MUST NOT change the selection.

#### Scenario: Chip membership matrix

| # | Row state | Dirty | Behind | Ahead | No upstream |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Branch with upstream, `—` in Sync, `—` in Changes | **No** | **No** | **No** | **No** |
| R2 | Branch with upstream, `↑2`, `●3 +1` | **Yes** | **No** | **Yes** | **No** |
| R3 | Branch with upstream, `↓4`, `—` in Changes | **No** | **Yes** | **No** | **No** |
| R4 | Branch with upstream, `↑1 ↓1`, `—` in Changes | **No** | **Yes** | **Yes** | **No** |
| R5 | Branch without upstream, `⇡ publish`, `?2` | **Yes** | **No** | **No** | **Yes** |
| R6 | Detached HEAD, `—` in Changes | **No** | **No** | **No** | **No** |
| R7 | `REBASING 3/7`, `⚠ 2 confl` | **Yes** | **No** | **No** | **No** |
| R8 | Branch with upstream, `—` in Changes, `≡2` | **No** | **No** | **No** | **No** |

#### Scenario: Filter combination matrix

Row under test: `billing-api` in group `backend`, branch `feature/ABC-12-notes`, `↑2`, `●3 +1`.

| # | Filter text | Active chips | `billing-api` |
| :--- | :--- | :--- | :--- |
| R1 | Empty | All | **Shown** |
| R2 | `bill` | All | **Shown** |
| R3 | `abc-12` | All | **Shown** |
| R4 | `BACKEND` | All | **Shown** |
| R5 | `ledger` | All | **Hidden** |
| R6 | Empty | Dirty | **Shown** |
| R7 | Empty | Dirty, Ahead | **Shown** |
| R8 | Empty | Dirty, Behind | **Hidden** |
| R9 | `bill` | Behind | **Hidden** |

#### Scenario: Selection kept while filtering
- **GIVEN** `billing-api` and `ledger` are selected and the footer reads `2 selected`
- **WHEN** the user types `bill` in the filter box
- **THEN** only `billing-api` is shown and the footer still reads `2 selected`

#### Scenario: Review chip membership matrix

| # | MR / PR cell | Has MR | Pipeline ✗ |
| :--- | :--- | :--- | :--- |
| R1 | `!142  Draft  ⟳ running` | **Yes** | **No** |
| R2 | `#311  ✗ failed  changes requested` | **Yes** | **Yes** |
| R3 | `!88  ✓ passed  2/2`, not refreshed | **Yes** | **No** |
| R4 | `!57  ✗ failed`, not refreshed | **Yes** | **Yes** |
| R5 | `—` | **No** | **No** |
| R6 | `Sign in`, `?` or `…` | **No** | **No** |

### Requirement: Keyboard navigation
The system SHALL let the user navigate, select, filter, expand and get help in the grid with the keys in the matrix
below, applied to the focused row or group header, and SHALL show a footer with the number of selected rows
(`<n> selected`, hidden when 0), then the key hints of the action keys that other capabilities assign, then the
navigation hints `↑↓ move · Space select · / filter · ⏎ details · ? keys`. The key help overlay SHALL list the keys of
this matrix and every action key.

**Constraints:**
- `1` to `7` toggle **All**, **Dirty**, **Behind**, **Ahead**, **Has MR**, **Pipeline ✗** and **No upstream**
- Action keys are assigned by other capabilities (`git-operations`: `f` `p` `P` `b` `t` `.`; `batch-operations`: `F`;
  `hosting-providers`: `o`)
- Keys that neither this matrix nor another capability assigns do nothing while the grid has focus

#### Scenario: Grid key matrix

| # | Key | State before | Result |
| :--- | :--- | :--- | :--- |
| R1 | `↓` or `j` | Focus on a row or header that is not the last shown | **Focus on the next shown row or group header** |
| R2 | `↓` or `j` | Focus on the last shown row | **Focus unchanged** |
| R3 | `↑` or `k` | Focus on a row or header that is not the first shown | **Focus on the previous shown row or group header** |
| R4 | `↑` or `k` | Focus on the first shown row or header | **Focus unchanged** |
| R5 | `Space` | Focused row not selected, 0 selected | **Row selected, checkbox checked, footer `1 selected`** |
| R6 | `Space` | Focused row selected, 1 selected | **Row not selected, footer hidden** |
| R7 | `Ctrl+A` (`Cmd+A` on macOS) | Filter `bill` shows 2 of 14 rows, 0 selected | **The 2 shown rows selected, footer `2 selected`** |
| R8 | `/` | Focus in the grid | **Keyboard focus in the filter box** |
| R9 | `Enter` | Focus on a row with closed details | **Row details open below the row** |
| R10 | `Enter` | Focus on a row with open details | **Row details closed** |
| R11 | `Enter` | Focus on an expanded group header | **Group collapsed** |
| R12 | `2` | Dirty chip inactive | **Dirty chip active** |
| R13 | `2` | Dirty chip active, no other chip | **All active** |
| R14 | `1` | Dirty and Ahead chips active | **All active, Dirty and Ahead inactive** |
| R16 | `Esc` | Filter text `bill` or a chip other than All active, 2 selected | **Filter text empty, All active, 2 still selected** |
| R17 | `Esc` | No filter text, All active, 3 selected | **0 selected, footer hidden** |
| R18 | `?` | Focus in the grid | **Key help overlay listing every key of this matrix** |
| R19 | `Esc` | Key help overlay open | **Overlay closed, focus back on the row it came from** |
| R20 | `Esc` | Focus in the filter box with text `bill` | **Filter text empty, focus on the first shown row** |
| R21 | `↓` | Focus in the filter box | **Focus on the first shown row** |
| R22 | `j` | Focus in the filter box with text `bil` | **Filter text `bilj`, focus unchanged** |
| R23 | `5` | Has MR chip inactive | **Has MR chip active** |
| R24 | `6` | Pipeline ✗ chip inactive | **Pipeline ✗ chip active** |

#### Scenario: Footer with action keys
- **GIVEN** the dashboard shows the grid, `billing-api` is selected, and `git-operations` and `batch-operations` assign
  their keys
- **WHEN** the footer renders
- **THEN** it reads `1 selected` and `f fetch · p pull · P push · b switch · t terminal · . more · ↑↓ move · Space select · / filter · ⏎ details · ? keys`

### Requirement: Row details
The system SHALL show, when a row's details are open, the lines **Last commit** (short hash, subject in quotes, author
and age, or `No commits yet`), **Upstream** (the upstream ref, or `none`), **Remote** (the chosen remote's name and its
URL without credentials, or `none`) and **Path** (the repository root path).

**Constraints:**
- The age uses the units of the Fetched cell followed by ` ago` (`25 min ago`), or `just now` under 1 minute

#### Scenario: Row details matrix

| # | Commits | Upstream | Remote | Details |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Last commit `a1b2c3d` "Add credit note link to invoice page" by Luis Gómez, 25 min ago | `origin/feature/ABC-12-notes` | `origin` `https://git.acme.com/acme/web-shop.git` | **`Last commit  a1b2c3d  "Add credit note link to invoice page" — Luis Gómez, 25 min ago` ⏎ `Upstream  origin/feature/ABC-12-notes` ⏎ `Remote  origin  https://git.acme.com/acme/web-shop.git` ⏎ `Path  /home/dev/code/acme/frontend/web-shop`** |
| R2 | None (unborn `main`) | None | `origin` `git@github.com:acme/new-service.git` | **`Last commit  No commits yet` ⏎ `Upstream  none` ⏎ `Remote  origin  git@github.com:acme/new-service.git` ⏎ `Path  /home/dev/code/acme/backend/new-service`** |
| R3 | Last commit `9f8e7d6` "Initial import" by Ana Pérez, 3 d ago | None | None | **`Last commit  9f8e7d6  "Initial import" — Ana Pérez, 3 d ago` ⏎ `Upstream  none` ⏎ `Remote  none` ⏎ `Path  /home/dev/code/acme/tools/scratch`** |

### Requirement: Refresh command
The system SHALL provide the command `repohangar.refresh` (*RepoHangar: Refresh*) that calls `repository.status()` once
for every listed repository and reads `FETCH_HEAD`, the stash count and the operation markers again, and SHALL leave
every row unchanged when nothing changed on disk.

#### Scenario: Refresh all rows
- **GIVEN** the workspace is trusted and the dashboard lists 14 repositories
- **WHEN** the user runs `repohangar.refresh`
- **THEN** `repository.status()` is called once for each of the 14 repositories
- **AND** no network operation runs

### Requirement: Accessible grid
The system SHALL expose the grid with `role="grid"`, one focusable cell at a time (roving `tabindex`), and an accessible
name for every badge and symbol, and MUST NOT use color as the only signal of a state.

#### Scenario: Accessible names matrix

| # | Shown | Accessible name |
| :--- | :--- | :--- |
| R1 | `GL` | **`GitLab`** |
| R2 | `GH` | **`GitHub`** |
| R3 | `?` badge | **`Unknown host`** |
| R4 | `↑2` | **`2 commits ahead`** |
| R5 | `↓4` | **`4 commits behind`** |
| R6 | `⇡ publish` | **`Branch not published`** |
| R7 | `no upstream` | **`No upstream branch`** |
| R8 | `●3` | **`3 files with unstaged changes`** |
| R9 | `+1` | **`1 file with staged changes`** |
| R10 | `?2` | **`2 untracked files`** |
| R11 | `⚠ 2 confl` | **`2 files with conflicts`** |
| R12 | `≡2` | **`2 stashes`** |
| R13 | `⚠` after the Fetched age, `repohangar.staleFetchHours` = 1 | **`Last fetch more than 1 h ago`** |
| R14 | `—` in Sync | **`Nothing to sync`** |

### Requirement: Webview safety
The system SHALL load the dashboard webview with the Content Security Policy `default-src 'none'`, scripts only by
nonce and styles and fonts only from the extension, SHALL render every repository, branch, remote and commit value as
text, and SHALL drop every message from the webview that does not match the message protocol, with no Git operation
and no change of state.

#### Scenario: Repository name with markup
- **GIVEN** a repository root named `<img src=x onerror=alert(1)>`
- **WHEN** the dashboard shows its row
- **THEN** the Repository cell reads `<img src=x onerror=alert(1)>` as text
- **AND** the webview DOM contains no `img` element in that cell

#### Scenario: Malformed message from the webview
- **GIVEN** the dashboard is open
- **WHEN** the webview posts `{ "type": "refresh", "repo": 42, "extra": true }`
- **THEN** no `git` process is started and no Git extension API operation is called
- **AND** the registry and the dashboard rows are unchanged
