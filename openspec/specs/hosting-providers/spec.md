# hosting-providers Specification

## Purpose

Connects each repository to the merge request (GitLab) or pull request (GitHub) of its current branch: which host is
which provider, how the review state of every repository is loaded with one request per host, when it is refreshed,
and how it appears in the MR / PR column, the row details and the status bar.

**Non-goals:**
- Credentials, sign in and sign out, owned by `provider-auth`.
- Creating a merge request, the **[Create MR]** button in the MR / PR cell and the `m` and `M` keys, owned by
  `mr-creation`.
- Static provider detection from `repohangar.hosts`, `github.com`, `gitlab.com` and `github-enterprise.uri`, owned by
  `repo-registry`.
- Merging, approving or reviewing a merge request, and opening it in the GitLab Workflow or GitHub Pull Requests
  extensions: no capability does in this version.

## Requirements

### Requirement: Unknown host probe
For each host whose static provider is `unknown`, the system SHALL send, without credentials and once per host,
`GET https://<host>/api/v4/version` and, when its answer does not identify GitLab, `GET https://<host>/api/v3/meta`,
SHALL treat a `200` or `401` answer to the first as GitLab and a `200` JSON answer with `installed_version` to the second
as GitHub, SHALL store the result in `globalState` keyed by host, and SHALL apply it to every row on that host without a
window reload. A host the probe does not identify SHALL stay `unknown` and SHALL be probed again only when the user runs
`repohangar.refresh`. A `repohangar.hosts` entry for the host SHALL take precedence over a stored probe result.

**Constraints:**
- Timeout: 5 s per probe request
- The probe uses the port of the remote's web URL (`https://git.acme.com:8443/api/v4/version`)
- At most one probe sequence runs per host at a time

#### Scenario: Probe matrix

| # | Stored result for `git.acme.com` | `GET /api/v4/version` | `GET /api/v3/meta` | Provider of the rows on `git.acme.com` | Stored |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `gitlab` | **Not sent** | **Not sent** | **`gitlab`** | **Unchanged** |
| R2 | None | `200` `{"version":"17.10.0"}` | **Not sent** | **`gitlab`** | **`gitlab`** |
| R3 | None | `401` | **Not sent** | **`gitlab`** | **`gitlab`** |
| R4 | None | `404` | `200` `{"installed_version":"3.14.2"}` | **`github`** | **`github`** |
| R5 | None | `404` | `404` | **`unknown`** | **None** |
| R6 | None | No answer within 5 s | No answer within 5 s | **`unknown`** | **None** |

#### Scenario: Probe sends no credentials
- **GIVEN** `SecretStorage` holds a token for `git.acme.com` and the host has no stored probe result
- **WHEN** the probe sends `GET https://git.acme.com/api/v4/version`
- **THEN** the request has no `Authorization` and no `PRIVATE-TOKEN` header

### Requirement: Host choice for an unknown host
The system SHALL show `?` in the MR / PR cell of a repository whose provider stays `unknown` after the probe, as a
button with the tooltip `Unknown host git.acme.com — choose its provider`. The button SHALL open a quick pick titled
`git.acme.com` with the items **This host is GitLab** and **This host is GitHub**; choosing one SHALL add the entry
`"<host>": "gitlab"` or `"<host>": "github"` to `repohangar.hosts` at user scope, keeping its other entries. Provider
detection SHALL use the entries of `repohangar.hosts` at user, workspace and workspace-folder scope together, the
narrower scope winning for a host, so that a host chosen here also applies in a workspace that sets its own hosts.

#### Scenario: Host chosen in a workspace with its own hosts
- **GIVEN** the workspace settings hold `repohangar.hosts` `{ "git.acme.com": "gitlab" }` and `charts` on `git.unknown.test` shows `?`
- **WHEN** the user clicks `?` and chooses **This host is GitLab**
- **THEN** `repohangar.hosts` at user scope holds `{ "git.unknown.test": "gitlab" }` and the workspace value is unchanged
- **AND** the provider of `charts` is `gitlab` and of `billing-api` on `git.acme.com` still `gitlab`

