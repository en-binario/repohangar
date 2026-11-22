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
- Choosing columns: no capability does yet.

## Requirements

### Requirement: Opening the dashboard
The system SHALL open the dashboard as a webview panel titled `RepoHangar` in the active editor group, with its tab
pinned, from the command `repohangar.open` (*RepoHangar: Open Dashboard*), the default keybinding `Ctrl+Alt+H`
(`Ctrl+Cmd+H` on macOS), and the **Open RepoHangar** button (`$(layout)`) in the Source Control view title bar
(`scm/title`). The system MUST keep at most one dashboard panel per window: when one exists, these entry points SHALL
reveal it instead of creating another, including a dashboard tab restored after a window reload whose webview VS Code
has not restored yet, and a second dashboard panel that VS Code restores while one exists SHALL be closed.

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

#### Scenario: Dashboard tab matrix

| # | Dashboard tabs before | Webview restored by VS Code | Event | Dashboard tabs after | Active tab |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | None | *N/A* | The user runs `repohangar.open` | **1, new, in the active editor group** | **The new dashboard tab** |
| R2 | 1, in a background tab of the active editor group | Yes | The user presses `Ctrl+Alt+H` | **1** | **That tab** |
| R3 | 1, in a background tab of the active editor group, after a window reload | No | The user presses `Ctrl+Alt+H` | **1** | **That tab** |
| R4 | 1, in a background tab of another editor group, after a window reload | No | The user runs `repohangar.open` | **1, in that editor group** | **That tab** |
| R5 | 1, with its webview shown | Yes | VS Code restores a second dashboard panel | **1; the second panel is closed** | **The first dashboard tab** |

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
for every listed repository, reads `FETCH_HEAD`, the stash count and the operation markers again, and rescans the
repository roots of the Explorer context menu (`explorer-open-in-git-graph`), and SHALL leave every row unchanged when
nothing changed on disk.

#### Scenario: Refresh all rows
- **GIVEN** the workspace is trusted and the dashboard lists 14 repositories
- **WHEN** the user runs `repohangar.refresh`
- **THEN** `repository.status()` is called once for each of the 14 repositories
- **AND** no network operation runs

#### Scenario: Refresh rescans the repository roots
- **GIVEN** a repository was cloned into `acme/backend/payments` after the last scan
- **WHEN** the user runs `repohangar.refresh`
- **THEN** the context key `repohangar.repositoryRoots` contains the path of `acme/backend/payments`

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

### Requirement: Dashboard height
The dashboard SHALL fill the height of its panel and SHALL show a vertical scrollbar only when the toolbar, the batch
result panel, the grid and the footer together are taller than the panel, also when the grid is wider than the panel
and the panel shows a horizontal scrollbar. The footer SHALL stay at the bottom of the panel when the rows fit.

#### Scenario: Rows that fit the panel
- **GIVEN** the filter `stashed` leaves 2 rows in a window 1000 px high
- **WHEN** the grid is rendered
- **THEN** the page's `scrollHeight` equals its `clientHeight` and the panel shows no vertical scrollbar
- **AND** the bottom edge of the footer is 12 px above the bottom edge of the panel's visible area

#### Scenario: Rows that fit a panel narrower than the grid
- **GIVEN** the filter `stashed` leaves 2 rows in a window 1000 px high whose panel is narrower than the grid's minimum
  width
- **WHEN** the grid is rendered
- **THEN** the panel shows a horizontal scrollbar
- **AND** the page's `scrollHeight` equals its `clientHeight` and the panel shows no vertical scrollbar

#### Scenario: Rows taller than the panel
- **GIVEN** the dashboard shows every row of the 14 repositories in a window 400 px high
- **WHEN** the grid is rendered
- **THEN** the page's `scrollHeight` is greater than its `clientHeight` and the panel shows a vertical scrollbar
- **AND** the footer is visible at the bottom edge of the panel

### Requirement: Grid columns and row order
> **Supersedes:** Grid columns

The system SHALL show the grid with these columns, in this order: a selection checkbox, **Repository**, **Branch**,
**Sync**, **Changes**, **Fetched** and **MR / PR** (`hosting-providers`). It SHALL order groups by name,
case-insensitively, whatever the sort, and SHALL order the rows within a group (or every row with the grouping mode
`none`) by the sort chosen with **Sort by column**. The default sort is **Repository** ascending: repository name,
case-insensitive. The header of the sorted column SHALL end with `▲` (ascending) or `▼` (descending) and carry
`aria-sort` `ascending` or `descending`; every other column header SHALL carry no arrow and no `aria-sort`.

