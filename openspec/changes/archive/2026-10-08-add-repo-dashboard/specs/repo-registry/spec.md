## Purpose

Decides which Git repositories RepoHangar lists, which remote stands for each one (with its host, project path, web URL
and provider), and which group each repository belongs to, so every other capability works on the same set of rows.

**Non-goals:**
- Repositories outside the workspace folders and light mode, owned by `scan-roots`.
- Probing an unknown host (`/api/v4/version`, `/api/v3/meta`) and the "This host is GitLab / GitHub" choice, owned by
  `hosting-providers`.
- The Explorer repo-root scan and the `repohangar.repositoryRoots` context key, owned by `explorer-open-in-git-graph`.
- How groups are drawn, collapsed and chosen in the dashboard, owned by `dashboard`.
- Cloning repositories or managing a manifest of repositories: no capability does.

## ADDED Requirements

### Requirement: Repositories come from the Git extension
The system SHALL list exactly the repositories in the `repositories` array of the built-in Git extension's API
(`vscode.git`, `getAPI(1)`), one row per repository, SHALL add a row when `onDidOpenRepository` fires and remove it
when `onDidCloseRepository` fires, and MUST NOT discover repositories by any other means.

**Constraints:**
- Row id: the repository's `rootUri.toString()`
- Row name: the last segment of the repository root path
- Submodules, worktrees and nested repositories that the Git extension opens each get their own row

#### Scenario: Repository opened by the Git extension
- **GIVEN** the dashboard lists `billing-api` and `ledger`
- **WHEN** the Git extension opens `/home/dev/code/acme/frontend/web-shop` and fires `onDidOpenRepository`
- **THEN** the registry holds three rows, `billing-api`, `ledger` and `web-shop`
- **AND** the new row's id is `file:///home/dev/code/acme/frontend/web-shop`

#### Scenario: Repository closed by the Git extension
- **GIVEN** the dashboard lists `billing-api`, `ledger` and `web-shop`
- **WHEN** the Git extension closes `ledger` and fires `onDidCloseRepository`
- **THEN** the registry holds two rows, `billing-api` and `web-shop`

#### Scenario: Submodule listed as its own row
- **GIVEN** the Git extension's `repositories` contains `/home/dev/code/acme/platform` and its submodule
  `/home/dev/code/acme/platform/vendor/shared-proto`
- **WHEN** the registry loads
- **THEN** it holds two rows, `platform` and `shared-proto`

#### Scenario: Folder with a .git directory that the Git extension did not open
- **GIVEN** `/home/dev/code/acme/tools/scratch` contains a `.git` directory and is listed in `git.ignoredRepositories`
- **WHEN** the registry loads
- **THEN** no row named `scratch` exists

### Requirement: Remote chosen for a repository
The system SHALL represent each repository by one remote: the remote of the current branch's upstream when that
remote is among the repository's remotes, else the remote named `origin`, else the first remote in
`repository.state.remotes`, and SHALL record no remote when the repository has none. The remote's fetch URL is used,
or its push URL when it has no fetch URL.

#### Scenario: Remote choice matrix

| # | Upstream of the current branch | Remotes of the repository | Chosen remote |
| :--- | :--- | :--- | :--- |
| R1 | `fork/feature/ABC-12-notes` | `fork`, `origin` | **`fork`** |
| R2 | `gone/feature/ABC-12-notes` (remote `gone` was removed) | `origin`, `fork` | **`origin`** |
| R3 | None | `origin`, `fork` | **`origin`** |
| R4 | None, HEAD detached | `origin` | **`origin`** |
| R5 | None | `alpha`, `beta` (in this order in `repository.state.remotes`) | **`alpha`** |
| R6 | None | None | **No remote** |

### Requirement: Remote URL parsing
The system SHALL parse the chosen remote's URL into a host, a project path and a web URL for `https://`, `http://`,
`ssh://`, `git://` and scp-style (`user@host:path`) URLs, SHALL keep every group and subgroup in the project path, and
SHALL treat local paths and `file://` URLs as not hosted. The parsed remote MUST NOT contain the user name or password
of an `https://` or `http://` URL.

**Constraints:**
- Host: lower-cased, without port
- Project path: without leading or trailing `/` and without a trailing `.git`
- Web URL: `https://<host>[:<port>]/<project path>`, keeping the port of an `https://` or `http://` URL and dropping
  the port of an `ssh://` URL
- A Windows drive path (`C:/…`, `C:\…`) is a local path, not an scp-style URL with host `c`

#### Scenario: Remote URL parsing matrix

| # | Remote URL | Host | Project path | Web URL |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `https://gitlab.com/payments/billing-api.git` | **`gitlab.com`** | **`payments/billing-api`** | **`https://gitlab.com/payments/billing-api`** |
| R2 | `https://gitlab.com/payments/core/ledger` | **`gitlab.com`** | **`payments/core/ledger`** | **`https://gitlab.com/payments/core/ledger`** |
| R3 | `https://ci-bot:glpat-x1y2z3@git.acme.com/payments/billing-api.git` | **`git.acme.com`** | **`payments/billing-api`** | **`https://git.acme.com/payments/billing-api`** |
| R4 | `https://git.acme.com:8443/payments/billing-api.git` | **`git.acme.com`** | **`payments/billing-api`** | **`https://git.acme.com:8443/payments/billing-api`** |
| R5 | `ssh://git@git.acme.com:2222/payments/ledger.git` | **`git.acme.com`** | **`payments/ledger`** | **`https://git.acme.com/payments/ledger`** |
| R6 | `git@github.com:acme/web-shop.git` | **`github.com`** | **`acme/web-shop`** | **`https://github.com/acme/web-shop`** |
| R7 | `git@GitHub.com:acme/web-shop` | **`github.com`** | **`acme/web-shop`** | **`https://github.com/acme/web-shop`** |
| R8 | `https://github.com/acme/web-shop/` | **`github.com`** | **`acme/web-shop`** | **`https://github.com/acme/web-shop`** |
| R9 | `git://git.acme.com/payments/ledger.git` | **`git.acme.com`** | **`payments/ledger`** | **`https://git.acme.com/payments/ledger`** |
| R10 | `/srv/git/billing-api.git` | **None (not hosted)** | **None** | **None** |
| R11 | `file:///srv/git/billing-api.git` | **None (not hosted)** | **None** | **None** |
| R12 | `C:/remotes/billing-api.git` | **None (not hosted)** | **None** | **None** |

