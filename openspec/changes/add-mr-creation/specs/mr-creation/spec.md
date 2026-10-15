## Purpose

Creates the merge request (GitLab) or pull request (GitHub) of a repository's current branch in one step with the
values of its MR profile: it opens an existing one instead of a duplicate, stops with a fix button when the branch is
not ready, pushes the branch when needed, sends every value in the provider's create requests, reports what was
applied, and offers Undo.

**Non-goals:**
- Which values a merge request gets (profiles, rules, templates, squash policy), owned by `mr-profiles`.
- The review state, the MR / PR cell text and Open MR, owned by `hosting-providers`; credentials, owned by
  `provider-auth`.
- Merging, approving or reviewing merge requests: no capability does (D21).
- Merge requests for several repositories at once, auto-merge, deleting a GitHub branch after merge, saving defaults
  from the drawer and recent reviewers: no capability yet (roadmap phase 3).

## ADDED Requirements

### Requirement: Create entry points
The triggers of create with defaults are `m` on the focused row while no row is selected, the **[Create MR]** button of
the MR / PR cell, the **Create MR** hover button (`⤴`), the command `repohangar.mr.create` (*RepoHangar: Create Merge
Request (Defaults)*, on the active repository of `git-operations`, default keybinding `Ctrl+Alt+M`, `Ctrl+Cmd+M` on
macOS), and the item **Create MR** of the Source Control Repositories menu and of the Explorer **RepoHangar** submenu.
They SHALL act as `repohangar.mr.quickCreate` (default `"drawer"`) says: `"drawer"` SHALL open the Create MR drawer,
pre-filled with the resolved values, opening the dashboard first when it is closed; `"confirm"` SHALL show the quick
create input; `"direct"` SHALL create the merge request with the resolved defaults and no dialog. The system SHALL open
the Create MR drawer from `M` on the focused row, the command `repohangar.mr.createEdit` (*RepoHangar: Create Merge
Request…*, default keybinding `Ctrl+Alt+Shift+M`, `Ctrl+Cmd+Shift+M` on macOS) and the item **Create MR…** of both
menus, whatever the setting, opening the dashboard first when it is closed.

#### Scenario: Entry point matrix

| # | Trigger | `repohangar.mr.quickCreate` | Result |
| :--- | :--- | :--- | :--- |
| R1 | `m` on the focused row, no row selected | `"direct"` | **Create with defaults, no dialog** |
| R2 | `Ctrl+Alt+M` in an editor of a file in `billing-api` | `"direct"` | **Create with defaults for `billing-api`, no dialog** |
| R3 | **Create MR** in the Source Control Repositories menu of `ledger` | `"direct"` | **Create with defaults for `ledger`, no dialog** |
| R4 | `m` on the focused row, no row selected | `"confirm"` | **The quick create input** |
| R5 | `Ctrl+Alt+M` in an editor | `"confirm"` | **The quick create input** |
| R6 | **[Create MR]** in the MR / PR cell | `"direct"` | **Create with defaults, no dialog** |
| R7 | `M` on the focused row | *Any* | **The drawer** |
| R8 | `Ctrl+Alt+Shift+M` with the dashboard closed | *Any* | **The dashboard opens with the drawer for the active repository** |
| R9 | `m` on the focused row, no row selected | `"drawer"` | **The drawer, pre-filled; no request** |
| R10 | **[Create MR]** in the MR / PR cell | `"drawer"` | **The drawer, pre-filled; no request** |
| R11 | `Ctrl+Alt+M` with the dashboard closed | `"drawer"` | **The dashboard opens with the drawer for the active repository; no request** |
| R12 | **[Create MR]** in the MR / PR cell | `"confirm"` | **The quick create input** |

### Requirement: Existing review opens instead
Before creating through the provider API, the system SHALL send one review request for the repository (`hosting-providers`) and, when the branch
has an open merge request or pull request, SHALL open it in the browser and show `<!142|#311> already exists for
<branch> in <repository>.` with **Copy link**, without pushing or creating anything. A create request that the
provider answers as a duplicate SHALL be handled the same way.

#### Scenario: Existing review matrix

