## Purpose

Shows VS Code's Source Control view for a repository: next to the graph after Open in Git Graph, with keyboard focus
kept on the graph, and on its own from Show in Source Control.

**Non-goals:**
- Selecting the repository in the Repositories view, owned by `source-control-selection-sync`.
- Showing the Source Control Graph without Git Graph, owned by `explorer-open-in-git-graph`.

## ADDED Requirements

### Requirement: Show Source Control after opening Git Graph
After Open in Git Graph has opened or switched Git Graph to a repository, the system SHALL run `workbench.view.scm`,
opening the sidebar if it is hidden, and then `workbench.action.focusActiveEditorGroup` so keyboard focus returns to
Git Graph, provided that `repohangar.gitGraph.revealSourceControl` (default `true`) is `true`. It SHALL NOT change the
sidebar when Git Graph was not opened. This SHALL NOT depend on `repohangar.gitGraph.syncSourceControlSelection` or
`scm.repositories.selectionMode`. If showing the view fails, the system SHALL log the reason to the RepoHangar log and
show no notification, and Git Graph SHALL be unaffected. Setting changes SHALL apply without a window reload.

#### Scenario: Reveal outcome matrix

| # | Git Graph opened by the action | `repohangar.gitGraph.revealSourceControl` | Sidebar before | Showing Source Control succeeds | Sidebar after | Keyboard focus after | Logged |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | No (warning or error path) | *Any* | *Any* | *N/A* | **Unchanged** | **Unchanged** | **No** |
| R2 | Yes | `false` | *Any* | *N/A* | **Not changed by this capability** | **Git Graph** | **No** |
| R3 | Yes | `true` | Hidden | Yes | **Opened, showing Source Control** | **Git Graph** | **No** |
| R4 | Yes | `true` | Showing the Explorer | Yes | **Switched to Source Control** | **Git Graph** | **No** |
| R5 | Yes | `true` | Already showing Source Control | Yes | **Still showing Source Control** | **Git Graph** | **No** |
| R6 | Yes | `true` | *Any* | No | **Not guaranteed** | **Git Graph** | **Yes** (reason) |

#### Scenario: Source Control shown before the selection sync
- **GIVEN** `repohangar.gitGraph.revealSourceControl` and `repohangar.gitGraph.syncSourceControlSelection` are `true`
- **WHEN** the user opens Git Graph on `ledger`
- **THEN** Source Control is shown before the selection sync starts
- **AND** a failure to show it does not keep the sync from running

### Requirement: Selection sync keeps Source Control shown
While `repohangar.gitGraph.revealSourceControl` is `true`, the selection sync SHALL NOT switch the sidebar back to the
Explorer, including when it has to show Source Control so that VS Code creates its selection commands.

#### Scenario: Sidebar after sync matrix

| # | `repohangar.gitGraph.revealSourceControl` | Selection sync showed Source Control to create its commands | Sidebar after the action |
| :--- | :--- | :--- | :--- |
| R1 | `false` | No | **As before the action** |
| R2 | `false` | Yes | **Explorer** (restored by the sync) |
| R3 | `true` | *Any* | **Source Control** |

### Requirement: Show in Source Control
Show in Source Control SHALL run `workbench.view.scm`, leaving keyboard focus in Source Control, and then the selection
sync for the repository, whatever `repohangar.gitGraph.syncSourceControlSelection` is. It SHALL run from `s` on the
focused row, the `⋯` item **Show in Source Control** (`s`, after **Reveal in Explorer**), the row details button
`[Show in Source Control]`, a click on the Changes cell, and `repohangar.showInSourceControl` (*RepoHangar: Show
Repository in Source Control*) for the active repository. The footer SHALL add `s source control` after `e explorer`.

#### Scenario: Show in Source Control matrix

| # | Trigger | `scm.repositories.selectionMode` | `repohangar.gitGraph.syncSourceControlSelection` | Result |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `s` on `ledger` | `single` | `false` | **Source Control shown with focus; `ledger` is the selected repository** |
| R2 | A click on the Changes cell of `ledger` | `single` | `true` | **Source Control shown with focus; `ledger` is the selected repository** |
| R3 | `repohangar.showInSourceControl` with a file of `ledger` active | `multiple` | *Any* | **Source Control shown with focus; selection unchanged** |
