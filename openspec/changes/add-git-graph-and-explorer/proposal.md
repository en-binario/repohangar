## Why

After looking at a repository in the dashboard, people go to its commit graph, its folder in the Explorer, or its
changes in Source Control, and each of those takes several clicks today (PROPOSAL.md §9). The Git Graph Opener
extension already solves part of it from the Explorer context menu, as a separate extension with its own scan, settings
and output channel and a hard dependency on Git Graph. RepoHangar takes it over (D15), so one extension covers the
dashboard, the graph and the Explorer, and Git Graph becomes optional (D14).

Roadmap phase: **1. Dashboard MVP** (§13), third and last slice: Open in Git Graph, Reveal in Explorer, the Explorer
context menu, Source Control reveal and selection sync, the repo-root scan, and the migration from Git Graph Opener.
It implements §9.1–§9.5, W3 (row detail buttons), W11, W12, Appendix D and decisions D14–D17.

**Depends on: `add-git-operations`** — the Explorer **RepoHangar** submenu runs its `repohangar.fetch` and
`repohangar.pullFf` commands, and the graph, Explorer and Source Control items join its hover buttons and `⋯` menu.

## What Changes

- **Open in Git Graph** (§9.2) from the dashboard (`g`, the `◈` hover button, the `⋯` menu, the row details), the
  Source Control Repositories menu, the Explorer context menu, the command palette and `Ctrl+Alt+J` (`Ctrl+Cmd+J`).
  Git Graph is detected at run time (`repohangar.gitGraph.installed`, following installs without a reload). Without it,
  `repohangar.gitGraph.whenMissing` (default `"sourceControlGraph"`) makes the same items read **Open in Source Control
  Graph** and open VS Code's built-in graph; `"offerInstall"` and `"hide"` are the alternatives. RepoHangar never
  installs anything by itself.
- **Reveal in Explorer** (§9.3) from `e`, the `▤` hover button, the `⋯` menu, the row details, a click on the
  repository name (`repohangar.dashboard.nameClick`, default `"auto"`: Git Graph when installed, else the Explorer; revised by `fix-dashboard-and-review-status`), the Source Control Repositories menu and
  `repohangar.revealInExplorer`; `repohangar.explorer.collapseBeforeReveal`; and, for repositories outside every
  workspace folder, `repohangar.explorer.outsideWorkspace` (`"ask"`, add to workspace, new window, OS file manager).
- **Explorer context menu** (§9.4, W11): **Open in Git Graph** (or **Open in Source Control Graph**) at
  `navigation@100` and a **RepoHangar** submenu with **Show in RepoHangar**, **Fetch** and **Pull (ff)**, on repository
  folders (`repohangar.explorer.contextMenu.showOn`, `repohangar.explorer.submenu`), driven by the context key
  `repohangar.repositoryRoots`: the Git API's repositories plus a folder scan to `repohangar.repositoryScanDepth`
  (default `3`), refreshed by **RepoHangar: Refresh**.
- **Source Control reveal and selection sync** (§9.5, D17), ported from Git Graph Opener with its tests: after Open in
  Git Graph, Source Control is shown and focus returns to the graph (`repohangar.gitGraph.revealSourceControl`), and the
  repository is selected in the Repositories view in single selection mode
  (`repohangar.gitGraph.syncSourceControlSelection`). **Show in Source Control** (`s`, the `⋯` menu, the row details, a
  click on the Changes cell, `repohangar.showInSourceControl`) uses the same sync.
- **Migration from Git Graph Opener** (Appendix D, D15): its four `gitGraphOpener.*` settings are copied to the
  `repohangar.*` keys at every scope where they are set, once and without deleting them; while the old extension is
  installed, RepoHangar hides its own Explorer item and offers once to uninstall it.
- A **RepoHangar** log output channel for failures that do not deserve a notification.

## Capabilities

### New Capabilities

- `explorer-open-in-git-graph`: Git Graph detection, the graph commands and their `whenMissing` variants, every entry
  point, the Explorer context menu and RepoHangar submenu, the repository-root scan and context key, and Show in
  RepoHangar.
- `explorer-reveal`: Reveal in Explorer from every entry point, collapse before reveal, the repository name click, and
  repositories outside the workspace folders.
- `source-control-reveal`: showing Source Control after Open in Git Graph and returning focus, and the Show in Source
  Control action.
- `source-control-selection-sync`: selecting the repository in the Source Control Repositories view in single
  selection mode, best effort through VS Code's internal commands, isolated from every failure.
- `git-graph-opener-migration`: the settings migration and the duplicate-menu guard while Git Graph Opener is
  installed.

### Modified Capabilities

- `dashboard`: `Refresh command` — **RepoHangar: Refresh** also rescans the repository roots.

## Impact

- **Code**: ported from Git Graph Opener (`repositories.ts` → `src/git/repoRoots.ts`, `scmReveal.ts`, `scmSelection.ts`
  → `src/integrations/`) with its unit tests moved from `node:test` to Vitest; new `src/integrations/gitGraph.ts`,
  `explorer.ts`, `migration.ts`; webview hover buttons, `⋯` items, row detail buttons and cell clicks; `package.json`
  menus (`explorer/context`, the `repohangar.explorer` submenu, `scm/sourceControl`), commands, keybindings and
  settings.
- **Settings** (Appendix A): `repohangar.dashboard.nameClick`, `repohangar.gitGraph.whenMissing`,
  `repohangar.gitGraph.revealSourceControl`, `repohangar.gitGraph.syncSourceControlSelection`,
  `repohangar.explorer.contextMenu.showOn`, `repohangar.explorer.submenu`, `repohangar.explorer.collapseBeforeReveal`,
  `repohangar.explorer.outsideWorkspace`, `repohangar.repositoryScanDepth`.
- **Public surface**: commands `repohangar.openInGitGraph`, `repohangar.openInSourceControlGraph`,
  `repohangar.revealInExplorer`, `repohangar.showInSourceControl`, `repohangar.showInDashboard`; context keys
  `repohangar.gitGraph.installed`, `repohangar.repositoryRoots`, `repohangar.legacyOpenerInstalled`; keybinding
  `Ctrl+Alt+J` / `Ctrl+Cmd+J`; dashboard keys `g`, `e`, `s`; the migration of the `gitGraphOpener.*` keys. CHANGELOG
  `Added` entries.
- **Git Graph Opener**: after the first release with this change, its repository gets a note pointing to RepoHangar
  and is archived (outside this repository).