| # | Fresh review request | Create request | Pushed | Opened URL | Notification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `!142` open | **Not sent** | **No** | **`https://git.acme.com/payments/billing-api/-/merge_requests/142`** | **`!142 already exists for feature/ABC-12-notes in billing-api.` with `Copy link`** |
| R2 | None open | GitLab `409` `Another open merge request already exists for this source branch: !142` | **As the guards decide** | **`https://git.acme.com/payments/billing-api/-/merge_requests/142`** | **`!142 already exists for feature/ABC-12-notes in billing-api.` with `Copy link`** |
| R3 | None open | GitHub `422` `A pull request already exists for acme:feature/ABC-12-notes.`, and the next review request returns `#311` | **As the guards decide** | **`https://github.com/acme/web-shop/pull/311`** | **`#311 already exists for feature/ABC-12-notes in web-shop.` with `Copy link`** |

### Requirement: Create guards
The system SHALL check, in row order, the repository state before any push or create request, and SHALL stop with the
notification of the matrix, sending no request and starting no push, in every row whose result is **Stopped**. With
uncommitted changes, it SHALL create the merge request and add the warning of the matrix. A GitLab host without a token SHALL follow `GitLab without a token` instead of stopping. A fix button SHALL run its
action on the same repository; **Sign In…** SHALL continue the creation after a successful sign-in.

**Constraints:**
- Commits ahead of the target: `git rev-list --count refs/remotes/<remote>/<target>..HEAD`, local, no network
- The guards run on the state after the review request; no fetch runs

#### Scenario: Guard matrix

| # | Operation in progress | HEAD | Provider | Credential | On the target | Commits ahead of the target | Upstream | Working tree | Result | Notification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Rebase (merge, cherry-pick, revert alike) | *Any* | *Any* | *Any* | *Any* | *Any* | *Any* | *Any* | **Stopped** | **`Finish the rebase in billing-api first.`** |
| R2 | None | Detached | *Any* | *Any* | *N/A* | *N/A* | *N/A* | *Any* | **Stopped** | **`billing-api is not on a branch.`** |
| R3 | None | Branch | None or `unknown` | *N/A* | *N/A* | *N/A* | *N/A* | *Any* | **Stopped** | **`billing-api is not on a known GitLab or GitHub host.`** |
| R4 | None | Branch | `github` | None | *N/A* | *N/A* | *N/A* | *Any* | **Stopped until sign-in** | **`Sign in to github.com to create pull requests.` with `Sign In…`** |
| R5 | None | Branch | `gitlab` | None | *N/A* | *N/A* | *N/A* | *Any* | **As `GitLab without a token` states** | **As `GitLab without a token` states** |
| R6 | None | `main` | `gitlab` | Yes | Yes (`main`) | *N/A* | *Any* | *Any* | **Stopped** | **`You're on main. Create a branch for your changes first.` with `Create Branch…`** |
| R7 | None | `feature/ABC-12-notes` | `gitlab` | Yes | No | 0 | *Any* | *Any* | **Stopped** | **`Nothing to merge into main from feature/ABC-12-notes.`** |
| R8 | None | `feature/ABC-12-notes` | `gitlab` | Yes | No | ≥ 1 | Behind by 2 | *Any* | **Stopped** | **`The remote branch of billing-api has 2 commits you don't have.` with `Pull`** |
| R9 | None | `feature/ABC-12-notes` | `gitlab` | Yes | No | ≥ 1 | Level, or none | Dirty, 3 files | **Created** | **`3 uncommitted files are not in the merge request.` with `Open Source Control`, after the result** |
| R10 | None | `feature/ABC-12-notes` | `gitlab` | Yes | No | ≥ 1 | Level, or none | Clean | **Created** | **The result only** |

#### Scenario: Sign in continues the creation
- **GIVEN** `web-shop` on `feature/ABC-12-notes` is 3 commits ahead of `main` and `github.com` has no credential
- **WHEN** the user presses `m` on its row
- **AND WHEN** the user clicks `Sign In…` and completes VS Code's GitHub sign-in
- **THEN** the pull request is created without a further key press

#### Scenario: Create a branch from the target guard
- **GIVEN** the notification `You're on main. Create a branch for your changes first.` is shown for `billing-api`
- **WHEN** the user clicks `Create Branch…`
- **THEN** the command `git.branch` runs with the repository `billing-api`

