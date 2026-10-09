## Purpose

Gives RepoHangar a credential for each GitLab and GitHub host with as few steps as possible (VS Code's GitHub account,
an existing `glab` or `gh` login, or a pasted token), lets the user sign in and out per host, and keeps tokens out of
everything except `SecretStorage` and the requests to their own host.

**Non-goals:**
- What RepoHangar requests with a credential, owned by `hosting-providers` and `mr-creation`.
- Creating a merge request without a token through GitLab push options, owned by `mr-creation`.
- Storing GitHub sessions: VS Code's authentication provider owns them; no capability does.

## ADDED Requirements

### Requirement: GitHub credentials
The system SHALL use, for a host whose provider is `github`, the first credential of this order: for `github.com`, the
VS Code session of the `github` authentication provider with the scope `repo`; for the host of `github-enterprise.uri`,
the VS Code session of the `github-enterprise` provider with the scope `repo`; then a token stored in `SecretStorage`
under `repohangar.token.<host>`; then, for a host other than `github.com`, the output of
`gh auth token --hostname <host>` when `GET https://<host>/api/v3/user` accepts it, which the system SHALL then store
under `repohangar.token.<host>`. It SHALL look up VS Code sessions without prompting (`createIfNone: false`, `silent`)
and SHALL show `Sign in` in the MR / PR cells of a host without a credential.

**Constraints:**
- `gh` runs through `execFile` with an argument array, a 10 s timeout and no shell, at most once per host and window
  session

#### Scenario: GitHub credential matrix

| # | Host | `github-enterprise.uri` | VS Code session | Token in `SecretStorage` | `gh auth token --hostname <host>` | Credential | `SecretStorage` after |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `github.com` | *Any* | `github`, scope `repo` | *Any* | **Not run** | **The VS Code session** | **Unchanged** |
| R2 | `github.com` | *Any* | None | *N/A* | **Not run** | **None; cells read `Sign in`** | **Unchanged** |
| R3 | `github.acme.com` | `https://github.acme.com` | `github-enterprise`, scope `repo` | *Any* | **Not run** | **The VS Code session** | **Unchanged** |
| R4 | `github.acme.com` | Not set | *N/A* | `ghp_…` | **Not run** | **The stored token** | **Unchanged** |
| R5 | `github.acme.com` | Not set | *N/A* | None | Prints a token that `/api/v3/user` accepts | **The `gh` token** | **`repohangar.token.github.acme.com` stored** |
| R6 | `github.acme.com` | Not set | *N/A* | None | Prints a token that `/api/v3/user` answers with `401` | **None; cells read `Sign in`** | **Unchanged** |
| R7 | `github.acme.com` | Not set | *N/A* | None | Not installed, or exits non-zero | **None; cells read `Sign in`** | **Unchanged** |

### Requirement: GitLab credentials
The system SHALL use, for a host whose provider is `gitlab`, the token stored in `SecretStorage` under
`repohangar.token.<host>`, else the output of `glab config get token --host <host>` when
`GET https://<host>/api/v4/user` accepts it, which the system SHALL then store under `repohangar.token.<host>` and
announce once with `Using your glab login for <host>.` A host with neither SHALL show `Sign in` in its MR / PR cells.

**Constraints:**
- `glab` runs through `execFile` with an argument array, a 10 s timeout and no shell, at most once per host and window
  session

#### Scenario: GitLab credential matrix

| # | Token in `SecretStorage` | `glab config get token --host git.acme.com` | `GET /api/v4/user` with the `glab` token | Credential | `SecretStorage` after | Notification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `glpat-…` | **Not run** | **Not sent** | **The stored token** | **Unchanged** | **None** |
| R2 | None | Prints `glpat-x1y2` | `200` | **`glpat-x1y2`** | **`repohangar.token.git.acme.com` = `glpat-x1y2`** | **`Using your glab login for git.acme.com.`** |
| R3 | None | Prints `glpat-old` | `401` | **None; cells read `Sign in`** | **Unchanged** | **None** |
| R4 | None | Not installed, prints nothing, or exits non-zero | **Not sent** | **None; cells read `Sign in`** | **Unchanged** | **None** |

### Requirement: Sign in to a host
The system SHALL start the sign-in of a host from a `Sign in` MR / PR cell, from the first-run hosts panel, and from
`repohangar.signIn` (*RepoHangar: Sign In to Host…*), which offers a quick pick of the hosts of the listed repositories
whose provider is `gitlab` or `github`, each with its state (`Signed in as <username>`, `Not connected` or `Skipped`).
For `github.com` and the host of `github-enterprise.uri` the system SHALL request the VS Code session with
`createIfNone: true`. For every other host it SHALL open the host's token page in the browser, then show a password
input titled `Paste the <GitLab|GitHub> token for <host>`, check the pasted token with `GET /api/v4/user` (GitLab) or
`GET /api/v3/user` (GitHub), and store it under `repohangar.token.<host>` only when the answer is `200`. After a
successful sign-in, the system SHALL clear a skip of that host and load its review status at once.