#### Scenario: Choose GitLab for an unknown host
- **GIVEN** `repohangar.hosts` at user scope is `{ "github.acme.com": "github" }` and `billing-api` on `git.acme.com`
  shows `?`
- **WHEN** the user clicks `?` and chooses **This host is GitLab**
- **THEN** `repohangar.hosts` at user scope is `{ "github.acme.com": "github", "git.acme.com": "gitlab" }`
- **AND** the provider badge of `billing-api` reads `GL` without a window reload

#### Scenario: Host choice dismissed
- **GIVEN** `billing-api` on `git.acme.com` shows `?`
- **WHEN** the user clicks `?` and presses `Esc` in the quick pick
- **THEN** `repohangar.hosts` is unchanged at every scope

### Requirement: Batched review status
The system SHALL load the open review of the current branch of every listed repository whose provider is `gitlab` or
`github`, whose HEAD is on a branch, whose host has a credential (`provider-auth`) and whose host is not skipped, with
one GraphQL request per host for each chunk of at most 10 repositories on a GitLab host and at most 50 on a GitHub host:
for GitLab one aliased
`project(fullPath: <project path>) { mergeRequests(sourceBranches: [<branch>], state: opened, first: 1) }` per
repository sent to `https://<host>/api/graphql`, for GitHub one aliased
`repository(owner: <owner>, name: <name>) { pullRequests(headRefName: <branch>, states: [OPEN], first: 1) }` per
repository sent to `https://api.github.com/graphql` (github.com) or `https://<host>/api/graphql` (GitHub Enterprise).
When GitLab rejects a chunk for its size (`Query too large`) or its complexity (`Query has complexity of …, which
exceeds max complexity of …`), the system SHALL split the chunk into two halves and send each half again, one after
another; a chunk of one repository that GitLab still rejects SHALL fail the request (Review request failures). The
system MUST NOT send a review request for any other repository. A failed request SHALL be logged as
`Review request to <host> failed: <message>`, where `<message>` is the first GraphQL error message of the answer, else
the `message` of a REST error, else `HTTP <status>`.

**Constraints:**
- At most 10 aliases per GitLab request and 50 per GitHub request; the chunks of one host are sent one after another,
  different hosts in parallel
- A rejected GitLab chunk is split down to 1 alias, never further
- Request timeout: 15 s
- Two repositories on the same project and different branches (worktrees) get one alias each

#### Scenario: Repository inclusion matrix

| # | Provider | HEAD | Credential for the host | Host skipped (`provider-auth`) | In the request | MR / PR cell |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | None (no remote, or not hosted) | *Any* | *N/A* | *N/A* | **No** | **`—`** |
| R2 | `unknown` | *Any* | *N/A* | *N/A* | **No** | **`?`** |
| R3 | `gitlab` | Detached, or an operation in progress on a detached HEAD | *Any* | *Any* | **No** | **`—`** |
| R4 | `gitlab` | Branch | None | No | **No** | **`Sign in`** |
| R5 | `gitlab` | Branch | *Any* | Yes | **No** | **`—`** |
| R6 | `gitlab` | Branch | Yes | No | **Yes** | **The review cell** |
| R7 | `github` | Branch | None | No | **No** | **`Sign in`** |
| R8 | `github` | Branch | Yes | No | **Yes** | **The review cell** |

#### Scenario: Forty repositories on two hosts
- **GIVEN** 25 listed repositories on `git.acme.com` (`gitlab`) and 15 on `github.com` (`github`), all on branches, with
  a credential for both hosts
- **WHEN** the review status of every repository loads
- **THEN** exactly 4 HTTP requests are sent: 3 `POST https://git.acme.com/api/graphql` with 10, 10 and 5 aliases, one
  after another, and 1 `POST https://api.github.com/graphql` with 15 aliases