### Requirement: Push before create
When the branch has no upstream, or is ahead of its upstream, the system SHALL push it before the create request
through the Git extension API, with `repository.push(<chosen remote>, <branch>, true)` for a branch without upstream and
`repository.push()` otherwise, when the effective `pushIfNeeded` is `true`, and SHALL stop with
`feature/ABC-12-notes is not pushed to origin. Push it, or set "pushIfNeeded": true in the MR profile.` and the button
`Push` when it is `false`. A failed push SHALL stop the creation with `Push failed in <repository>: <message>` and
`Show Git Output`, sending no create request.

#### Scenario: Push matrix

| # | Upstream | Ahead of the upstream | `pushIfNeeded` | Git | Create request | Result text |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | None | *N/A* | `true` | **`repository.push('origin', 'feature/ABC-12-notes', true)`** | **Sent after the push** | **`(pushed 2 commits)`** |
| R2 | Yes | 2 | `true` | **`repository.push()`** | **Sent after the push** | **`(pushed 2 commits)`** |
| R3 | Yes | 0 | *Any* | **No push** | **Sent** | **No push note** |
| R4 | None | *N/A* | `false` | **No push** | **Not sent** | **`feature/ABC-12-notes is not pushed to origin. Push it, or set "pushIfNeeded": true in the MR profile.` with `Push`** |
| R5 | None | *N/A* | `true`, the push fails with `Permission denied (publickey)` | **`repository.push('origin', 'feature/ABC-12-notes', true)`** | **Not sent** | **`Push failed in billing-api: Permission denied (publickey)` with `Show Git Output`** |

#### Scenario: One keystroke on an unpublished branch
- **GIVEN** `billing-api` on `git.acme.com` is on `feature/ABC-12-notes` with 2 commits ahead of `main` and no upstream
- **AND** the host has a token, the review request finds no open merge request, and the profile `default` has
  `reviewers` `["ana.perez", "luis.gomez"]`, `labels` `["needs-review"]`, `squash` `true` and `deleteSourceBranch` `true`
- **WHEN** the user presses `m` on the row
- **THEN** `repository.push('origin', 'feature/ABC-12-notes', true)` runs
- **AND THEN** one `POST https://git.acme.com/api/v4/projects/payments%2Fbilling-api/merge_requests` request is sent with
  `source_branch` `feature/ABC-12-notes`, `target_branch` `main`, both reviewers' IDs in `reviewer_ids`, `labels`
  `needs-review`, `squash` `true` and `remove_source_branch` `true`
- **AND** no dialog, quick input or drawer opens before the result notification

### Requirement: GitLab create request
The system SHALL create a GitLab merge request with one
`POST /api/v4/projects/<URL-encoded project path>/merge_requests` carrying `source_branch`, `target_branch`, `title`
(prefixed with `Draft: ` when `draft` is `true`), `description`, `assignee_ids`, `reviewer_ids`, `labels` (joined with
`,`), `squash` and `remove_source_branch`, leaving out `assignee_ids`, `reviewer_ids` and `labels` when empty.

#### Scenario: GitLab payload matrix

| # | `draft` | `squash` (effective) | `deleteSourceBranch` | `labels` | Payload fields |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `false` | `true` | `true` | `["needs-review", "payments"]` | **`title` `feat: ABC-12 Add billing notes`, `squash` `true`, `remove_source_branch` `true`, `labels` `needs-review,payments`** |
| R2 | `true` | `false` | `false` | `[]` | **`title` `Draft: feat: ABC-12 Add billing notes`, `squash` `false`, `remove_source_branch` `false`, no `labels`** |

### Requirement: GitHub create requests
The system SHALL create a GitHub pull request with `POST /repos/<owner>/<repo>/pulls` carrying `title`, `head` (the
branch), `base` (the target), `body` and `draft`, and then, in parallel and only for non-empty lists,
`POST /repos/<owner>/<repo>/pulls/<number>/requested_reviewers` with `reviewers` and `team_reviewers`,
`POST /repos/<owner>/<repo>/issues/<number>/assignees` with `assignees`, and
`POST /repos/<owner>/<repo>/issues/<number>/labels` with `labels`. A failure of one of the follow-up requests SHALL
keep the pull request and report what was not applied in the result.