**Constraints:**
- GitLab token page: `https://<host>/-/user_settings/personal_access_tokens?name=RepoHangar&scopes=api`
- GitHub Enterprise token page: `https://<host>/settings/tokens/new?description=RepoHangar&scopes=repo`

#### Scenario: Sign-in matrix

| # | Host | Provider | User action | Requests and API calls | `SecretStorage` after | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `github.com` | `github` | Completes VS Code's GitHub sign-in | **`getSession('github', ['repo'], { createIfNone: true })`** | **Unchanged** | **Review status of `github.com` loads at once** |
| R2 | `github.com` | `github` | Cancels VS Code's GitHub sign-in | **`getSession('github', ['repo'], { createIfNone: true })`** | **Unchanged** | **Cells keep `Sign in`** |
| R3 | `git.acme.com` | `gitlab` | Pastes `glpat-x1y2` | **Opens `https://git.acme.com/-/user_settings/personal_access_tokens?name=RepoHangar&scopes=api`; `GET https://git.acme.com/api/v4/user` answers `200`** | **`repohangar.token.git.acme.com` = `glpat-x1y2`** | **Review status of `git.acme.com` loads at once** |
| R4 | `git.acme.com` | `gitlab` | Pastes `glpat-bad` | **`GET /api/v4/user` answers `401`** | **Unchanged** | **The input stays open with the message `git.acme.com did not accept this token (401).`** |
| R5 | `git.acme.com` | `gitlab` | Presses `Esc` in the password input | **No request** | **Unchanged** | **Cells keep `Sign in`** |
| R6 | `github.acme.com` | `github`, not the `github-enterprise.uri` host | Pastes `ghp_a1b2` | **Opens `https://github.acme.com/settings/tokens/new?description=RepoHangar&scopes=repo`; `GET https://github.acme.com/api/v3/user` answers `200`** | **`repohangar.token.github.acme.com` = `ghp_a1b2`** | **Review status of `github.acme.com` loads at once** |

#### Scenario: Sign in from a cell
- **GIVEN** `billing-api` on `git.acme.com` shows `Sign in` in its MR / PR cell
- **WHEN** the user clicks `Sign in` and pastes a token that `git.acme.com` accepts
- **THEN** one review request is sent to `https://git.acme.com/api/graphql` right after the token is stored
- **AND** the MR / PR cells of every repository on `git.acme.com` show their review values

### Requirement: Sign out of a host
`repohangar.signOut` (*RepoHangar: Sign Out of Host…*) SHALL offer a quick pick of the hosts that have a credential.
For a host with a token in `SecretStorage` it SHALL delete `repohangar.token.<host>`, drop the stored review states of
that host and show `Sign in` in its cells. For a host whose credential is a VS Code session it SHALL delete nothing and
show `RepoHangar uses your VS Code account for <host>. Sign out of it from the Accounts menu.`

#### Scenario: Sign out of a GitLab host
- **GIVEN** `repohangar.token.git.acme.com` is stored and `billing-api` shows `!142`
- **WHEN** the user runs `repohangar.signOut` and picks `git.acme.com`
- **THEN** `SecretStorage` has no `repohangar.token.git.acme.com`
- **AND** the MR / PR cell of `billing-api` reads `Sign in` and no request is sent to `git.acme.com`

#### Scenario: Sign out of github.com
- **GIVEN** `github.com` uses the VS Code `github` session
- **WHEN** the user runs `repohangar.signOut` and picks `github.com`
- **THEN** the notification reads `RepoHangar uses your VS Code account for github.com. Sign out of it from the Accounts menu.`
- **AND** `SecretStorage` is unchanged

### Requirement: Rejected credential
When a request with a credential is answered `401`, the system SHALL stop sending requests to that host, show `Sign in`
in its MR / PR cells, delete its token from `SecretStorage` when the credential was a stored token, and show once per
host and window session the warning `<host> rejected the saved <token|VS Code session>.` with the button `Sign In…`,
which starts the sign-in of that host (for a VS Code session, with `forceNewSession: true`).

#### Scenario: Revoked GitLab token
- **GIVEN** `repohangar.token.git.acme.com` holds a token that was revoked on the server
- **WHEN** a review request to `https://git.acme.com/api/graphql` is answered `401`
- **THEN** `SecretStorage` has no `repohangar.token.git.acme.com`
- **AND** the warning reads `git.acme.com rejected the saved token.` with `Sign In…`
- **AND** no further request is sent to `git.acme.com` until the user signs in