#### Scenario: Chunks of 50 aliases
- **GIVEN** 120 listed repositories on `github.com`, all on branches, with a credential for the host
- **WHEN** the review status of every repository loads
- **THEN** 3 requests are sent to `https://api.github.com/graphql`, with 50, 50 and 20 aliases, the second sent after
  the first answered

#### Scenario: GitLab chunk limit matrix

| # | Aliases in the request to `git.acme.com` | GitLab answer | Requests that follow for these repositories | Their MR / PR cells | Log line |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | 10 | `200` with `data` for every alias | **None** | **Refreshed from the answer** | **None** |
| R2 | 10 | `422` with `{"errors":[{"message":"Query too large"}]}` | **2 requests of 5 aliases, the second sent after the first answered** | **Refreshed from the two answers** | **None** |
| R3 | 10 | `200` without `data`, with the error `Query has complexity of 260, which exceeds max complexity of 250` | **2 requests of 5 aliases, the second sent after the first answered** | **Refreshed from the two answers** | **None** |
| R4 | 1 | `422` with `{"errors":[{"message":"Query too large"}]}` | **None** | **Cached values, not refreshed** | **`Review request to git.acme.com failed: Query too large`** |
| R5 | 10 | `502` | **None** | **Cached values, not refreshed** | **`Review request to git.acme.com failed: HTTP 502`** |

### Requirement: Reduced selection and REST fallback
When a GraphQL answer reports a field that does not exist on its type, the system SHALL remove that field from the
selection, send the request again, and remember the reduced selection for that host in `globalState` until the
extension version or the host's GitLab version changes. The fields that identify a review (GitLab `iid` and `webUrl`,
GitHub `number` and `url`) and the review connection itself cannot be removed: when one of them is reported, or after
3 retries in one load, a GitLab host SHALL switch to
`GET /api/v4/projects/<URL-encoded project path>/merge_requests?source_branch=<branch>&state=opened&per_page=1` per
repository, at most 4 at a time per host, sending `If-None-Match` with the ETag of the previous answer for the same
URL, and a GitHub host SHALL keep its cached values marked as not refreshed.

**Constraints:**
- At most 3 retries with a reduced selection per load and host
- REST fallback concurrency: 4 requests per host

#### Scenario: Schema error matrix

| # | Host | Error in the GraphQL answer | Requests that follow | Remembered for the host | Cell of `billing-api` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `git.acme.com` (GitLab) | `Field 'approvalsRequired' doesn't exist on type 'MergeRequest'` | **1 GraphQL request without `approvalsRequired`** | **Selection without `approvalsRequired`** | **`!142  ✓ passed` (no approvals)** |
| R2 | `git.acme.com` (GitLab) | `Field 'detailedMergeStatus' doesn't exist on type 'MergeRequest'` | **1 GraphQL request without `detailedMergeStatus`** | **Selection without `detailedMergeStatus`** | **`!142  ✓ passed  1/2`; row details `Mergeable: unknown`** |
| R3 | `git.acme.com` (GitLab) | `Field 'mergeRequests' doesn't exist on type 'Project'` | **`GET …/merge_requests?source_branch=…&state=opened&per_page=1` per repository, at most 4 at a time** | **REST** | **`!142` from the REST answer** |
| R4 | `git.acme.com` (GitLab) | A new missing field after each of 3 retries | **REST per repository after the third retry** | **REST** | **`!142` from the REST answer** |
| R5 | `github.acme.com` (GitHub) | `Field 'autoMergeRequest' doesn't exist on type 'PullRequest'` | **1 GraphQL request without `autoMergeRequest`** | **Selection without `autoMergeRequest`** | **`#57  ✓ passed` (no `auto ⇢`)** |
| R6 | `github.acme.com` (GitHub) | `Field 'pullRequests' doesn't exist on type 'Repository'` | **None** | **Nothing** | **Cached value, not refreshed** |

#### Scenario: REST answer not modified
- **GIVEN** `git.acme.com` uses the REST fallback and the previous answer for `billing-api` carried `ETag: "a1b2"`
- **WHEN** the review status of `billing-api` loads again and the server answers `304 Not Modified`
- **THEN** the request carried `If-None-Match: "a1b2"`
- **AND** the cell of `billing-api` keeps its value and is marked as refreshed

