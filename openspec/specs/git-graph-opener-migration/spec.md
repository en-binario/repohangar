# git-graph-opener-migration Specification

## Purpose
Moves users of the Git Graph Opener extension to RepoHangar without losing their settings or seeing duplicate menu
items while both extensions are installed.

**Non-goals:**
- The behaviour Git Graph Opener provided, owned by `explorer-open-in-git-graph`, `source-control-reveal` and
  `source-control-selection-sync`.
- Uninstalling Git Graph Opener without the user's click: no capability does.

## Requirements

### Requirement: Settings migration
On its first activation the system SHALL copy each `gitGraphOpener.*` setting value set at user, workspace or workspace
folder scope to the matching `repohangar.*` key at the same scope, unless the new key already has a value at that
scope. It MUST NOT delete or change the old keys, and SHALL record in global state that the migration ran, so it runs
once per installation.

**Constraints:**
- `gitGraphOpener.contextMenu.showOn` → `repohangar.explorer.contextMenu.showOn`
- `gitGraphOpener.repositoryScanDepth` → `repohangar.repositoryScanDepth`
- `gitGraphOpener.sourceControl.reveal` → `repohangar.gitGraph.revealSourceControl`
- `gitGraphOpener.sourceControl.syncSelection` → `repohangar.gitGraph.syncSourceControlSelection`

#### Scenario: Settings migration matrix

| # | Migration already recorded | Old key and scope | New key at that scope | Result |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Yes | `gitGraphOpener.repositoryScanDepth` = `5`, user | Not set | **Nothing written** |
| R2 | No | Not set at any scope | *Any* | **Nothing written** |
| R3 | No | `gitGraphOpener.repositoryScanDepth` = `5`, user | Not set | **`repohangar.repositoryScanDepth` = `5` at user scope** |
| R4 | No | `gitGraphOpener.repositoryScanDepth` = `5`, user | `2` | **Unchanged (`2`)** |
| R5 | No | `gitGraphOpener.contextMenu.showOn` = `"allFolders"`, workspace | Not set | **`repohangar.explorer.contextMenu.showOn` = `"allFolders"` at workspace scope** |
| R6 | No | `gitGraphOpener.sourceControl.reveal` = `false`, workspace folder `acme` | Not set | **`repohangar.gitGraph.revealSourceControl` = `false` for the folder `acme`** |
| R7 | No | `gitGraphOpener.sourceControl.syncSelection` = `false`, user and workspace | Not set | **`repohangar.gitGraph.syncSourceControlSelection` = `false` at user and at workspace scope** |

#### Scenario: Old keys kept
- **GIVEN** `gitGraphOpener.repositoryScanDepth` is `5` at user scope and the migration has not run
- **WHEN** RepoHangar activates
- **THEN** `gitGraphOpener.repositoryScanDepth` is still `5` at user scope

### Requirement: Git Graph Opener installed
While `enbinario.git-graph-opener` is installed, the system SHALL set the context key
`repohangar.legacyOpenerInstalled` to `true`, hide its own Explorer **Open in Git Graph** item, and show once per
installation of RepoHangar the notification `RepoHangar now includes Git Graph Opener.` with `Uninstall Git Graph
Opener` and `Later`. `Uninstall Git Graph Opener` SHALL run `workbench.extensions.uninstallExtension` with
`enbinario.git-graph-opener`. The dashboard and Source Control items SHALL be unaffected.

#### Scenario: Legacy opener matrix

| # | Git Graph Opener installed | Notice shown before | `repohangar.legacyOpenerInstalled` | RepoHangar Explorer graph item | Notification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | No | *Any* | **`false`** | **Per `explorer-open-in-git-graph`** | **None** |
| R2 | Yes | No | **`true`** | **Hidden** | **`RepoHangar now includes Git Graph Opener.` with `Uninstall Git Graph Opener` and `Later`** |
| R3 | Yes | Yes | **`true`** | **Hidden** | **None** |

#### Scenario: Uninstall from the notification
- **GIVEN** the notification `RepoHangar now includes Git Graph Opener.` is shown
- **WHEN** the user clicks `Uninstall Git Graph Opener`
- **THEN** `workbench.extensions.uninstallExtension` runs with `enbinario.git-graph-opener`
- **AND WHEN** the uninstall finishes
- **THEN** `repohangar.legacyOpenerInstalled` is `false` and RepoHangar's Explorer graph item is shown, without a
  window reload