#### Scenario: Column headers and default row order
- **GIVEN** no sort was chosen in this workspace and the group `backend` holds `ledger`, `Billing-api` and
  `auth-service`
- **WHEN** the dashboard shows the grid
- **THEN** the header row reads `Repository ▲`, `Branch`, `Sync`, `Changes`, `Fetched`, `MR / PR` after the checkbox
  column, and the Repository header has `aria-sort="ascending"`
- **AND** the rows of `backend` appear in the order `auth-service`, `Billing-api`, `ledger`

#### Scenario: Groups keep their order under a sort
- **GIVEN** the groups `backend`, `frontend` and `infra`, and the sort is **Sync** descending
- **WHEN** the dashboard shows the grid
- **THEN** the group headers appear in the order `backend`, `frontend`, `infra`
- **AND** each group's rows appear in Sync descending order under its own header

### Requirement: Sort by column
The system SHALL sort the rows when the user clicks the label of a column header (**Repository**, **Branch**, **Sync**,
**Changes**, **Fetched** or **MR / PR**), using the sort key of that column. The first click on a column that is not
the sorted one SHALL sort by it in its first direction; a click on the sorted column in its first direction SHALL
reverse it; a click on the sorted column in its reversed direction SHALL restore the default sort (**Repository**
ascending). Because the default is Repository in its first direction, a click on Repository while the default holds
sorts it descending. Rows whose sort keys are equal SHALL be ordered by repository name
ascending, case-insensitive, in both directions. Sorting MUST NOT change the selection, the filter, the chips, the
collapsed groups or which rows are shown, and a click on the selection column header MUST NOT change the sort.

**Constraints:**
- Sort keys and first directions:
  - **Repository**: the repository name, case-insensitive; first direction ascending (A→Z)
  - **Branch**: the Branch cell text without the `no upstream` badge (`REBASING 3/7`, `detached a1b2c3d`,
    `feature/ABC-12-notes`), case-insensitive; first direction ascending (A→Z)
  - **Sync**: the behind count, then the ahead count, then `⇡ publish` above `—`; a row whose Sync cell is `—` counts 0
    behind and 0 ahead; first direction descending (most behind first)
  - **Changes**: the conflict count, then the number of unstaged, staged and untracked files together, then the stash
    count; first direction descending (most first)
  - **Fetched**: the age of the last fetch, with `never` older than any age; first direction descending (oldest first)
  - **MR / PR**: the cell's rank, from most to least urgent: a review with `✗ failed`; a review with `⟳ running`,
    `◷ pending` or `◷ manual`; a review with `⊘ canceled`; a review with `✓ passed`; a review with no pipeline or
    checks; `Sign in`, `?` or `…`; `—`; first direction descending (most urgent first)
- Rows are sorted by the values they show at the time, also while a value comes from the review cache

#### Scenario: Sort cycle matrix

| # | Sort before | Click on the header | Sort after | Headers after |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Repository ▲ (default) | Sync | **Sync descending** | **`Sync ▼`; `Repository` without arrow** |
| R2 | Sync descending | Sync | **Sync ascending** | **`Sync ▲`** |
| R3 | Sync ascending | Sync | **Repository ascending (default)** | **`Repository ▲`; `Sync` without arrow** |
| R4 | Sync descending | Changes | **Changes descending** | **`Changes ▼`; `Sync` without arrow** |
| R5 | Repository ▲ (default) | Repository | **Repository descending** | **`Repository ▼`** |
| R6 | Repository descending | Repository | **Repository ascending (default)** | **`Repository ▲`** |
| R7 | Repository ▲ (default) | Branch | **Branch ascending** | **`Branch ▲`** |
| R8 | Branch ascending | Branch | **Branch descending** | **`Branch ▼`** |
| R9 | Branch descending | Branch | **Repository ascending (default)** | **`Repository ▲`** |
| R10 | Repository ▲ (default) | Fetched | **Fetched descending** | **`Fetched ▼`** |
| R11 | Repository ▲ (default) | MR / PR | **MR / PR descending** | **`MR / PR ▼`** |
| R12 | Sync descending | The selection column header (its checkbox or around it) | **Sync descending** | **`Sync ▼`** |