### Requirement: Review request failures
The system SHALL keep the cached review states of a host and mark them as not refreshed when a review request to that
host fails, SHALL show no notification for it except as `provider-auth` states for a rejected credential, and SHALL
wait before the next request to that host as the matrix states. A GraphQL answer whose alias returns `null` (the project
does not exist or the credential cannot read it) SHALL show `—` in that repository's cell with the tooltip
`<project path> was not found on <host>, or your account cannot read it.` and SHALL NOT affect the other repositories.

**Constraints:**
- Back-off after a failure: 1 min, doubled after each further failure, at most 30 min; reset by an answer with status
  `200` or `304`, or by `repohangar.refresh`

#### Scenario: Failure matrix

| # | Answer | Cells of the host | Notification | Next request to the host |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `401` | **`Sign in`** | **As `provider-auth` `Rejected credential`** | **After the user signs in** |
| R2 | `429`, or `403` with `X-RateLimit-Remaining: 0` and `X-RateLimit-Reset` 600 s ahead | **Cached values, not refreshed** | **None** | **Not before the reset time, 600 s later** |
| R3 | `429` with `Retry-After: 120` | **Cached values, not refreshed** | **None** | **Not before 120 s** |
| R4 | `502`, a network error, or no answer within 15 s, first time | **Cached values, not refreshed** | **None** | **Next trigger at least 1 min later** |
| R5 | `502`, third failure in a row | **Cached values, not refreshed** | **None** | **Next trigger at least 4 min later** |

#### Scenario: Project not readable
- **GIVEN** the GitLab answer for the alias of `billing-api` is `"r0": null` and the alias of `ledger` returns `!88`
- **WHEN** the dashboard shows both rows
- **THEN** the MR / PR cell of `billing-api` reads `—` with the tooltip
  `payments/billing-api was not found on git.acme.com, or your account cannot read it.`
- **AND** the MR / PR cell of `ledger` reads `!88`

### Requirement: Review state cache
The system SHALL store the last review state of each repository and branch, with the head SHA it was loaded for, in
`workspaceState`, SHALL show it when the dashboard opens before any request answers, and SHALL mark a cell as not
refreshed while its value was loaded in an earlier window session, was loaded for another head SHA, or the last request
to its host failed. A cell marked as not refreshed SHALL show its value in a dimmed style, its tooltip SHALL end with
the line `Not refreshed since <age> ago`, and its accessible name SHALL end with `, not refreshed`. A repository with no
stored state for its branch SHALL show `…` (accessible name `Loading`) until its first answer.

**Constraints:**
- At most one stored state per repository and branch
- The age uses the units of the Fetched cell (`dashboard`)

#### Scenario: Cache matrix

| # | Stored state for the current branch | Stored head SHA | Loaded in this window session | MR / PR cell | Marked not refreshed |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | None | *N/A* | No | **`…`** | **No** |
| R2 | `!142`, `⟳ running`, 12 min old | Equal to HEAD | No | **`!142  ⟳ running`** | **Yes, `Not refreshed since 12 min ago`** |
| R3 | `!142`, `⟳ running` | Differs from HEAD (a new commit) | *Any* | **`!142  ⟳ running`** | **Yes** |
| R4 | `!142`, `✓ passed` | Equal to HEAD | Yes | **`!142  ✓ passed`** | **No** |
| R5 | Only for `main`, while HEAD is on `feature/ABC-12-notes` | *N/A* | No | **`…`** | **No** |

### Requirement: Provider refresh triggers
The system SHALL queue a repository for a review request when its branch or head SHA changes, after RepoHangar pushes
or publishes it, when the window gains focus and the repository's review state is more than 60 s old, every
`repohangar.providers.refreshMinutes` (default `3`) while the window is focused and any listed review has a running or
pending pipeline, and when the user runs `repohangar.refresh`. The system SHALL send the queued repositories of a host
in one request 2 s after the first of them was queued, except for `repohangar.refresh`, which sends at once. The system
MUST NOT send a review request or keep a provider timer running while the window is unfocused; repositories queued
then SHALL be sent when the window gains focus.

