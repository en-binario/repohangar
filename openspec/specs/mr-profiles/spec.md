# mr-profiles Specification

## Purpose
Holds a team's merge request defaults once, as named MR profiles in VS Code settings, picks the right profile for each
repository and branch, and turns the profile into the effective values of one merge request: target, reviewers,
assignees, labels, squash, delete source branch, draft, and the rendered title and description.

**Non-goals:**
- Sending the values to GitLab or GitHub, the guards and the result, owned by `mr-creation`.
- Scripting in templates: no capability does.

## Requirements

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

### Requirement: Related placeholder
The system SHALL render `{related}` in a description as the related-links section of `mr-creation` `Related links`
when the merge request is created in a selection batch, and as an empty string otherwise. A description of
`template:default` that does not contain `{related}` SHALL get no placeholder added; the section is appended when the
links are written.

#### Scenario: Related placeholder matrix

| # | Created in | `description` | Rendered at creation | After the related links are written |
| :--- | :--- | :--- | :--- | :--- |
| R1 | One repository (`m` with no selection) | `## What` ⏎ `{commits}` ⏎ `{related}` | **`## What` ⏎ `- Add notes field to invoice`** | *N/A* |
| R2 | A selection of 3 | `## What` ⏎ `{commits}` ⏎ `{related}` | **`## What` ⏎ `- Add notes field to invoice` ⏎ the section markers with no lines** | **The section at the place of `{related}`** |
| R3 | A selection of 3 | `template:default`, repository template without `{related}` | **The template and `{commits}`** | **The section appended after an empty line** |

### Requirement: Open the profile editor
The system SHALL open the MR profile editor as a panel titled `MR Profiles` in the active editor group from
`repohangar.profiles.edit` (*RepoHangar: Edit MR Profiles*), the `⚙` button of the dashboard toolbar (tooltip
`Edit MR profiles`) and **Set up a default profile** in the first-run hosts panel, and SHALL keep at most one editor
panel per window, revealing it when it exists.

#### Scenario: Open the editor twice
- **GIVEN** the `MR Profiles` panel is open in a background tab
- **WHEN** the user clicks `⚙` in the dashboard toolbar
- **THEN** the existing panel becomes the active tab and the window has one `MR Profiles` panel

### Requirement: Profile editor content
The editor SHALL show a scope switch **User** / **Workspace** (Workspace disabled without an open folder or workspace),
then, for the chosen scope, the profiles defined there (`default` first, marked `★`, then by name) and **New profile**;
the rules of `repohangar.mr.rules` at that scope in order, each as `<n> <glob> → <profile>` with its `set` summary,
and **New rule**; and, for the selected profile, the fields **Target branch**, **Title template** with a live preview,
**Description** (**Repo template, else built-in** or **Custom…**), **Reviewers**, **Assignees**, **Labels**, the boxes
**Squash**, **Delete source branch**, **Draft** and **Push branch if needed**, and **After create**
(`Notify`, `Open in browser`, `Nothing`). A field the profile does not set SHALL show the inherited value in a dimmed
style with the tooltip `Inherited from <profile|built-in defaults>`.

**Constraints:**
- The title preview renders the template for the focused dashboard row's repository and branch, else for the branch
  `feature/ABC-12-add-notes` in a repository named `example`
- Profile names: 1 to 40 characters from `A–Z a–z 0–9 . _ -`, unique within the scope

#### Scenario: Title preview
- **GIVEN** the dashboard focus is on `billing-api` on `feature/ABC-12-add-notes`
- **WHEN** the user types `{type}: {ticket} {branchTitle}` in **Title template**
- **THEN** the preview next to the field reads `→ feat: ABC-12 Add notes`

#### Scenario: New profile name matrix

| # | Name typed | Existing profiles at the scope | Result |
| :--- | :--- | :--- | :--- |
| R1 | `hotfix` | `default` | **Profile `hotfix` added to the list, unsaved** |
| R2 | `default` | `default` | **Input message `A profile named "default" already exists.`** |
| R3 | `hot fix` | `default` | **Input message `Use letters, digits, ".", "_" or "-" (up to 40).`** |
| R4 | Empty | *Any* | **Input message `Use letters, digits, ".", "_" or "-" (up to 40).`** |

### Requirement: Save profiles and rules
**Save** SHALL write `repohangar.mr.profiles` and `repohangar.mr.rules` at the chosen scope only, through
`WorkspaceConfiguration.update` with `ConfigurationTarget.Global` (User) or `ConfigurationTarget.Workspace`
(Workspace), with the keys each profile sets explicitly and no inherited values, and SHALL keep every profile, rule
and key of that scope that the editor did not change, and every setting at the other scope. Deleting a profile SHALL
ask `Delete the MR profile "<name>"? Rules that use it will stop working.` with **Delete**, and the profile `default`
SHALL NOT be deletable. **Open settings.json** SHALL open the user `settings.json` (User) or the workspace settings file
(Workspace).