#### Scenario: Sort order matrix

Rows of the group `backend` under test:

| Repository | Branch cell | Sync | Changes | Fetched | MR / PR |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `auth-service` | `main` | `—` | `—` | `2 h ⚠` | `—` |
| `billing-api` | `feature/ABC-12-notes` | `↑2` | `●3 +1` | `now` | `!142  Draft  ⟳ running` |
| `ledger` | `REBASING 3/7` | `—` | `⚠ 2 confl` | `never` | `Sign in` |
| `notifications` | `fix/login-timeout` with the badge `no upstream` | `⇡ publish` | `?2 ≡1` | `4 min` | `—` |
| `payments-api` | `main` | `↓4` | `≡2` | `1 d ⚠` | `#311  ✗ failed  changes requested` |

| # | Sort | Rows of `backend`, top to bottom |
| :--- | :--- | :--- |
| R1 | Repository ascending | **`auth-service`, `billing-api`, `ledger`, `notifications`, `payments-api`** |
| R2 | Repository descending | **`payments-api`, `notifications`, `ledger`, `billing-api`, `auth-service`** |
| R3 | Branch ascending | **`billing-api`, `notifications`, `auth-service`, `payments-api`, `ledger`** |
| R4 | Branch descending | **`ledger`, `auth-service`, `payments-api`, `notifications`, `billing-api`** |
| R5 | Sync descending | **`payments-api`, `billing-api`, `notifications`, `auth-service`, `ledger`** |
| R6 | Sync ascending | **`auth-service`, `ledger`, `notifications`, `billing-api`, `payments-api`** |
| R7 | Changes descending | **`ledger`, `billing-api`, `notifications`, `payments-api`, `auth-service`** |
| R8 | Changes ascending | **`auth-service`, `payments-api`, `notifications`, `billing-api`, `ledger`** |
| R9 | Fetched descending | **`ledger`, `payments-api`, `auth-service`, `notifications`, `billing-api`** |
| R10 | Fetched ascending | **`billing-api`, `notifications`, `auth-service`, `payments-api`, `ledger`** |
| R11 | MR / PR descending | **`payments-api`, `billing-api`, `ledger`, `auth-service`, `notifications`** |
| R12 | MR / PR ascending | **`auth-service`, `notifications`, `ledger`, `billing-api`, `payments-api`** |

#### Scenario: Sorting keeps selection, filter and focus
- **GIVEN** the filter text `a`, the Dirty chip active, `billing-api` and `ledger` selected, and the focus on
  `billing-api`
- **WHEN** the user clicks the **Changes** header
- **THEN** the filter box still reads `a`, the Dirty chip is still active and the footer still reads `2 selected`
- **AND** the focus is still on `billing-api`

#### Scenario: A row moves when its sort key changes
- **GIVEN** the sort is **Sync** descending, `payments-api` (`↓4`) is the first row of `backend`, `ledger` shows `—`,
  and the focus is on `payments-api`
- **WHEN** a fetch in `ledger` makes its Sync cell read `↓6`
- **THEN** within 1 s `ledger` is the first row of `backend` and `payments-api` the second
- **AND** the focus is still on `payments-api` and the selection is unchanged

### Requirement: Sort from the keyboard
The system SHALL move keyboard focus to the header of the sorted column when the user presses `S` while the grid has
focus. While a column header has focus, `←` and `→` SHALL move focus to the previous or next sortable column header,
`Enter` or `Space` SHALL act as a click on the focused header (**Sort by column**), and `↓` or `Esc` SHALL move focus
back to the row or group header that had it before `S`, leaving the filter text, the chips and the selection unchanged.
The key help overlay SHALL list `S` with the text `Sort by a column (then ← → and Enter)`.

#### Scenario: Header key matrix