**Constraints:**
- `repohangar.providers.refreshMinutes`: integer from `1` to `60`, default `3`
- Queue delay: 2 s from the first queued repository of a host
- Focus threshold: 60 s

#### Scenario: Refresh trigger matrix

| # | Event | Window focused | Age of the review state | A running or pending pipeline is listed | Review requests |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | A commit in `billing-api` changes its head SHA | Yes | *Any* | *Any* | **1 request to `git.acme.com` 2 s after the commit, including `billing-api`** |
| R2 | Commits in `billing-api` and `ledger` 1 s apart | Yes | *Any* | *Any* | **1 request to `git.acme.com` including both** |
| R3 | A commit in `billing-api` | No | *Any* | *Any* | **None until the window gains focus, then 1 request including `billing-api`** |
| R4 | RepoHangar pushes `billing-api` | Yes | *Any* | *Any* | **1 request to `git.acme.com` 2 s after the push ends, including `billing-api`** |
| R5 | The window gains focus | Yes | 45 s | *Any* | **None** |
| R6 | The window gains focus | Yes | 75 s | *Any* | **1 request per host for its repositories older than 60 s** |
| R7 | 3 min pass, `repohangar.providers.refreshMinutes` = `3` | Yes | *Any* | Yes | **1 request per host** |
| R8 | 3 min pass | Yes | *Any* | No | **None; no provider timer runs** |
| R9 | 10 min pass | No | *Any* | Yes | **None; no provider timer runs** |
| R10 | The user runs `repohangar.refresh` | Yes | *Any* | *Any* | **1 request per host at once, and a new probe of every unidentified host** |

### Requirement: MR / PR cell
The system SHALL show in the **MR / PR** cell of a repository with an open review: the reference (`!<iid>` on GitLab,
`#<number>` on GitHub), then `Draft` for a draft, then the pipeline state, then the approvals, then `auto ⇢` when
auto-merge is enabled, separated by two spaces and leaving out each part that has no value, with the review's title as
tooltip. A repository whose review state loaded with no open review SHALL show `—`. The pipeline and approval values
SHALL be shown as the matrices state.

#### Scenario: Pipeline value matrix

| # | Provider | Value in the answer | Shown | Accessible name |
| :--- | :--- | :--- | :--- | :--- |
| R1 | GitLab | `headPipeline.status` `SUCCESS` | **`✓ passed`** | **`Pipeline passed`** |
| R2 | GitLab | `RUNNING` | **`⟳ running`** | **`Pipeline running`** |
| R3 | GitLab | `PENDING`, `CREATED`, `WAITING_FOR_RESOURCE`, `PREPARING`, `SCHEDULED` or `WAITING_FOR_CALLBACK` | **`◷ pending`** | **`Pipeline pending`** |
| R4 | GitLab | `MANUAL` | **`◷ manual`** | **`Pipeline waiting for a manual job`** |
| R5 | GitLab | `FAILED` | **`✗ failed`** | **`Pipeline failed`** |
| R6 | GitLab | `CANCELED` or `CANCELING` | **`⊘ canceled`** | **`Pipeline canceled`** |
| R7 | GitLab | `SKIPPED`, or `headPipeline` is `null` | **Nothing** | **Nothing** |
| R8 | GitHub | `statusCheckRollup.state` `SUCCESS` | **`✓ passed`** | **`Checks passed`** |
| R9 | GitHub | `PENDING` or `EXPECTED` | **`⟳ running`** | **`Checks running`** |
| R10 | GitHub | `FAILURE` or `ERROR` | **`✗ failed`** | **`Checks failed`** |
| R11 | GitHub | `statusCheckRollup` is `null` | **Nothing** | **Nothing** |