### Requirement: Token handling
The system SHALL store tokens only in `SecretStorage`, keyed `repohangar.token.<host>`, and MUST NOT write a token or a
session's access token to settings, `globalState`, `workspaceState`, the RepoHangar output channel or any message to the
webview. It SHALL send a credential only in the `Authorization` header of requests to the host it belongs to
(`api.github.com` for `github.com`), and MUST NOT follow a redirect to another host with it.

#### Scenario: Redirect to another host
- **GIVEN** `git.acme.com` has a stored token
- **WHEN** `https://git.acme.com/api/graphql` answers `302` with `Location: https://sso.acme.com/login`
- **THEN** no request is sent to `sso.acme.com`
- **AND** the cells of `git.acme.com` keep their values, marked as not refreshed

#### Scenario: Trace logging of a request
- **GIVEN** the RepoHangar output channel is at the `Trace` level and `git.acme.com` has a stored token
- **WHEN** a review request is sent to `git.acme.com`
- **THEN** no line of the output channel contains the token or an `Authorization` header

### Requirement: Skip a host
The system SHALL let the user skip a host from the first-run hosts panel (**Skip — git only**). A skipped host SHALL be
stored in `globalState`, SHALL get no request at all (no probe, no review request, no credential lookup, no `glab` or
`gh` process), and its MR / PR cells SHALL read `—` with the tooltip
`<host> is skipped. Run "RepoHangar: Sign In to Host…" to connect it.` Signing in to the host SHALL clear the skip.

#### Scenario: Skipped GitLab host
- **GIVEN** `git.acme.com` was skipped and `glab` is logged in to it
- **WHEN** the dashboard opens
- **THEN** no request is sent to `git.acme.com` and no `glab` process starts
- **AND** the MR / PR cell of `billing-api` reads `—` with the tooltip
  `git.acme.com is skipped. Run "RepoHangar: Sign In to Host…" to connect it.`

### Requirement: First-run hosts panel
The first time the dashboard opens with at least one listed repository whose provider is `gitlab` or `github`, the
system SHALL show, in place of the grid, a panel with the line
`Found <n> repositories: <count> on <host> (<GitLab|GitHub>) · … · <count> local only`, then one line per host with its
state and buttons as the matrix states, then the button `Open dashboard →`, which shows the grid. The system SHALL
record in `globalState` that the panel was shown and SHALL NOT show it again in any window.

Whether a dashboard panel shows it SHALL be decided once per panel: at once when the panel was dismissed before (no
panel) or a listed repository is on a GitLab or GitHub host (the panel), else when every listed repository has its row
or 2 s have passed, the dashboard showing `Loading repositories…` until then. A dashboard restored after a window
reload SHALL NOT show the panel.

**Constraints:**
- Hosts are ordered by the number of repositories, then by name; `local only` counts repositories without a provider
  and is left out when 0
- The decision waits at most 2 s for the rows of the listed repositories

#### Scenario: Host line matrix

| # | Host | Provider | Credential | Line | Buttons |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `github.com` | `github` | VS Code session of `luisgomez` | **`github.com  ✓ Signed in as luisgomez (VS Code account)`** | **None** |
| R2 | `github.com` | `github` | None | **`github.com  ○ Not connected`** | **`Sign in to GitHub`, `Skip — git only`** |
| R3 | `git.acme.com` | `gitlab` | Imported from `glab` for `ana.perez` | **`git.acme.com  ✓ Signed in as ana.perez (glab login)`** | **None** |
| R4 | `git.acme.com` | `gitlab` | Stored token of `ana.perez` | **`git.acme.com  ✓ Signed in as ana.perez (token)`** | **None** |
| R5 | `git.acme.com` | `gitlab` | None | **`git.acme.com  ○ Not connected`** | **`Paste a token…`, `Skip — git only`** |
| R6 | `github.acme.com` | `github` | None | **`github.acme.com  ○ Not connected`** | **`Paste a token…`, `Skip — git only`** |

#### Scenario: First-run summary line
- **GIVEN** 14 listed repositories: 9 on `git.acme.com` (`gitlab`), 4 on `github.com` (`github`) and 1 without a remote,
  and the panel was never shown
- **WHEN** the dashboard opens
- **THEN** the panel's first line reads
  `Found 14 repositories: 9 on git.acme.com (GitLab) · 4 on github.com (GitHub) · 1 local only`

#### Scenario: Restored dashboard keeps its view
- **GIVEN** the panel was never dismissed, the dashboard is open with the filter `bill`, and a repository on
  `github.com` is listed
- **WHEN** the user runs **Developer: Reload Window**
- **THEN** the restored dashboard shows the grid with the filter `bill`, not the panel

#### Scenario: Panel shown once
- **GIVEN** the user clicked `Open dashboard →` in the first-run panel
- **WHEN** the dashboard is closed and opened again, in this or another window
- **THEN** the dashboard shows the grid