#### Scenario: Round trip keeps comments
- **GIVEN** the user `settings.json` contains the line `// team defaults, ask Ana before changing` above
  `"repohangar.mr.profiles"`, the line `// larger font for demos` above `"editor.fontSize"`, and the profiles `default`
  and `hotfix`
- **WHEN** the user opens the editor, sets **Labels** of `hotfix` to `hotfix`, `priority::1` and clicks **Save**
- **THEN** the file still contains both comment lines and every other setting unchanged
- **AND** `repohangar.mr.profiles` at user scope equals the previous value with `hotfix.labels` set to
  `["hotfix", "priority::1"]`
- **AND** the workspace value of `repohangar.mr.profiles` is unchanged

#### Scenario: Save scope matrix

| # | Scope switch | Edit | Written | Unchanged |
| :--- | :--- | :--- | :--- | :--- |
| R1 | User | `default.reviewers` → `["ana.perez"]` | **`repohangar.mr.profiles` at user scope** | **Workspace `repohangar.mr.profiles` and `repohangar.mr.rules`; user `repohangar.mr.rules`** |
| R2 | Workspace | Rule 2 moved above rule 1 | **`repohangar.mr.rules` at workspace scope, in the new order** | **Every user-scope value; workspace `repohangar.mr.profiles`** |
| R3 | Workspace | New profile `docs` with `labels` `["docs"]` | **`repohangar.mr.profiles` at workspace scope with `docs` = `{ "labels": ["docs"] }`** | **Every other profile of both scopes** |
| R4 | User | Nothing | **Nothing; Save is disabled** | **Everything** |

#### Scenario: Delete the default profile
- **GIVEN** the editor shows the profile `default`
- **WHEN** the user opens its context actions
- **THEN** **Delete** is disabled with the tooltip `The default profile cannot be deleted.`

### Requirement: Settings changed outside the editor
While the editor is open, a change of `repohangar.mr.profiles` or `repohangar.mr.rules` made elsewhere SHALL reload the
editor when it has no unsaved edits, and SHALL otherwise show the banner
`MR profiles changed in settings.json.` with **Reload** (discards the edits) and **Keep editing**.

#### Scenario: External change with unsaved edits
- **GIVEN** the editor has an unsaved edit of `default.labels`
- **WHEN** the user changes `repohangar.mr.profiles` in `settings.json` and saves the file
- **THEN** the editor shows the banner `MR profiles changed in settings.json.` with `Reload` and `Keep editing`
- **AND** no setting is written

### Requirement: Save as defaults
The Create MR drawer SHALL show the split button **Save as defaults ▾** with **For me (all workspaces)**, **For this
workspace (shared)** and **For this repo only**. Each SHALL save the drawer's values of `reviewers`, `assignees`,
`labels`, `squash`, `deleteSourceBranch` and `draft` that differ from the profile's effective values, as the matrix
states, and SHALL then show `Saved <keys> to <target>.` The title, the description and the target SHALL NOT be saved.
A value forced by the squash policy SHALL NOT be saved. **For this workspace (shared)** SHALL be disabled without an
open folder or workspace.

#### Scenario: Save as defaults matrix

Profile `default` (user scope) has `reviewers` `["ana.perez"]`, `squash` `false`; the drawer for `billing-api` has
`reviewers` `["ana.perez", "carla.ruiz"]`, `squash` `true`, the title edited.

| # | Item | Written | Notification |
| :--- | :--- | :--- | :--- |
| R1 | **For me (all workspaces)** | **`repohangar.mr.profiles.default` at user scope: `reviewers` `["ana.perez", "carla.ruiz"]`, `squash` `true`; no title** | **`Saved reviewers, squash to the MR profile "default" (user settings).`** |
| R2 | **For this workspace (shared)** | **`repohangar.mr.profiles.default` at workspace scope: `reviewers` `["ana.perez", "carla.ruiz"]`, `squash` `true`** | **`Saved reviewers, squash to the MR profile "default" (workspace settings).`** |
| R3 | **For this repo only** | **`workspaceState` `repohangar.mr.repoMemory["git.acme.com/payments/billing-api"]` = `{ "reviewers": ["ana.perez", "carla.ruiz"], "squash": true }`; no setting** | **`Saved reviewers, squash for billing-api in this workspace.`** |
| R4 | Any item, with no value differing from the profile | **Nothing** | **`Nothing to save: the values match the MR profile "default".`** |

### Requirement: Per-repository memory
The system SHALL apply the per-repository memory of the repository (`workspaceState` `repohangar.mr.repoMemory`, keyed
by `<host>/<project path>`) after the rule's `set` and before the drawer edits in `Resolution order`, key by key. The
profile editor SHALL list the memory of the open workspace as `<repository> → <key> <value>` lines, each with
**Forget**, which removes that repository's entry.

#### Scenario: Memory in the resolution order matrix