#### Scenario: GitHub follow-up matrix

| # | `reviewers` | `assignees` | `labels` | Requests after the create | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `["luis.gomez", "team:frontend"]` | `["@me"]` (`ana.perez`) | `["frontend"]` | **`requested_reviewers` with `reviewers` `["luis.gomez"]` and `team_reviewers` `["frontend"]`; `assignees` `["ana.perez"]`; `labels` `["frontend"]`** | **`Created #311 in web-shop: reviewers luis.gomez, team:frontend · labels frontend`** |
| R2 | `[]` | `[]` | `[]` | **None** | **`Created #311 in web-shop`** |
| R3 | `["luis.gomez"]` | `[]` | `["frontend"]`, the labels request answered `422` | **`requested_reviewers`; `labels`** | **`Created #311 in web-shop: reviewers luis.gomez`, then the warning `Labels were not added to #311: <message>`** |

### Requirement: Reviewers and assignees
The system SHALL read reviewers and assignees as usernames, replace `@me` with the current user of the host, remove the
author from the reviewers, send `team:<slug>` entries to GitHub as team reviewers and leave them out on GitLab, and
resolve GitLab usernames to user IDs with `GET /api/v4/users?username=<name>`, keeping each ID in `globalState` per
host. A username that cannot be resolved SHALL NOT stop the creation. After a GitLab create, the system SHALL compare
the reviewers and assignees in the answer with the ones sent and report the difference. When GitLab answers the create
request with an error about the number of reviewers or assignees, the system SHALL send it again with the first
reviewer and the first assignee only, and SHALL remember the host as single-reviewer in `globalState`, so later
requests to it send only the first of each and report the others.

#### Scenario: Reviewer resolution matrix

| # | Host | Reviewers in the profile | Author | Host answers | Sent | Notification after the result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `git.acme.com` (Premium) | `["ana.perez", "luis.gomez"]` | `carla.ruiz` | Both applied | **`reviewer_ids` of both** | **None** |
| R2 | `git.acme.com` | `["@me", "luis.gomez"]` | `ana.perez` | Applied | **`reviewer_ids` of `luis.gomez`** | **None** |
| R3 | `git.acme.com` | `["team:sre", "luis.gomez"]` | `ana.perez` | Applied | **`reviewer_ids` of `luis.gomez`** | **`team:sre is a GitHub team and was not added on git.acme.com.`** |
| R4 | `git.acme.com` | `["jdoe", "luis.gomez"]`, `jdoe` unknown | `ana.perez` | Applied | **`reviewer_ids` of `luis.gomez`** | **`Reviewer jdoe not found on git.acme.com.` with `Open Settings`** |
| R5 | `git.acme.com` (Free) | `["ana.perez", "luis.gomez"]` | `carla.ruiz` | The answer lists only `ana.perez` | **`reviewer_ids` of both** | **`GitLab Free allows one reviewer: ana.perez added, luis.gomez not added.`** |
| R6 | `git.acme.com` (Free) | `["ana.perez", "luis.gomez"]` | `carla.ruiz` | `400` about the number of reviewers | **Again with `reviewer_ids` of `ana.perez`; host remembered as single-reviewer** | **`GitLab Free allows one reviewer: ana.perez added, luis.gomez not added.`** |
| R7 | `git.acme.com`, remembered as single-reviewer | `["ana.perez", "luis.gomez"]` | `carla.ruiz` | Applied | **`reviewer_ids` of `ana.perez`** | **`GitLab Free allows one reviewer: ana.perez added, luis.gomez not added.`** |
| R8 | `github.com` | `["@me", "luis.gomez"]` | `ana.perez` | Applied | **`reviewers` `["luis.gomez"]`** | **None** |
| R9 | `github.com` | `["jdoe"]`, `jdoe` unknown (`422`) | `ana.perez` | `422` on `requested_reviewers` | **`reviewers` `["jdoe"]`** | **`Reviewer jdoe not found on github.com.` with `Open Settings`** |

