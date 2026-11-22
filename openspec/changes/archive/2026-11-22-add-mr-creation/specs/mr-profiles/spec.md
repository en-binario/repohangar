## Purpose

Holds a team's merge request defaults once, as named MR profiles in VS Code settings, picks the right profile for each
repository and branch, and turns the profile into the effective values of one merge request: target, reviewers,
assignees, labels, squash, delete source branch, draft, and the rendered title and description.

**Non-goals:**
- Sending the values to GitLab or GitHub, the guards and the result, owned by `mr-creation`.
- Editing profiles in a form, saving defaults from the drawer, the per-repository memory and recent reviewers: no
  capability yet (roadmap phase 3).
- Scripting in templates: no capability does.

## ADDED Requirements

### Requirement: MR profile settings
The system SHALL read MR profiles from `repohangar.mr.profiles` (default `{ "default": {} }`), an object of named
profiles whose keys are `target`, `reviewers`, `assignees`, `labels`, `squash`, `deleteSourceBranch`, `draft`, `title`,
`description`, `pushIfNeeded`, `openAfterCreate` and `extends`, and SHALL ignore every other key. A key that a profile
leaves out SHALL take its value from the profile it `extends`, else from the profile `default`, else from the
built-in defaults. The system SHALL read
the user and workspace values of the setting separately and, for a profile defined at both scopes, SHALL use the
workspace value of each key it sets and the user value of the others.

**Constraints:**
- Built-in defaults: `target` `"{defaultBranch}"`, `reviewers` `[]`, `assignees` `["@me"]`, `labels` `[]`, `squash`
  `false`, `deleteSourceBranch` `true`, `draft` `false`, `title` `"{type}: {ticket} {branchTitle}"`, `description`
  `"template:default"`, `pushIfNeeded` `true`, `openAfterCreate` `"notify"`
- `openAfterCreate`: `"notify"`, `"browser"` or `"none"`
- `extends` chains are followed to any depth

#### Scenario: Profile value matrix

| # | User scope `default` | Workspace scope `default` | `hotfix` | Profile used | Effective `reviewers` | Effective `squash` | Effective `labels` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | None | None | None | `default` | **`[]`** | **`false`** | **`[]`** |
| R2 | `{ "reviewers": ["ana.perez"], "squash": true }` | None | None | `default` | **`["ana.perez"]`** | **`true`** | **`[]`** |
| R3 | `{ "reviewers": ["ana.perez"], "squash": true }` | `{ "reviewers": ["carla.ruiz"] }` | None | `default` | **`["carla.ruiz"]`** | **`true`** | **`[]`** |
| R4 | `{ "squash": true, "labels": ["needs-review"] }` | None | `{ "extends": "default", "labels": ["hotfix"] }` | `hotfix` | **`[]`** | **`true`** | **`["hotfix"]`** |
| R5 | `{ "squash": true }` | None | `{ "labels": ["hotfix"] }` (no `extends`) | `hotfix` | **`[]`** | **`true`** | **`["hotfix"]`** |
| R6 | `{ "squash": true }` | None | `{ "extends": "base" }`, `base` = `{ "reviewers": ["sre.oncall"] }` | `hotfix` | **`["sre.oncall"]`** | **`true`** | **`[]`** |

#### Scenario: Invalid extends matrix

| # | Profiles | Profile used | Merge request | Notification |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `hotfix` extends `base`, which does not exist | `hotfix` | **Not created, no request sent** | **`MR profile "hotfix" extends "base", which does not exist.` with `Open Settings`** |
| R2 | `a` extends `b`, `b` extends `a` | `a` | **Not created, no request sent** | **`MR profile "a" extends itself through "b".` with `Open Settings`** |

### Requirement: Profile rules
The system SHALL choose the profile for a repository and branch with the first rule of `repohangar.mr.rules` (default
`[]`) whose `repo` glob matches `<host>/<project path>` and whose `branch` glob matches the branch name, a rule without
`repo` or without `branch` matching every repository or branch, and SHALL use the profile `default` when no rule
matches. The rule's `set` object SHALL override the chosen profile's values key by key. A rule that names a profile
that does not exist SHALL stop the creation with `MR rule <n> uses the profile "<name>", which does not exist.` and the
button `Open Settings`.

**Constraints:**
- Globs: `*` matches within one path segment, `**` across segments; matching is case-sensitive for branches and
  case-insensitive for hosts
- Rules are numbered from 1 in the order of the setting

#### Scenario: Rule matrix

Rules: 1 `{ "branch": "hotfix/**", "profile": "hotfix" }`, 2 `{ "repo": "git.acme.com/payments/**", "profile":
"default", "set": { "reviewers": ["carla.ruiz"] } }`, 3 `{ "repo": "github.com/acme/web-*", "profile": "default",
"set": { "labels": ["frontend"] } }`.

