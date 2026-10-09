## Purpose

Takes the user from a repository row to its folder in the Explorer in one step, including repositories that are not
inside any workspace folder, and decides what a click on the repository name does.

**Non-goals:**
- Revealing the repository in the operating system's file manager from the `⋯` menu, owned by `git-operations`.
- Repositories found outside the workspace through scan roots, owned by `scan-roots` (phase 4); this capability only
  decides what Reveal does with them.

## ADDED Requirements

### Requirement: Reveal in Explorer
Revealing a repository inside a workspace folder SHALL run `revealInExplorer` with the repository root, which shows the
Explorer, expands the parent folders, and selects and focuses the repository folder. When
`repohangar.explorer.collapseBeforeReveal` (default `false`) is `true`, the system SHALL first run
`workbench.files.action.collapseExplorerFolders`.

#### Scenario: Reveal matrix

| # | `repohangar.explorer.collapseBeforeReveal` | Commands, in order | Explorer after |
| :--- | :--- | :--- | :--- |
| R1 | `false` | **`revealInExplorer` (root)** | **Repository folder selected and focused; other folders keep their state** |
| R2 | `true` | **`workbench.files.action.collapseExplorerFolders`, then `revealInExplorer` (root)** | **Only the path to the repository folder expanded; the folder selected and focused** |

### Requirement: Repositories outside the workspace folders
Revealing a repository that no workspace folder contains SHALL follow `repohangar.explorer.outsideWorkspace` (default
`"ask"`). With `"ask"`, a quick pick SHALL offer **Add to Workspace**, **Open in New Window** and **Reveal in File
Explorer** (named after the OS), each with the item button **Always do this**, which writes the matching value to
`repohangar.explorer.outsideWorkspace` at user scope before running the choice. Dismissing the quick pick SHALL change
nothing.

#### Scenario: Outside workspace matrix

| # | `repohangar.explorer.outsideWorkspace` | User choice | Runs | Setting written |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `addToWorkspace` | *N/A* | **`workspace.updateWorkspaceFolders` adds the root as the last folder, then `revealInExplorer` (root)** | **None** |
| R2 | `newWindow` | *N/A* | **`vscode.openFolder` with the root and `forceNewWindow: true`** | **None** |
| R3 | `revealInOS` | *N/A* | **`revealFileInOS` with the root** | **None** |
| R4 | `ask` | **Add to Workspace** | **As R1** | **None** |
| R5 | `ask` | **Open in New Window** with **Always do this** | **As R2** | **`repohangar.explorer.outsideWorkspace` = `"newWindow"` at user scope** |
| R6 | `ask` | Quick pick dismissed | **Nothing** | **None** |

### Requirement: Reveal entry points
The system SHALL reveal from: `e` and the `▤` hover button on the focused row, the `⋯` item **Reveal in Explorer**
(`e`, after **Open in Git Graph**), the button `[Reveal in Explorer]` in the row details, the Source Control
Repositories context menu item **Reveal in Explorer**, and `repohangar.revealInExplorer` (*RepoHangar: Reveal
Repository in Explorer*) for the active repository. The footer SHALL add `e explorer` after `g graph`.

#### Scenario: Reveal with e
- **GIVEN** the dashboard has focus on the row of `ledger`
- **WHEN** the user presses `e`
- **THEN** the Explorer shows and selects the folder `acme/backend/ledger`, and keyboard focus is in the Explorer

### Requirement: Repository name click
A click on the repository name in the Repository cell SHALL run the action that `repohangar.dashboard.nameClick`
(default `"explorer"`) names.

#### Scenario: Name click matrix

| # | `repohangar.dashboard.nameClick` | Click on `ledger` runs |
| :--- | :--- | :--- |
| R1 | `explorer` | **Reveal in Explorer** |
| R2 | `gitGraph` | **The graph action of `explorer-open-in-git-graph`** |
| R3 | `sourceControl` | **Show in Source Control (`source-control-reveal`)** |