#### Scenario: GitLab user IDs resolved once
- **GIVEN** `globalState` holds no user ID for `luis.gomez` on `git.acme.com`
- **WHEN** the user creates two merge requests on `git.acme.com` with `luis.gomez` as reviewer, one after the other
- **THEN** `GET https://git.acme.com/api/v4/users?username=luis.gomez` is sent once

### Requirement: Create failures
The system SHALL report a create request that the provider rejects for another reason with the job result
`failed: <message>` and the notification of the matrix, leaving the pushed branch as it is.

#### Scenario: Create failure matrix

| # | Provider | Answer | Notification |
| :--- | :--- | :--- | :--- |
| R1 | GitLab | `403` | **`git.acme.com did not allow creating the merge request (403). The token needs the api scope.` with `Sign In…`** |
| R2 | GitLab | `422` `{"message":["Target branch release/3.0 does not exist"]}` | **`Creating the merge request failed in billing-api: Target branch release/3.0 does not exist` with `Open Settings`** |
| R3 | GitHub | `422` `{"message":"Validation Failed","errors":[{"message":"No commits between main and feature/x"}]}` | **`Creating the pull request failed in web-shop: No commits between main and feature/x`** |
| R4 | *Any* | No answer within 15 s | **`Creating the merge request failed in billing-api: timed out after 15 s`** |

### Requirement: Result notification
After a creation the system SHALL show `Created <!iid|#number> in <repository>`, followed by ` (pushed <n> commits)`
when it pushed and by `: ` and the applied values (`reviewers <names>`, `labels <names>`, `squash`, `delete branch`,
`draft`) joined with ` · `, with the buttons **Open MR** (or **Open PR**), **Copy link** and **Undo**, and SHALL queue a
review request for the repository. `openAfterCreate` (`"notify"` by default) SHALL decide what else happens.

**Constraints:**
- `openAfterCreate`: `"notify"` shows the notification; `"browser"` also opens the review in the browser; `"none"` shows
  only the status bar message `Created <ref> in <repository>` for 5 s, with no Undo

#### Scenario: Result text matrix

| # | Provider | Pushed | Applied values | `openAfterCreate` | Notification | Browser |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | GitLab | 2 commits | reviewers `ana.perez`, `carla.ruiz`, squash, delete branch | `"notify"` | **`Created !142 in billing-api (pushed 2 commits): reviewers ana.perez, carla.ruiz · squash · delete branch` with `Open MR`, `Copy link`, `Undo`** | **Not opened** |
| R2 | GitHub | No | draft | `"browser"` | **`Created #311 in web-shop: draft` with `Open PR`, `Copy link`, `Undo`** | **`https://github.com/acme/web-shop/pull/311` opened** |
| R3 | GitLab | No | None | `"none"` | **None; status bar message `Created !143 in ledger`** | **Not opened** |

### Requirement: Undo
The **Undo** button SHALL close the merge request or pull request it created, with
`PUT /api/v4/projects/<id>/merge_requests/<iid>` and `state_event` `close` on GitLab or
`PATCH /repos/<owner>/<repo>/pulls/<number>` with `state` `closed` on GitHub, when it is clicked within 30 s of the
result, and SHALL show `Closed <ref>. The branch <branch> was kept.` The pushed branch, local or remote, SHALL stay
unchanged. A click after 30 s SHALL send no request and show `Undo is no longer available for <ref>.` with
`Open MR` (or `Open PR`).

**Constraints:**
- Undo window: 30 s from the result notification

#### Scenario: Undo within 30 seconds
- **GIVEN** the notification `Created !142 in billing-api (pushed 2 commits): …` appeared 12 s ago
- **WHEN** the user clicks `Undo`
- **THEN** `PUT https://git.acme.com/api/v4/projects/payments%2Fbilling-api/merge_requests/142` is sent with
  `state_event` `close`
- **AND** the notification reads `Closed !142. The branch feature/ABC-12-notes was kept.`
- **AND** `refs/remotes/origin/feature/ABC-12-notes` and the local branch are unchanged

#### Scenario: Undo after 30 seconds
- **GIVEN** the notification `Created #311 in web-shop` appeared 40 s ago
- **WHEN** the user clicks `Undo`
- **THEN** no request is sent and the notification reads `Undo is no longer available for #311.` with `Open PR`