#### Scenario: Approval value matrix

| # | Provider | Values in the answer | Shown | Accessible name |
| :--- | :--- | :--- | :--- | :--- |
| R1 | GitLab | `approvalsRequired` 2, `approvalsLeft` 1 | **`1/2`** | **`1 of 2 approvals`** |
| R2 | GitLab | `approvalsRequired` 2, `approvalsLeft` 0 | **`2/2`** | **`2 of 2 approvals`** |
| R3 | GitLab | `approvalsRequired` 0, or the field removed from the selection | **Nothing** | **Nothing** |
| R4 | GitHub | `reviewDecision` `APPROVED` | **`approved`** | **`Approved`** |
| R5 | GitHub | `CHANGES_REQUESTED` | **`changes requested`** | **`Changes requested`** |
| R6 | GitHub | `REVIEW_REQUIRED` | **`review required`** | **`Review required`** |
| R7 | GitHub | `null` | **Nothing** | **Nothing** |

#### Scenario: Review cell matrix

| # | Provider | Review | Draft | Pipeline | Approvals | Auto-merge | MR / PR cell | Accessible name |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | GitLab | `!142` | Yes | `RUNNING` | Required 0 | No | **`!142  Draft  ⟳ running`** | **`Merge request 142, Draft, Pipeline running`** |
| R2 | GitLab | `!88` | No | `SUCCESS` | 2 of 2 | No | **`!88  ✓ passed  2/2`** | **`Merge request 88, Pipeline passed, 2 of 2 approvals`** |
| R3 | GitHub | `#311` | No | `FAILURE` | `CHANGES_REQUESTED` | No | **`#311  ✗ failed  changes requested`** | **`Pull request 311, Checks failed, Changes requested`** |
| R4 | GitHub | `#57` | No | `SUCCESS` | `null` | Yes | **`#57  ✓ passed  auto ⇢`** | **`Pull request 57, Checks passed, Auto-merge enabled`** |
| R5 | GitLab | None open | *N/A* | *N/A* | *N/A* | *N/A* | **`—`** | **`No open merge request`** |
| R6 | GitHub | None open | *N/A* | *N/A* | *N/A* | *N/A* | **`—`** | **`No open pull request`** |

### Requirement: Open merge request
`o` on the focused row, a click on the reference in the MR / PR cell, and `repohangar.mr.open` (*RepoHangar: Open
Merge Request of Current Branch*, on the active repository of `git-operations`) SHALL open the review's web URL with
`vscode.env.openExternal`, and SHALL otherwise act as the matrix states. With rows selected, `o` SHALL still act on the
focused row only. The footer SHALL show the hint `o open MR` directly before the navigation hints (`↑↓ move …`), and the key help
overlay SHALL list `o`.

#### Scenario: Open merge request matrix

| # | Provider | HEAD | Review state | Opened URL | Notification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | None or `unknown` | *Any* | *N/A* | **None** | **`billing-api is not on a known GitLab or GitHub host.`** |
| R2 | `gitlab` | Detached | *N/A* | **None** | **`billing-api is not on a branch.`** |
| R3 | `gitlab` | `feature/ABC-12-notes` | `!142` | **`https://git.acme.com/payments/billing-api/-/merge_requests/142`** | **None** |
| R4 | `github` | `feature/ABC-12-notes` | `#311` | **`https://github.com/acme/web-shop/pull/311`** | **None** |
| R5 | `gitlab` | `feature/ABC-12-notes` | Loaded, none open | **None** | **`No open merge request for feature/ABC-12-notes in billing-api.`** |
| R6 | `github` | `feature/ABC-12-notes` | Loaded, none open | **None** | **`No open pull request for feature/ABC-12-notes in web-shop.`** |
| R7 | `gitlab` | `feature/ABC-12-notes` | Not loaded (no credential or host skipped) | **`https://git.acme.com/payments/billing-api/-/merge_requests?state=opened&source_branch=feature%2FABC-12-notes`** | **None** |
| R8 | `github` | `feature/ABC-12-notes` | Not loaded (no credential or host skipped) | **`https://github.com/acme/web-shop/pulls?q=is%3Apr+is%3Aopen+head%3Afeature%2FABC-12-notes`** | **None** |

