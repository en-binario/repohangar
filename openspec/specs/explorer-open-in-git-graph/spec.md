# explorer-open-in-git-graph Specification

## Purpose
Opens the commit graph of a repository in one step from the dashboard, Source Control, the Explorer context menu or a
key: in the Git Graph extension when it is installed, otherwise in VS Code's built-in Source Control Graph. Also owns
the Explorer context menu items and the repository roots they rely on.

**Non-goals:**
- Showing Source Control and returning focus after the graph opens, owned by `source-control-reveal`.
- Selecting the repository in the Source Control Repositories view, owned by `source-control-selection-sync`.
- Reading the old `gitGraphOpener.*` settings and the duplicate-item guard, owned by `git-graph-opener-migration`.
- Drawing a commit graph: no capability does; RepoHangar opens Git Graph or VS Code's graph.

## Requirements

### Requirement: Git Graph detection
The system SHALL set the context key `repohangar.gitGraph.installed` to whether the extension `mhutchie.git-graph` is
installed and enabled, at activation and whenever extensions change, without a window reload.

#### Scenario: Git Graph installed while the window is open
- **GIVEN** Git Graph is not installed and `repohangar.gitGraph.installed` is `false`
- **WHEN** the user installs Git Graph
- **THEN** `repohangar.gitGraph.installed` becomes `true` without a window reload
- **AND** the graph items of RepoHangar read **Open in Git Graph**

### Requirement: Graph command variants
The system SHALL provide `repohangar.openInGitGraph` (*RepoHangar: Open in Git Graph*) and
`repohangar.openInSourceControlGraph` (*RepoHangar: Open in Source Control Graph*), and SHALL show, run and label the
graph entry points according to whether Git Graph is installed and `repohangar.gitGraph.whenMissing` (default
`"sourceControlGraph"`). RepoHangar MUST NOT install an extension unless the user clicks `Install Git Graph`, which runs
`workbench.extensions.installExtension` with `mhutchie.git-graph`.

#### Scenario: Graph item matrix

| # | Git Graph installed | `repohangar.gitGraph.whenMissing` | Menu items | `g`, `Ctrl+Alt+J` (`Ctrl+Cmd+J`) | Dashboard `◈` tooltip |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Yes | *Any* | **Open in Git Graph** | **Opens Git Graph on the repository** | **`Open in Git Graph`** |
| R2 | No | `sourceControlGraph` | **Open in Source Control Graph** | **Opens the Source Control Graph on the repository** | **`Open in Source Control Graph`** |
| R3 | No | `offerInstall` | **Open in Git Graph** | **Notification `Git Graph is not installed.` with `Install Git Graph`** | **`Open in Git Graph`** |
| R4 | No | `hide` | **Hidden** | **Notification `Git Graph is not installed.` with `Install Git Graph`** | **No `◈` button** |

### Requirement: Open Git Graph
Opening Git Graph SHALL resolve the target to its repository root, the nearest ancestor-or-self folder containing a
`.git` entry (directory or file), activate Git Graph if needed, and run `git-graph.view` with `{ rootUri }`, which
opens or reveals the view and switches it to that repository, registering the repository with Git Graph when Git Graph
has not found it. When `git-graph.view` with that argument throws, the system SHALL run `git-graph.view` without
arguments. A target outside every repository SHALL open nothing and show a warning naming the folder.

#### Scenario: Open Git Graph matrix

| # | Target inside a Git repository | `git-graph.view` registered after activation | Call with `{ rootUri }` | Result | Notification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | No (`acme/docs`) | *Any* | *N/A* | **Git Graph not opened** | **Warning `Cannot open Git Graph: "acme/docs" is not in a Git repository.`** |
| R2 | Yes | No | *N/A* | **Git Graph not opened** | **Error `The Git Graph extension (mhutchie.git-graph) is required to open Git Graph.`** |
| R3 | Yes (root or subfolder) | Yes | Succeeds | **Git Graph shows the repository root** | **None** |
| R4 | Yes | Yes | Throws | **`git-graph.view` without arguments; Git Graph opens on its last repository** | **None; the RepoHangar log records that the repository must be picked in Git Graph's dropdown** |

### Requirement: Open the Source Control Graph
Without Git Graph and with `whenMissing` set to `"sourceControlGraph"`, opening the graph SHALL run
`workbench.view.scm`, then the selection sync of `source-control-selection-sync` for the repository, then
`workbench.scm.history.focus`.

#### Scenario: Source Control Graph on a repository
- **GIVEN** Git Graph is not installed, `whenMissing` is `"sourceControlGraph"` and `scm.repositories.selectionMode` is
  `single`
- **WHEN** the user presses `g` on the row of `ledger`
- **THEN** the Source Control view is shown, `ledger` is the selected repository, and the Source Control Graph view
  has keyboard focus

### Requirement: Graph entry points
The system SHALL open the graph from: `g` and the `◈` hover button on the focused row (also when rows are selected),
the first item of the row `⋯` menu (`Open in Git Graph  g`, before **Reveal in Explorer**), the button
`[Open in Git Graph]` in the row details, the Source Control Repositories context menu (`scm/sourceControl`), the
Explorer context menu, and the commands with the keybinding `Ctrl+Alt+J` (`Ctrl+Cmd+J` on macOS), which act on the
active repository. The footer SHALL add `g graph` to the action hints after those of `git-operations`.

**Constraints:**
- Two keybinding entries share the key with opposite `when` clauses, one per command variant

#### Scenario: Graph entry point matrix