### Requirement: GitLab without a token
For a GitLab host, the system SHALL choose how to create the merge request from `repohangar.gitlab.usePushOptions`
(default `"whenNoToken"`) and whether the host has a token, as the matrix states. On the push-options path it SHALL
still apply the guards R6–R10 of `Create guards`, SHALL send no review request and no API request, and SHALL treat a
branch that is already pushed and level with its upstream as not creatable that way.

#### Scenario: GitLab path matrix

| # | Token for the host | `repohangar.gitlab.usePushOptions` | Branch state after the guards | Path | Notification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Yes | `"whenNoToken"` | *Any* | **API (`GitLab create request`)** | **The result** |
| R2 | Yes | `"never"` | *Any* | **API** | **The result** |
| R3 | No | `"never"` | *Any* | **Stopped, no `git` process started** | **`Sign in to git.acme.com to create merge requests.` with `Sign In…`** |
| R4 | No | `"whenNoToken"` | No upstream, or ahead of it | **Push options** | **The push-options result** |
| R5 | Yes | `"always"` | No upstream, or ahead of it | **Push options** | **The push-options result** |
| R6 | No | `"whenNoToken"` | Level with its upstream | **Stopped, no `git` process started** | **`feature/ABC-12-notes is already pushed, so GitLab cannot create the merge request during a push. Sign in to git.acme.com to create it.` with `Sign In…`** |

### Requirement: Push options
On the push-options path the system SHALL run `git push --set-upstream <remote> <branch>` itself, with
`-o merge_request.create`, `-o merge_request.target=<target>` and `-o merge_request.title=<title>`, and, from the
resolved values, `-o merge_request.description=<description>` when the description has no line break,
`-o merge_request.draft` when `draft` is `true`, one `-o merge_request.label=<label>` per label,
`-o merge_request.assign=<username>` for the first assignee, `-o merge_request.squash` when `squash` is `true`, and
`-o merge_request.remove_source_branch` when `deleteSourceBranch` is `true`. It SHALL read the merge request URL from
the `remote:` lines of the push output and show
`Pushed <n> commits; GitLab reports <!iid> for <branch> in <repository>` followed by
` without reviewers (<names>)` when the profile has reviewers and ` · description not set (push options take one line)`
when the description was left out, with the buttons **Open MR**, **Copy link** and **Connect `<host>`**, and no Undo.

**Constraints:**
- `git push` runs through `execFile` with an argument array, no shell, `GIT_TERMINAL_PROMPT=0`, in the repository root,
  with the timeout `repohangar.fetchTimeoutSeconds` (default `60`); it uses the system credential helper or SSH agent,
  not VS Code's askpass
- `@me` as assignee is left out on this path (the user is unknown without a token)

#### Scenario: Push option matrix

| # | Resolved value | Push option |
| :--- | :--- | :--- |
| R1 | Create | **`-o merge_request.create`** |
| R2 | `target` `main` | **`-o merge_request.target=main`** |
| R3 | `title` `feat: ABC-12 Add billing notes` | **`-o merge_request.title=feat: ABC-12 Add billing notes`** |
| R4 | `description` `Ticket ABC-12` | **`-o merge_request.description=Ticket ABC-12`** |
| R5 | `description` with line breaks | **None; result note `description not set (push options take one line)`** |
| R6 | `draft` `true` | **`-o merge_request.draft`** |
| R7 | `labels` `["needs-review", "payments"]` | **`-o merge_request.label=needs-review -o merge_request.label=payments`** |
| R8 | `assignees` `["carla.ruiz", "luis.gomez"]` | **`-o merge_request.assign=carla.ruiz`** |
| R9 | `assignees` `["@me"]` | **None** |
| R10 | `squash` `true` | **`-o merge_request.squash`** |
| R11 | `deleteSourceBranch` `true` | **`-o merge_request.remove_source_branch`** |
| R12 | `reviewers` `["ana.perez", "luis.gomez"]` | **None; result note `without reviewers (ana.perez, luis.gomez)`** |

#### Scenario: Push-options result
- **GIVEN** `billing-api` on `git.acme.com` has no token, `repohangar.gitlab.usePushOptions` is `"whenNoToken"`, and
  `feature/ABC-12-notes` has no upstream and 2 commits ahead of `main`