| # | Repository | Branch | Rule | Profile | Values from `set` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `git.acme.com/payments/billing-api` | `hotfix/ABC-99-timeout` | **1** | **`hotfix`** | **None** |
| R2 | `git.acme.com/payments/billing-api` | `feature/ABC-12-notes` | **2** | **`default`** | **`reviewers` `["carla.ruiz"]`** |
| R3 | `git.acme.com/payments/core/ledger` | `feature/ABC-12-notes` | **2** | **`default`** | **`reviewers` `["carla.ruiz"]`** |
| R4 | `github.com/acme/web-shop` | `feature/ABC-12-notes` | **3** | **`default`** | **`labels` `["frontend"]`** |
| R5 | `github.com/acme/admin-portal` | `feature/ABC-12-notes` | **None** | **`default`** | **None** |
| R6 | `Git.Acme.com/payments/billing-api` | `Hotfix/ABC-99` | **2** | **`default`** | **`reviewers` `["carla.ruiz"]`** |

### Requirement: Resolution order
The system SHALL compute the effective values of a merge request in this order, each step overriding the previous one
key by key: built-in defaults, the profile `default`, the profile chosen by the rules with its `extends` chain, the
rule's `set`, the values edited in the drawer or the quick input for this merge request only, and last the project's
squash policy.

#### Scenario: Resolution order matrix

| # | `default` | Chosen profile | Rule `set` | Edited in the drawer | Effective `reviewers` | Effective `draft` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `reviewers` `["ana.perez"]` | `default` | None | Nothing | **`["ana.perez"]`** | **`false`** |
| R2 | `reviewers` `["ana.perez"]` | `default` | `reviewers` `["carla.ruiz"]` | Nothing | **`["carla.ruiz"]`** | **`false`** |
| R3 | `reviewers` `["ana.perez"]` | `hotfix` with `draft` `true` and no `extends` | None | Nothing | **`["ana.perez"]`** | **`true`** |
| R4 | `reviewers` `["ana.perez"]` | `default` | `reviewers` `["carla.ruiz"]` | `reviewers` `["luis.gomez"]`, `draft` `true` | **`["luis.gomez"]`** | **`true`** |

### Requirement: Squash policy
The system SHALL read the GitLab project's `squash_option` with `GET /api/v4/projects/<URL-encoded project path>` (kept
for 1 h per project), SHALL set the effective `squash` to `false` when it is `never` and to `true` when it is `always`,
whatever the profile and the drawer say, and SHALL show the reason in the drawer under the squash box. For GitHub
repositories and when the project information cannot be read, the profile value SHALL stay.

**Constraints:**
- Project information is kept for 1 h per project

#### Scenario: Squash policy matrix

| # | Provider | `squash_option` | Squash after the other steps | Effective `squash` | Drawer note |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | GitLab | `never` | `true` | **`false`** | **`Squash is turned off for payments/billing-api.`** |
| R2 | GitLab | `always` | `false` | **`true`** | **`payments/billing-api requires squash.`** |
| R3 | GitLab | `default_on` | `false` | **`false`** | **None** |
| R4 | GitLab | `default_off` | `true` | **`true`** | **None** |
| R5 | GitLab | Not readable (`403`) | `true` | **`true`** | **None** |
| R6 | GitHub | *N/A* | `true` | **`true`** | **None** |

### Requirement: Title and description placeholders
The system SHALL render `title`, `description` and `target` by replacing each placeholder of the matrix with its value
for the repository and branch, SHALL keep an unknown placeholder as written, and SHALL then collapse runs of spaces in
the title into one, trim it, and remove a leading `: `.

**Constraints:**
- `{ticket}`: the first match of `repohangar.mr.ticketPattern` (default `[A-Z][A-Z0-9]+-\d+`) in the branch name, or
  empty
- `{type}`: the branch prefix before the first `/` mapped by `repohangar.mr.typeMap` (default `{ "feature": "feat",
  "bugfix": "fix", "hotfix": "fix", "chore": "chore" }`), the prefix itself when the map has no entry, empty without a
  prefix
- `{commits}`: one line `- <subject>` per commit ahead of the target, oldest first, at most 30, then
  `- … and <k> more`
- Commits ahead of the target and `{latestRelease}` are read from local refs only (`refs/remotes/<remote>/…`); no
  network

#### Scenario: Placeholder matrix

Branch `feature/ABC-123-add-billing-notes` in `billing-api`, target `main`, 2 commits ahead (`Add notes field to
invoice`, then `Expose notes in PDF`), remote branches `release/2.9` and `release/2.10`, user `ana.perez`.