| # | Key | State before | Result |
| :--- | :--- | :--- | :--- |
| R1 | `S` | Focus on the row `ledger`, sort Repository ascending | **Focus on the `Repository ▲` header** |
| R2 | `S` | Focus on the row `ledger`, sort Changes descending | **Focus on the `Changes ▼` header** |
| R3 | `→` | Focus on the Repository header | **Focus on the Branch header** |
| R4 | `→` | Focus on the MR / PR header | **Focus unchanged** |
| R5 | `←` | Focus on the Repository header | **Focus unchanged** |
| R6 | `Enter` | Focus on the Sync header, sort Repository ascending | **Sort Sync descending; focus stays on `Sync ▼`** |
| R7 | `Space` | Focus on the `Sync ▼` header | **Sort Sync ascending; focus stays on `Sync ▲`** |
| R8 | `↓` | Focus on a header, reached with `S` from the row `ledger` | **Focus on the row `ledger`** |
| R9 | `Esc` | Focus on a header, reached with `S` from the row `ledger`, filter text `bill`, 2 selected | **Focus on the row `ledger`; filter text `bill`, 2 still selected** |
| R10 | `S` | Focus in the filter box with text `bil` | **Filter text `bilS`, focus unchanged** |
| R11 | `↓` | Focus on a header, reached with `S` from a row that is no longer shown (its group was collapsed with the mouse) | **Focus on the first shown row or group header** |

### Requirement: Sort remembered per workspace
The system SHALL remember the chosen sort column and direction for the workspace in workspace state, restore it when
the dashboard opens and after a window reload, and keep it when the grouping mode changes. Choosing a sort MUST NOT
write any setting.

#### Scenario: Sort kept across a reload and a reopen
- **GIVEN** the user sorted by **Fetched** descending
- **WHEN** the user reloads the window
- **THEN** the header reads `Fetched ▼` and the rows are in Fetched descending order
- **AND WHEN** the user closes the dashboard and runs `repohangar.open`
- **THEN** the header still reads `Fetched ▼`

#### Scenario: Sort kept when the grouping changes
- **GIVEN** the sort is **Changes** descending and the Group menu reads `Folder`
- **WHEN** the user picks `None` in the Group menu
- **THEN** the grid has no group headers and every row is in Changes descending order
- **AND** no setting is written

### Requirement: Group selection
The system SHALL show, in the selection column of every group header, a checkbox over the rows that header counts (the
rows of the group that match the filter text and every active chip, also while the group is collapsed). The checkbox
SHALL be checked when every one of those rows is selected, mixed (`aria-checked="mixed"`, drawn as `−`) when some are,
and unchecked when none are. A click on it, or `Space` on the focused group header, SHALL select every one of those
rows when the checkbox is unchecked or mixed, and SHALL clear every one of them when it is checked. It MUST NOT change
the selection of rows in other groups or of rows the filters hide, MUST NOT collapse or expand the group, and MUST NOT
move the focus. A click on the group name still collapses or expands the group. The checkbox's accessible name SHALL be
`Select group <group>`. The key help overlay SHALL list `Space` with the text `Select or clear the focused row, or every
row of the focused group`.

#### Scenario: Group checkbox matrix

Group under test: `backend` holds `auth-service`, `billing-api`, `ledger`, `notifications` and `payments-api`. Rows in
other groups are not selected.

| # | Filter text | Group collapsed | Rows `backend` counts | Of them selected before | Selected rows of `backend` the filter hides | Checkbox before | After a click or `Space` on the header | Checkbox after | Footer after |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Empty | No | 5 | 0 | 0 | **Unchecked** | **All 5 selected** | **Checked** | **`5 selected`** |
| R2 | Empty | No | 5 | 2 | 0 | **Mixed `−`** | **All 5 selected** | **Checked** | **`5 selected`** |
| R3 | Empty | No | 5 | 5 | 0 | **Checked** | **None of the 5 selected** | **Unchecked** | **Hidden** |
| R4 | Empty | Yes | 5 | 0 | 0 | **Unchecked** | **All 5 selected; header still `▸ backend (5)`** | **Checked** | **`5 selected`** |
| R5 | `api` | No | 2 (`billing-api`, `payments-api`) | 0 | 1 (`ledger`) | **Unchecked** | **`billing-api` and `payments-api` selected; `ledger` still selected** | **Checked** | **`3 selected`** |
| R6 | `api` | No | 2 (`billing-api`, `payments-api`) | 2 | 1 (`ledger`) | **Checked** | **`billing-api` and `payments-api` not selected; `ledger` still selected** | **Unchecked** | **`1 selected`** |

#### Scenario: Group checkbox leaves other groups alone
- **GIVEN** the group `frontend` counts `checkout-ui` and `web-shop`, `web-shop` is selected, and no row of `backend` is
  selected