| # | Rule `set` | Repository memory | Drawer edit | Effective `reviewers` |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `reviewers` `["carla.ruiz"]` | None | None | **`["carla.ruiz"]`** |
| R2 | `reviewers` `["carla.ruiz"]` | `reviewers` `["carla.ruiz", "luis.gomez"]` | None | **`["carla.ruiz", "luis.gomez"]`** |
| R3 | `reviewers` `["carla.ruiz"]` | `reviewers` `["carla.ruiz", "luis.gomez"]` | `reviewers` `["ana.perez"]` | **`["ana.perez"]`** |

#### Scenario: Forget a repository memory
- **GIVEN** the editor lists `billing-api → reviewers +carla.ruiz`
- **WHEN** the user clicks `Forget`
- **THEN** `repohangar.mr.repoMemory` has no `git.acme.com/payments/billing-api` entry and the line is gone

### Requirement: Recent reviewers and labels
After each creation, the system SHALL record the reviewers and labels it sent in `globalState`
`repohangar.mr.recent.<host>`, most recent first, without duplicates, and the drawer SHALL show under **Reviewers** and
**Labels** a line `recent: <values>` with the recent values of the repository's host that the field does not hold yet,
each a button that adds it.

**Constraints:**
- At most 10 reviewers and 10 labels per host

#### Scenario: Recent reviewers matrix

| # | Recent reviewers of `git.acme.com` | Reviewers in the drawer | Line under Reviewers |
| :--- | :--- | :--- | :--- |
| R1 | None | `ana.perez` | **None** |
| R2 | `luis.gomez`, `team:backend`, `ana.perez` | `ana.perez` | **`recent: luis.gomez · team:backend`** |
| R3 | 12 created merge requests with 12 different reviewers | None | **The 10 most recent** |

### Requirement: Defaults line in the first-run panel
The first-run hosts panel (`provider-auth`) SHALL show, after the host lines, `Merge request defaults: none yet.` with
**Set up a default profile** and the note `(you can also save them from the form)` when no profile key is set at user or
workspace scope, and `Merge request defaults: <n> profiles.` with **Edit profiles** otherwise.

#### Scenario: Defaults line matrix

| # | `repohangar.mr.profiles` at user and workspace scope | Line |
| :--- | :--- | :--- |
| R1 | Not set, or only `{ "default": {} }` | **`Merge request defaults: none yet.` with `Set up a default profile`** |
| R2 | `default` and `hotfix` with keys | **`Merge request defaults: 2 profiles.` with `Edit profiles`** |

### Requirement: Find users in the profile editor
The profile editor SHALL show **Search users in** above **Reviewers**: a list of every repository in the dashboard whose
provider is `gitlab` or `github`, each as `<repository> (<host>)`, sorted by repository name. The **Reviewers** and
**Assignees** fields of the selected profile SHALL search the users of the chosen repository with the list, keys and
requests of `mr-creation` **Find users in the Reviewers and Assignees fields**. A user chosen in the list SHALL become an
unsaved edit of the profile, and a setting SHALL be written only on **Save**. **Search users in** SHALL default to the
focused dashboard row's repository when it is hosted, else to the first hosted repository by name. Without a hosted
repository, the editor SHALL show `Add a GitLab or GitHub repository to search users.` in its place, and the fields
SHALL take typed text only, with no request.

**Constraints:**
- The choice in **Search users in** lasts while the editor is open and is never written to a setting

#### Scenario: Search users in default matrix

| # | Focused dashboard row | Hosted repositories in the dashboard | Search users in | Requests |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `web-shop` (`github`) | `billing-api` (`git.acme.com`), `web-shop` (`github.com`) | **`web-shop (github.com)` selected** | **Searches `acme/web-shop`** |
| R2 | `notes` (provider `unknown`) | `billing-api` (`git.acme.com`), `web-shop` (`github.com`) | **`billing-api (git.acme.com)` selected** | **Searches `payments/billing-api`** |
| R3 | None | `web-shop` (`github.com`), `billing-api` (`git.acme.com`) | **`billing-api (git.acme.com)` selected** | **Searches `payments/billing-api`** |
| R4 | `notes` (provider `unknown`) | None | **Not shown; the note `Add a GitLab or GitHub repository to search users.`** | **None; Reviewers and Assignees take typed text** |

#### Scenario: Pick a reviewer for a profile
- **GIVEN** the editor shows profile `default` (user scope) with **Search users in** `billing-api (git.acme.com)`
- **WHEN** the user types `jhon` in **Reviewers** and presses Enter on `Jhon Tapia @jtapia`
- **THEN** **Reviewers** shows the chip `jtapia` and the profile is marked unsaved
- **AND** `repohangar.mr.profiles` is unchanged until the user clicks **Save**
- **AND WHEN** the user clicks **Save**
- **THEN** `repohangar.mr.profiles.default.reviewers` at user scope contains `jtapia`

#### Scenario: Change the repository searched
- **GIVEN** **Search users in** shows `billing-api (git.acme.com)`
- **WHEN** the user chooses `web-shop (github.com)` and types `ana` in **Assignees**
- **THEN** the search is one GraphQL `assignableUsers(query: "ana", first: 10)` request for `acme/web-shop` to
  `https://api.github.com/graphql`, and no request goes to `git.acme.com`