| # | Placeholder | Value |
| :--- | :--- | :--- |
| R1 | `{branch}` | **`feature/ABC-123-add-billing-notes`** |
| R2 | `{type}` | **`feat`** |
| R3 | `{ticket}` | **`ABC-123`** |
| R4 | `{branchTitle}` | **`Add billing notes`** |
| R5 | `{firstCommit}` | **`Add notes field to invoice`** |
| R6 | `{commits}` | **`- Add notes field to invoice` ⏎ `- Expose notes in PDF`** |
| R7 | `{repo}` | **`billing-api`** |
| R8 | `{defaultBranch}` | **`main`** |
| R9 | `{latestRelease}` | **`2.10`** |
| R10 | `{me}` | **`ana.perez`** |
| R11 | `{nope}` | **`{nope}`** |

#### Scenario: Title rendering matrix

| # | Branch | `repohangar.mr.typeMap` | Title template | Rendered title |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `feature/ABC-123-add-billing-notes` | Default | `{type}: {ticket} {branchTitle}` | **`feat: ABC-123 Add billing notes`** |
| R2 | `bugfix/login_timeout` | Default | `{type}: {ticket} {branchTitle}` | **`fix: Login timeout`** |
| R3 | `docs/ABC-7-readme` | Default | `{type}: {ticket} {branchTitle}` | **`docs: ABC-7 Readme`** |
| R4 | `add-billing-notes` | Default | `{type}: {ticket} {branchTitle}` | **`Add billing notes`** |
| R5 | `feature/ABC-123-add-billing-notes` | `{ "feature": "feature" }` | `[{ticket}] {branchTitle}` | **`[ABC-123] Add billing notes`** |

#### Scenario: Release branch missing
- **GIVEN** the profile `hotfix` has `target` `"release/{latestRelease}"` and `origin` has no `release/*` branch in the
  local refs
- **WHEN** the user creates a merge request with `hotfix` in `billing-api`
- **THEN** no request is sent and the notification reads
  `No release/* branch of origin is known in billing-api. Fetch it, or change the target of the MR profile "hotfix".`

### Requirement: Single-commit title
When the branch has exactly one commit ahead of the target and no profile, rule or edit sets `title`, the system SHALL
use that commit's subject as the title.

#### Scenario: Single-commit title matrix

| # | Commits ahead | `title` set by a profile, rule or edit | Title |
| :--- | :--- | :--- | :--- |
| R1 | 1, `Fix rounding in invoice totals` | No | **`Fix rounding in invoice totals`** |
| R2 | 1, `Fix rounding in invoice totals` | Yes, `{type}: {branchTitle}` | **The rendered template** |
| R3 | 2 | No | **The rendered built-in template** |

### Requirement: Description templates
The system SHALL render a `description` of `template:default` from the repository's own template read from the working
tree, followed by an empty line and `{commits}` when the template does not contain `{commits}`, and from the built-in
template `## What` ⏎ `{commits}` when the repository has none. A `description` of `template:<name>` SHALL use the named
template, else the built-in one with the drawer note `Template "<name>" not found; using the built-in one.` Any other
`description` SHALL be rendered as a template itself.

**Constraints:**
- GitLab templates: `.gitlab/merge_request_templates/Default.md` for `default`, `.gitlab/merge_request_templates/<name>.md`
- GitHub templates for `default`: `.github/pull_request_template.md`, then `.github/PULL_REQUEST_TEMPLATE.md`, then the
  first file by name in `.github/PULL_REQUEST_TEMPLATE/`; for `<name>`: `.github/PULL_REQUEST_TEMPLATE/<name>.md`
- Template files are read from disk; no request is sent for them

#### Scenario: Description template matrix

| # | Provider | `description` | Files in the working tree | Description |
| :--- | :--- | :--- | :--- | :--- |
| R1 | GitLab | `template:default` | `.gitlab/merge_request_templates/Default.md` = `## Summary` | **`## Summary` ⏎ ⏎ `- Add notes field to invoice` ⏎ `- Expose notes in PDF`** |
| R2 | GitLab | `template:default` | None | **`## What` ⏎ `- Add notes field to invoice` ⏎ `- Expose notes in PDF`** |
| R3 | GitHub | `template:default` | `.github/pull_request_template.md` = `Closes {ticket}` ⏎ `{commits}` | **`Closes ABC-123` ⏎ `- Add notes field to invoice` ⏎ `- Expose notes in PDF`** |
| R4 | GitHub | `template:default` | `.github/PULL_REQUEST_TEMPLATE/bug.md`, `.github/PULL_REQUEST_TEMPLATE/feature.md` | **The content of `bug.md`, an empty line, and `{commits}`** |
| R5 | GitLab | `template:security` | No `security.md` | **The built-in template; drawer note `Template "security" not found; using the built-in one.`** |
| R6 | *Any* | `Ticket: {ticket}` | *Any* | **`Ticket: ABC-123`** |