- **WHEN** the user clicks the checkbox of the `backend` header
- **THEN** every row `backend` counts is selected, `web-shop` is still selected and `checkout-ui` is not
- **AND** the `frontend` header checkbox is still mixed `−`

#### Scenario: Group name click still collapses
- **GIVEN** the group `infra` is expanded and none of its rows is selected
- **WHEN** the user clicks the text `▾ infra (7)` of its header
- **THEN** the header reads `▸ infra (7)` and its checkbox is still unchecked
- **AND** the footer is hidden

#### Scenario: Selection changes update the group checkbox
- **GIVEN** the group `backend` counts 5 rows and its checkbox is checked
- **WHEN** the user presses `Space` on the row `ledger`
- **THEN** `ledger` is not selected and the `backend` checkbox is mixed `−`

### Requirement: Select all matching rows from the column header
The system SHALL show a checkbox in the header of the selection column over every row that matches the filter text and
every active chip, also in collapsed groups. It SHALL be checked when every one of those rows is selected, mixed
(`aria-checked="mixed"`, drawn as `−`) when some are, unchecked when none are, and disabled when no row matches. A click
SHALL select every one of those rows when it is unchecked or mixed, and SHALL clear every one of them when it is
checked, leaving the selection of rows the filters hide unchanged. Its accessible name SHALL be
`Select all matching repositories`.

#### Scenario: Select-all checkbox matrix

Workspace under test: 14 repositories.

| # | Filter text | Rows that match | Of them selected before | Selected rows the filter hides | Checkbox before | After a click | Footer after |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Empty | 14 | 0 | 0 | **Unchecked** | **All 14 selected** | **`14 selected`** |
| R2 | Empty | 14 | 5 | 0 | **Mixed `−`** | **All 14 selected** | **`14 selected`** |
| R3 | Empty | 14 | 14 | 0 | **Checked** | **None selected** | **Hidden** |
| R4 | `bill` | 2 | 0 | 1 | **Unchecked** | **The 2 matching rows selected; the hidden one still selected** | **`3 selected`** |
| R5 | `bill` | 2 | 2 | 1 | **Checked** | **The 2 matching rows not selected; the hidden one still selected** | **`1 selected`** |
| R6 | `zzz` | 0 | 0 | 3 | **Disabled** | **Selection unchanged** | **`3 selected`** |
| R7 | Empty, the group `infra` (7 rows) collapsed | 14 | 0 | 0 | **Unchecked** | **All 14 selected, the 7 of `infra` included** | **`14 selected`** |

### Requirement: Range selection with Shift+click
The system SHALL keep a selection anchor: the last row whose checkbox the user clicked without Shift or whose
selection the user toggled with `Space`. A Shift+click on a row's checkbox SHALL select every row shown in the grid
from the anchor through the clicked row, in the grid's current order, skipping group headers and the rows of collapsed
groups, and leaving the anchor where it was. Shift+click MUST NOT clear any selected row. When there is no anchor, or
the anchor row is not shown in the grid, a Shift+click SHALL toggle only the clicked row and make it the anchor.

#### Scenario: Range selection matrix

Grid under test, top to bottom: header `backend` with `auth-service`, `billing-api`, `ledger`, `notifications`; header
`infra`, collapsed, with 7 rows; header `tools` with `scratch`. No other row is selected unless stated.

| # | Anchor | Shift+click on the checkbox of | Selected before | Selected after | Anchor after |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | None | `ledger` | None | **`ledger`** | **`ledger`** |
| R2 | `billing-api` | `notifications` | `billing-api` | **`billing-api`, `ledger`, `notifications`** | **`billing-api`** |
| R3 | `notifications` | `auth-service` | `notifications` | **`auth-service`, `billing-api`, `ledger`, `notifications`** | **`notifications`** |
| R4 | `billing-api` | `scratch` | `billing-api` | **`billing-api`, `ledger`, `notifications`, `scratch`; no row of `infra`** | **`billing-api`** |
| R5 | `billing-api` | `notifications` | `billing-api`, `notifications` | **`billing-api`, `ledger`, `notifications`** | **`billing-api`** |
| R6 | `billing-api`, set by `Space` and then deselected | `ledger` | None | **`billing-api`, `ledger`** | **`billing-api`** |
| R7 | `ledger`, now hidden by the filter text `api` | `billing-api` | `ledger` | **`billing-api`, `ledger`** | **`billing-api`** |
