## ADDED Requirements

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