### Requirement: Provider from static detection
The system SHALL assign each repository with a hosted remote a provider by checking, in this order, the
`repohangar.hosts` setting (default `{}`), the hosts `github.com` (GitHub) and `gitlab.com` (GitLab), and the host of
VS Code's `github-enterprise.uri` setting (GitHub), and SHALL assign `unknown` when none matches. A repository with no
remote or a not-hosted remote has no provider. The system SHALL apply a change to `repohangar.hosts` or
`github-enterprise.uri` to every row without a window reload.

**Constraints:**
- Host names are compared case-insensitively and without port
- `repohangar.hosts` values: `"gitlab"` or `"github"`

#### Scenario: Provider detection matrix

| # | Chosen remote | Host | `repohangar.hosts` entry for the host | `github-enterprise.uri` | Provider |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | None | *N/A* | *N/A* | *Any* | **None** |
| R2 | Not hosted (`/srv/git/billing-api.git`) | *N/A* | *N/A* | *Any* | **None** |
| R3 | Hosted | `git.acme.com` | `"gitlab"` | *Any* | **`gitlab`** |
| R4 | Hosted | `Git.Acme.com` | `"gitlab"` (key `git.acme.com`) | *Any* | **`gitlab`** |
| R5 | Hosted | `github.com` | `"gitlab"` | *Any* | **`gitlab`** |
| R6 | Hosted | `github.com` | None | *Any* | **`github`** |
| R7 | Hosted | `gitlab.com` | None | *Any* | **`gitlab`** |
| R8 | Hosted | `github.acme.com` | None | `https://github.acme.com` | **`github`** |
| R9 | Hosted | `git.acme.com` | None | `https://github.acme.com` | **`unknown`** |
| R10 | Hosted | `git.acme.com` | None | Not set | **`unknown`** |

#### Scenario: Hosts setting changed while the dashboard is open
- **GIVEN** `billing-api` has the remote host `git.acme.com`, `repohangar.hosts` is `{}` and its provider is `unknown`
- **WHEN** the user sets `repohangar.hosts` to `{ "git.acme.com": "gitlab" }` at user scope
- **THEN** the provider of `billing-api` is `gitlab` without a window reload

### Requirement: Repository groups
The system SHALL put each repository in one group according to the effective grouping mode, which is
`repohangar.groupBy` (default `"parentFolder"`) unless the dashboard's Group menu overrides it for the workspace:
`parentFolder` uses the name of the folder that contains the repository root; `workspaceFolder` uses the name of the
workspace folder that contains the repository root; `custom` uses the first key of `repohangar.groups` (default `{}`)
with a glob that matches the repository root path; `none` puts no repository in a group. A repository that no workspace
folder contains (`workspaceFolder`) or that no glob matches (`custom`) SHALL be in the group `Other`.

**Constraints:**
- Globs are matched against the absolute repository root path written with `/` separators, case-insensitively on
  Windows and case-sensitively elsewhere
- `repohangar.groups` keys are checked in the order they appear in the setting, and a key's globs in array order

#### Scenario: Group assignment matrix

| # | Grouping mode | Repository root | Workspace folder containing it | `repohangar.groups` | Group |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `parentFolder` | `/home/dev/code/acme/backend/billing-api` | *Any* | *Any* | **`backend`** |
| R2 | `workspaceFolder` | `/home/dev/code/acme/backend/billing-api` | `acme` (`/home/dev/code/acme`) | *Any* | **`acme`** |
| R3 | `workspaceFolder` | `/home/dev/code/tools/release-cli` | None | *Any* | **`Other`** |
| R4 | `custom` | `/home/dev/code/acme/backend/billing-api` | *Any* | `{ "payments": ["**/billing-*", "**/ledger"], "web": ["**/web-*"] }` | **`payments`** |
| R5 | `custom` | `/home/dev/code/acme/frontend/web-shop` | *Any* | `{ "payments": ["**/billing-*", "**/ledger"], "web": ["**/web-*"] }` | **`web`** |
| R6 | `custom` | `/home/dev/code/acme/infra/charts` | *Any* | `{ "payments": ["**/billing-*", "**/ledger"], "web": ["**/web-*"] }` | **`Other`** |
| R7 | `custom` | `/home/dev/code/acme/backend/billing-api` | *Any* | `{ "a": ["**/billing-*"], "b": ["**/billing-api"] }` | **`a`** |
| R8 | `custom` | `/home/dev/code/acme/backend/billing-api` | *Any* | `{}` | **`Other`** |
| R9 | `none` | *Any* | *Any* | *Any* | **No group** |
