## Purpose

Keeps VS Code's Source Control repository selection in step with the repository a RepoHangar action targets, so the
graph, the dashboard and Source Control show the same repository after one action. VS Code has no public API for this,
so the sync is best effort and never surfaces an error.

**Non-goals:**
- Showing the Source Control view, owned by `source-control-reveal`.
- Following Git Graph's own Repo dropdown: no capability does.

## ADDED Requirements

### Requirement: Sync Source Control selection
After a graph action (`explorer-open-in-git-graph`) has opened or switched the graph to a repository, the system SHALL
make that repository the only selected repository in the Source Control Repositories view, provided that
`repohangar.gitGraph.syncSourceControlSelection` (default `true`) is `true`, `scm.repositories.selectionMode` is
`single`, and the built-in Git extension is available and enabled; Show in Source Control and the Source Control Graph
sync whatever that setting is. A sync SHALL start only after the graph command has run, SHALL NOT delay the graph,
SHALL NOT move focus or show Source Control except as `Selection commands become available` allows, and SHALL show no
notification. When the repository is not open in the Git extension, the system SHALL ask it to open the repository
first. Setting changes SHALL apply without a window reload.

**Constraints:**
- The selection is confirmed through `repository.ui.onDidChange` within 500 ms per attempt

#### Scenario: Sync outcome matrix

| # | Graph opened by the action | `syncSourceControlSelection` | `scm.repositories.selectionMode` | Git extension available and enabled | Repository open in Git (after the open attempt) | Already selected | Selection command resolved | Source Control result | Logged |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | No (warning or error path) | *Any* | *Any* | *Any* | *N/A* | *N/A* | *N/A* | **Unchanged** | **No** |
| R2 | Yes | `false` | *Any* | *Any* | *N/A* | *N/A* | *N/A* | **Unchanged** | **No** |
| R3 | Yes | `true` | `multiple` | *Any* | *N/A* | *N/A* | *N/A* | **Unchanged** | **No** |
| R4 | Yes | `true` | `single` | No | *N/A* | *N/A* | *N/A* | **Unchanged** | **Yes** (reason) |
| R5 | Yes | `true` | `single` | Yes | No | *N/A* | *N/A* | **Unchanged** | **Yes** (reason) |
| R6 | Yes | `true` | `single` | Yes | Yes | Yes | *N/A* | **Unchanged** (already selected) | **No** |
| R7 | Yes | `true` | `single` | Yes | Yes | No | Yes | **The repository is the only selected one** | **No** |
| R8 | Yes | `true` | `single` | Yes | Yes | No | No | **Not guaranteed; selection not confirmed** | **Yes** (reason) |

#### Scenario: Git Graph dropdown changes are not synced
- **GIVEN** Git Graph shows `ledger` and Source Control has `ledger` selected
- **WHEN** the user picks `billing-api` in Git Graph's own Repo dropdown
- **THEN** the Source Control selection is unchanged

### Requirement: Selection commands become available
VS Code creates the per-repository commands `workbench.scm.action.toggleRepositoryVisibility.scm<handle>` only after
the Source Control view has been shown in the window. When a sync finds none, the system SHALL show Source Control and
return to the Explorer (or, while `repohangar.gitGraph.revealSourceControl` is `true`, keep Source Control and return
focus to the editor group), then look again, at most once per window. If the commands are still missing, the sync SHALL
stop and log the reason.

#### Scenario: Selection commands availability matrix

| # | Commands registered at sync start | Source Control already shown this way in this window | Commands registered after showing | Sidebar effect | Sync continues |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Yes | *Any* | *N/A* | **None** | **Yes** |
| R2 | No | No | Yes | **Source Control shown briefly** | **Yes** |
| R3 | No | No | No | **Source Control shown briefly** | **No** (logged) |
| R4 | No | Yes | *N/A* | **None** | **No** (logged) |

### Requirement: Repeated syncs select the repository directly
The system SHALL map selection command handles to repositories through the Source Control input box documents
(`vscode-scm:git/scm<handle>/input?rootUri=…`) and the order of repositories, try the most likely handle first, and
remember a confirmed handle so that later syncs to that repository in the same window select it directly. A remembered
handle SHALL be discarded when its command is no longer registered or selecting through it does not select the
expected repository.

#### Scenario: Second sync to the same repository
- **GIVEN** a sync selected `ledger`, and then the user selected `billing-api` in Source Control
- **WHEN** the user opens the graph on `ledger` again
- **THEN** `ledger` becomes the selected repository without another repository appearing selected in between

#### Scenario: Repository closed and reopened
- **GIVEN** a sync confirmed the handle of `ledger`
- **WHEN** `ledger` is closed in the Git extension and opened again, so its handle changes
- **AND WHEN** the user opens the graph on `ledger`
- **THEN** the sync resolves the new handle and selects `ledger`, or logs the failure

### Requirement: Failure isolation
Any failure while syncing, including a missing internal command, a timeout waiting for confirmation, or an exception
from the Git extension, SHALL be caught and logged to the RepoHangar log, SHALL NOT show a notification, and SHALL NOT
affect the graph, the Explorer or the dashboard.

#### Scenario: Internal command removed in a future VS Code release
- **GIVEN** VS Code registers no `workbench.scm.action.toggleRepositoryVisibility.*` command and the selection mode is
  `single`
- **WHEN** the user opens Git Graph on `ledger`
- **THEN** Git Graph opens on `ledger`, no notification is shown, and the RepoHangar log records that no selection
  command was found