- **AND** the profile has reviewers `ana.perez` and `luis.gomez` and a one-line description
- **WHEN** the user presses `m` on the row
- **AND WHEN** the push output contains `remote:   https://git.acme.com/payments/billing-api/-/merge_requests/142`
- **THEN** the notification reads
  `Pushed 2 commits; GitLab reports !142 for feature/ABC-12-notes in billing-api without reviewers (ana.perez, luis.gomez)`
  with `Open MR`, `Copy link` and `Connect git.acme.com`
- **AND** the MR / PR cell of `billing-api` reads `!142` with the tooltip
  `Created during the push. Sign in to git.acme.com to see its status.`

#### Scenario: Push rejected for authentication
- **GIVEN** the push-options path for `billing-api` and no credential helper or SSH key that `git.acme.com` accepts
- **WHEN** `git push` exits with `fatal: Authentication failed for 'https://git.acme.com/payments/billing-api.git/'`
- **THEN** no merge request request is sent and the notification reads
  `Push failed in billing-api: fatal: Authentication failed for 'https://git.acme.com/payments/billing-api.git/'` with
  `Connect git.acme.com` and `Show Output`

### Requirement: Reviewers after connecting
**Connect `<host>`** in a push-options result SHALL start the sign-in of that host (`provider-auth`) and, after a
successful sign-in, SHALL add the profile's reviewers and, when there were several, the other assignees to that merge
request with one `PUT /api/v4/projects/<id>/merge_requests/<iid>` carrying `reviewer_ids` and `assignee_ids`, and
SHALL report the result as `Reviewers and assignees` reports it.

#### Scenario: Add the reviewers after connecting
- **GIVEN** the notification `Pushed 2 commits; GitLab reports !142 … without reviewers (ana.perez, luis.gomez)` is shown
- **WHEN** the user clicks `Connect git.acme.com` and pastes a token that the host accepts
- **THEN** one `PUT https://git.acme.com/api/v4/projects/payments%2Fbilling-api/merge_requests/142` request is sent with
  the user IDs of `ana.perez` and `luis.gomez` in `reviewer_ids`
- **AND** the MR / PR cell of `billing-api` shows the review values loaded with the new token

### Requirement: Create MR drawer
The drawer SHALL open on the right of the dashboard, titled `Create merge request — <repository>` (`Create pull
request — <repository>` on GitHub), with the grid still usable, and SHALL show, pre-filled with the resolved values:
**Profile** (a list of the profiles, with `(rule <n>: <glob>)` when a rule chose it), **Source** (the branch, its
ahead count and `will push first` when a push is needed), **Target** (a list of the remote branches, with the number
of commits ahead of it), **Title**, **Description**, **Reviewers**, **Assignees** and **Labels** (removable chips and an
add field that suggests users), the boxes **Squash commits**, **Delete source branch** and **Draft**, the squash policy
note and the guard warnings. **Create** (`Ctrl+Enter`) SHALL create with the values shown; **Cancel** and `Esc` SHALL
close it with no request. Choosing another profile SHALL resolve the values again and keep the fields the user edited.

**Constraints:**
- User suggestions: GitLab `GET /api/v4/projects/<id>/members/all?query=<text>`, GitHub
  `GET /repos/<owner>/<repo>/assignees` filtered locally; at most one request per 300 ms of typing

#### Scenario: Drawer actions matrix

| # | Action in the drawer | Requests | Drawer after |
| :--- | :--- | :--- | :--- |
| R1 | `Ctrl+Enter` with the title edited to `feat: ABC-12 Notes on invoices` | **Create with that title and the other values shown** | **Closed; the result notification appears** |
| R2 | `Esc` | **None** | **Closed** |
| R3 | **Cancel** | **None** | **Closed** |
| R4 | Profile changed from `default` to `hotfix` after editing the title | **None** | **Open; values of `hotfix`, the edited title kept** |
| R5 | `Ctrl+Enter` while a guard of `Create guards` stops the creation | **None** | **Open; the guard's notification text shown at the top of the drawer** |