### Requirement: Copy merge request link
`repohangar.mr.copyLink` (*RepoHangar: Copy Merge Request Link*, on the active repository) and the **Copy link** button
of the row details SHALL put the review's web URL on the clipboard and show the status bar message
`Copied <URL>` for 3 s. Without a loaded open review they SHALL copy nothing and show the notification that
`Open merge request` shows for the same row (R1, R2, R5, R6), or `No merge request loaded for <branch> in <repository>.`
when the review state is not loaded.

#### Scenario: Copy the link of an open merge request
- **GIVEN** the active editor's file is in `billing-api`, whose review is `!142`
- **WHEN** the user runs `repohangar.mr.copyLink`
- **THEN** the clipboard holds `https://git.acme.com/payments/billing-api/-/merge_requests/142`

#### Scenario: Copy the link without a credential
- **GIVEN** `billing-api` is on `feature/ABC-12-notes` and `git.acme.com` has no credential
- **WHEN** the user runs `repohangar.mr.copyLink` on `billing-api`
- **THEN** the clipboard is unchanged and the notification reads
  `No merge request loaded for feature/ABC-12-notes in billing-api.`

### Requirement: Compare page
The system SHALL add the item **Open compare page** after **Copy branch name** in the row's `⋯` menu and the button
**Compare with `<target>`** to the row details, both opening the provider's compare page from the target branch to the
current branch with `vscode.env.openExternal`: `<web URL>/-/compare/<target>...<branch>` on GitLab and
`<web URL>/compare/<target>...<branch>` on GitHub. The target is the default branch from
`refs/remotes/<remote>/HEAD`, else the project's default branch from the provider (one request, kept for 1 h). The item
and the button SHALL be disabled, with the reason as tooltip, when no target can be determined, HEAD is detached, HEAD
is on the target, or the provider is not `gitlab` or `github`.

**Constraints:**
- Project information from the provider is kept for 1 h per project

#### Scenario: Compare page matrix

| # | Provider | HEAD | `refs/remotes/origin/HEAD` | Provider default branch | Item | Opened URL |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | None or `unknown` | *Any* | *Any* | *N/A* | **Disabled, `Not on a known GitLab or GitHub host`** | **None** |
| R2 | `gitlab` | Detached | *Any* | *Any* | **Disabled, `Not on a branch`** | **None** |
| R3 | `gitlab` | `feature/ABC-12-notes` | `origin/main` | *Any* | **Enabled** | **`https://git.acme.com/payments/billing-api/-/compare/main...feature/ABC-12-notes`** |
| R4 | `github` | `feature/ABC-12-notes` | `origin/main` | *Any* | **Enabled** | **`https://github.com/acme/web-shop/compare/main...feature/ABC-12-notes`** |
| R5 | `gitlab` | `feature/ABC-12-notes` | Missing | `develop` | **Enabled** | **`https://git.acme.com/payments/billing-api/-/compare/develop...feature/ABC-12-notes`** |
| R6 | `gitlab` | `feature/ABC-12-notes` | Missing | Unknown (no credential) | **Disabled, `Default branch unknown`** | **None** |
| R7 | `gitlab` | `main` | `origin/main` | *Any* | **Disabled, `Already on main`** | **None** |

### Requirement: Review lines in row details
The system SHALL add to the open row details of a repository whose provider is `gitlab` or `github` and whose review
state is loaded: a line `MR` (GitLab) or `PR` (GitHub) with the reference, the title, `Draft: yes` or `Draft: no`, the
approvals as the MR / PR cell shows them, and `Mergeable: <value>`; a line `Pipeline` (GitLab) or `Checks` (GitHub)
with the pipeline value and the button **Open pipeline ↗** (GitLab, opening `<review URL>/pipelines`) or **Open checks
↗** (GitHub, opening `<review URL>/checks`); and the buttons **Open MR ↗** or **Open PR ↗**, **Copy link** and
**Compare with `<target>`**. Without an open review, the details SHALL show `MR  none` or `PR  none` and only
**Compare with `<target>`**.