| # | Entry point | Target |
| :--- | :--- | :--- |
| R1 | `g` on `web-shop` with `billing-api` and `ledger` selected | **`web-shop`** |
| R2 | `◈` hover button on `ledger` | **`ledger`** |
| R3 | `⋯` menu of `ledger`, **Open in Git Graph** | **`ledger`** |
| R4 | Row details of `ledger`, `[Open in Git Graph]` | **`ledger`** |
| R5 | Source Control Repositories menu on `ledger` | **`ledger`** |
| R6 | Explorer menu on `acme/backend/ledger/src` (with `showOn: allFolders`) | **`ledger`** |
| R7 | `Ctrl+Alt+J` with a file of `billing-api` in the active editor | **`billing-api`** |

### Requirement: Explorer context menu items
The system SHALL contribute to the Explorer context menu **Open in Git Graph** (or **Open in Source Control Graph**) at
`navigation@100` and a **RepoHangar** submenu at `navigation@101`, only on a single selected folder that is a
repository root, or any folder when `repohangar.explorer.contextMenu.showOn` (default `"repositoryRoots"`) is
`"allFolders"`. The graph item follows the graph item matrix and is hidden while Git Graph Opener is installed
(`git-graph-opener-migration`); the submenu also requires `repohangar.explorer.submenu` (default `true`). Setting
changes SHALL apply without a window reload.

#### Scenario: Explorer menu visibility matrix

| # | Item | Selection | `showOn` | Repository root | Git Graph Opener installed | `repohangar.explorer.submenu` | Graph item | RepoHangar submenu |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | File | *Any* | *Any* | *N/A* | *Any* | *Any* | **Hidden** | **Hidden** |
| R2 | Folder | Several items | *Any* | *Any* | *Any* | *Any* | **Hidden** | **Hidden** |
| R3 | Folder | Single | `repositoryRoots` | Yes | No | `true` | **Shown** | **Shown** |
| R4 | Folder | Single | `repositoryRoots` | No | *Any* | *Any* | **Hidden** | **Hidden** |
| R5 | Folder | Single | `allFolders` | No | No | `true` | **Shown** | **Shown** |
| R6 | Folder | Single | `repositoryRoots` | Yes | Yes | `true` | **Hidden** | **Shown** |
| R7 | Folder | Single | `repositoryRoots` | Yes | No | `false` | **Shown** | **Hidden** |

### Requirement: RepoHangar submenu
The **RepoHangar** submenu SHALL list **Show in RepoHangar**, **Fetch** and **Pull (ff)**, each acting on the
repository that contains the folder: Show in RepoHangar runs `repohangar.showInDashboard`, Fetch runs
`repohangar.fetch` and Pull (ff) runs `repohangar.pullFf` (`git-operations`, `batch-operations`).

#### Scenario: Fetch from a subfolder
- **GIVEN** `repohangar.explorer.contextMenu.showOn` is `"allFolders"`
- **WHEN** the user chooses **RepoHangar ▸ Fetch** on `acme/backend/ledger/src`
- **THEN** `repository.fetch({ prune: true })` runs for `ledger`

### Requirement: Show in RepoHangar
`repohangar.showInDashboard` (*RepoHangar: Show in RepoHangar*) SHALL open the dashboard if needed and move the focus
to the repository's row, clearing the filter text and chips and expanding its group when they hide the row. A folder
in no listed repository SHALL show `"<path>" is not in a repository RepoHangar lists.`

#### Scenario: Show a filtered-out repository
- **GIVEN** the dashboard filter reads `bill` and the group `backend` is collapsed
- **WHEN** the user chooses **Show in RepoHangar** on the folder `acme/backend/ledger`
- **THEN** the filter is empty, All is active, `backend` is expanded and the focus is on the `ledger` row

### Requirement: Repository roots
The system SHALL set the context key `repohangar.repositoryRoots` to the `Uri.fsPath` of the union of the Git API's
repository roots and the roots a scan of each workspace folder finds to `repohangar.repositoryScanDepth` (default `3`,
`0` scans only the workspace folder), and SHALL recompute it when workspace folders change, the scan depth changes, a
repository opens or closes in the Git extension, or the user runs `repohangar.refresh`. A scan replaced by a newer one
SHALL NOT set the key.

#### Scenario: Repository scanner matrix

| # | Candidate folder | Depth below the workspace folder | Contains a `.git` entry | Named `node_modules` | Detected as root | Descends further |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Any folder | ≤ scan depth | Yes | No | **Yes** | **No** |
| R2 | Any folder | < scan depth | No | No | **No** | **Yes** |
| R3 | Any folder | = scan depth | No | No | **No** | **No** |
| R4 | Any folder | > scan depth | *Any* | *Any* | **No** | **No** (never reached) |
| R5 | Dependency folder | ≥ 1 | *Any* | Yes | **No** | **No** |
| R6 | Unreadable folder | *Any* | *N/A* | *Any* | **No** | **No** (skipped silently) |

#### Scenario: Repository the Git extension does not open
- **GIVEN** `acme/tools/legacy` is a repository at depth 2 that `git.repositoryScanMaxDepth` (`1`) keeps the Git
  extension from opening
- **WHEN** the scan runs with `repohangar.repositoryScanDepth` at `3`
- **THEN** `repohangar.repositoryRoots` contains the path of `acme/tools/legacy`
- **AND** its folder shows **Open in Git Graph** in the Explorer context menu

#### Scenario: Newly cloned repository
- **GIVEN** the user clones a repository into `acme/backend/payments`
- **WHEN** the user runs `repohangar.refresh`
- **THEN** `repohangar.repositoryRoots` contains the path of `acme/backend/payments`