### Requirement: Quick create input
The quick create input SHALL be one quick input titled `Create MR for <repository> — Enter to create, type to change
the title`, with the rendered title as its value and the items **Create with profile "<profile>"** (with the detail
`<target> ← <branch> · reviewers <names> · squash · delete`), **Edit all fields…**, one **Use profile "<name>"** per
other profile, and **Create as draft**. `Enter` on the first item SHALL create with the typed title; **Edit all
fields…** SHALL open the drawer with the typed title; **Use profile** SHALL resolve that profile and show the input
again; **Create as draft** SHALL create with `draft` `true`; `Esc` SHALL send no request.

#### Scenario: Quick create item matrix

| # | Item chosen | Title typed | Result |
| :--- | :--- | :--- | :--- |
| R1 | **Create with profile "default"** | Unchanged | **Created with the rendered title** |
| R2 | **Create with profile "default"** | `feat: ABC-12 Notes` | **Created with the title `feat: ABC-12 Notes`** |
| R3 | **Edit all fields…** | `feat: ABC-12 Notes` | **The drawer, with the title `feat: ABC-12 Notes`** |
| R4 | **Use profile "hotfix"** | *Any* | **The input again, with the values of `hotfix`** |
| R5 | **Create as draft** | Unchanged | **Created with `draft` `true`** |
| R6 | `Esc` | *Any* | **No request** |

### Requirement: Create MR button in the MR / PR cell
The system SHALL show **[Create MR]** (**[Create PR]** on GitHub) in the MR / PR cell in place of `—` when the review
state loaded with no open review, HEAD is on a branch that is not the target, and the branch has at least one commit
ahead of the target.

#### Scenario: Create button matrix

| # | Review state | HEAD | Commits ahead of the target | MR / PR cell |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Loaded, none open, GitLab | `fix/login-timeout` | 1 | **`[Create MR]`** |
| R2 | Loaded, none open, GitHub | `feature/ABC-12-notes` | 3 | **`[Create PR]`** |
| R3 | Loaded, none open | `main`, the target | *N/A* | **`—`** |
| R4 | Loaded, none open | `feature/ABC-12-notes` | 0 | **`—`** |
| R5 | `!142` open | *Any* | *Any* | **`!142 …`** |

### Requirement: Merge request menu items
The system SHALL add **Create MR**, **Create MR…** and **Open MR** to the Source Control Repositories context menu
(`scm/sourceControl`, when `scmProvider == git` and the repository's provider is `gitlab` or `github`) and to the
Explorer **RepoHangar** submenu (when `resourcePath` is in `repohangar.hostedRoots`), running `repohangar.mr.create`,
`repohangar.mr.createEdit` and `repohangar.mr.open` on that repository.

#### Scenario: Menu item visibility matrix

| # | Menu | Repository provider | Create MR, Create MR…, Open MR |
| :--- | :--- | :--- | :--- |
| R1 | `scm/sourceControl` | `gitlab` | **Shown** |
| R2 | `scm/sourceControl` | `github` | **Shown** |
| R3 | `scm/sourceControl` | `unknown` or none | **Hidden** |
| R4 | Explorer **RepoHangar** submenu on a repository root | `gitlab` | **Shown, after Pull (ff)** |
| R5 | Explorer **RepoHangar** submenu on a repository root | none | **Hidden** |

### Requirement: Create job in the row
While a creation runs on a repository, the system SHALL show `⟳ creating MR` in its Sync cell and SHALL start no
second creation, push, pull or fetch on it from any trigger (`git-operations` `One job per repository at a time`).

#### Scenario: m pressed twice
- **GIVEN** a creation started by `m` on `billing-api` is still running and its Sync cell reads `⟳ creating MR`
- **WHEN** the user presses `m` on `billing-api` again
- **THEN** one create request has been sent for `billing-api`

### Requirement: Merge request keys
`m` and `M` SHALL act on the focused row as `Create entry points` states. The footer SHALL show `m MR · M MR…` before
`o open MR`, and the key help overlay SHALL list `m` and `M`.

#### Scenario: Footer with merge request keys
- **GIVEN** the dashboard shows the grid and no row is selected
- **WHEN** the footer renders
- **THEN** it contains `m MR · M MR… · o open MR · ↑↓ move`