#### Scenario: Mergeable value matrix

| # | Provider | Value in the answer | `Mergeable:` |
| :--- | :--- | :--- | :--- |
| R1 | GitLab | `detailedMergeStatus` `MERGEABLE` | **`yes`** |
| R2 | GitLab | `CONFLICT` | **`conflicts`** |
| R3 | GitLab | `BLOCKED_STATUS`, `NOT_APPROVED`, `CI_MUST_PASS`, `CI_STILL_RUNNING`, `DISCUSSIONS_NOT_RESOLVED`, `DRAFT_STATUS`, `NOT_OPEN`, `NEED_REBASE`, `JIRA_ASSOCIATION_MISSING`, `EXTERNAL_STATUS_CHECKS` or `REQUESTED_CHANGES` | **`blocked`** |
| R4 | GitLab | `CHECKING`, `UNCHECKED`, any other value, or the field removed from the selection | **`unknown`** |
| R5 | GitHub | `mergeable` `MERGEABLE` | **`yes`** |
| R6 | GitHub | `CONFLICTING` | **`conflicts`** |
| R7 | GitHub | `UNKNOWN` | **`unknown`** |

#### Scenario: Row details of a pull request
- **GIVEN** `web-shop` on `feature/ABC-12-notes` has `#311` titled `feat: ABC-12 Add billing notes`, not a draft,
  `reviewDecision` `CHANGES_REQUESTED`, `mergeable` `MERGEABLE` and checks `FAILURE`, and `origin/HEAD` is `origin/main`
- **WHEN** the user opens its row details
- **THEN** the details add the line
  `PR  #311  feat: ABC-12 Add billing notes  Draft: no  changes requested  Mergeable: yes`
- **AND** the line `Checks  ✗ failed` with **Open checks ↗**, which opens `https://github.com/acme/web-shop/pull/311/checks`
- **AND** the buttons **Open PR ↗**, **Copy link** and **Compare with main**

### Requirement: Hosted roots context key
The system SHALL set the context key `repohangar.hostedRoots` to the `Uri.fsPath` of the root of every listed
repository whose provider is `gitlab` or `github`, and SHALL update it within 1 s when a repository opens or closes or
its provider changes.

#### Scenario: Provider chosen for an unknown host
- **GIVEN** `billing-api` at `/home/dev/code/acme/backend/billing-api` has provider `unknown` and is not in
  `repohangar.hostedRoots`
- **WHEN** the user chooses **This host is GitLab** for `git.acme.com`
- **THEN** within 1 s `repohangar.hostedRoots` contains `/home/dev/code/acme/backend/billing-api`

### Requirement: GitLab version warning
The system SHALL read `GET https://<host>/api/v4/version` once per GitLab host and window session, with the host's
token when there is one, and when the version is lower than 17.10.0 SHALL show, once per host and version, the warning
`<host> runs GitLab <version>. RepoHangar supports GitLab 17.10 or later; some merge request details can be missing.`
The system SHALL keep querying that host. A version that cannot be read SHALL be treated as 17.10.0, with no warning.

#### Scenario: GitLab version matrix

| # | Answer of `/api/v4/version` | Warning shown earlier for this host and version | Notification |
| :--- | :--- | :--- | :--- |
| R1 | `{"version":"17.10.0"}` | *N/A* | **None** |
| R2 | `{"version":"18.2.1-ee"}` | *N/A* | **None** |
| R3 | `{"version":"16.11.2"}` | No | **Warning `git.acme.com runs GitLab 16.11.2. RepoHangar supports GitLab 17.10 or later; some merge request details can be missing.`** |
| R4 | `{"version":"16.11.2"}` | Yes | **None** |
| R5 | `401` | *N/A* | **None; 17.10.0 assumed** |
