## Context

Git Graph Opener (`vscode-gitgraph-improve`, `enbinario.git-graph-opener` 0.1.0, unpublished) implements three of the
five capabilities in about 300 lines plus 570 lines of `node:test` tests:

| Git Graph Opener | What it holds |
|---|---|
| `src/repositories.ts` | `findRepoRoot` (nearest ancestor-or-self with `.git`), `scanRepositories` (depth, stop at a repo, skip `node_modules`) |
| `src/scmReveal.ts` | `revealSourceControl` behind a `RevealPort`, `briefRevealCommands` |
| `src/scmSelection.ts` | toggle-handle parsing, input box URI parsing, candidate ordering, confirmation, the handle memory (`SourceControlSelection`) |
| `src/extension.ts` | the Explorer command, the context key with a scan generation counter, the port wiring |

Its specs are the base of `explorer-open-in-git-graph`, `source-control-reveal` and `source-control-selection-sync`,
with the `gitGraphOpener.*` names replaced and the Git Graph requirement made conditional (D14). `add-git-operations`
provides the row hover buttons, the `⋯` menu, the row details, the active repository resolution, and the
`repohangar.fetch` and `repohangar.pullFf` commands this change uses.

Checked in VS Code 1.141: the Source Control Graph view id is `workbench.scm.history`, so `workbench.scm.history.focus`
focuses it.

## Goals / Non-Goals

**Goals:**
- Port the three Git Graph Opener modules unchanged in behaviour, behind the same ports, with their tests moved to
  Vitest case for case.
- Keep every best-effort step (Source Control reveal, selection sync) unable to break the visible action.

**Non-Goals:**
- Scan roots and light mode (phase 4). `outsideWorkspace` already applies to any repository the Git extension opens
  outside the workspace folders (for example through `git.openRepositoryInParentFolders`).
- Changing Git Graph Opener's repository: after the first release with this change, it gets a README note and is
  archived by hand.

## Decisions

### D-1. Port layout

| From | To | Change |
|---|---|---|
| `src/repositories.ts` | `src/git/repoRoots.ts` | Takes the `FileSystemPort` of `add-repo-dashboard` plus a `readdir`, so tests use the in-memory file system |
| `src/scmReveal.ts` | `src/integrations/scmReveal.ts` | Log through the RepoHangar log channel |
| `src/scmSelection.ts` | `src/integrations/scmSelection.ts` | None; `syncSourceControlSelection` gains a `force` flag for Show in Source Control and the Source Control Graph, which sync whatever the setting is |
| `src/extension.ts` (open, sync, ports) | `src/integrations/gitGraph.ts`, `src/integrations/explorer.ts`, `src/integrations/sourceControl.ts` | Git Graph optional; entry points from the dashboard and Source Control |
| `src/test/*.test.ts` | `test/unit/repoRoots.test.ts`, `scmReveal.test.ts`, `scmSelection.test.ts` | `node:test` → Vitest; every case kept |

### D-2. Git Graph detection and the two commands

`vscode.extensions.getExtension('mhutchie.git-graph')` at activation and on `vscode.extensions.onDidChange` sets
`repohangar.gitGraph.installed`. Menus can't relabel a command, so `repohangar.openInGitGraph` and
`repohangar.openInSourceControlGraph` are two commands with opposite `when` clauses (§9.2 table), and so are their two
keybinding entries on `ctrl+alt+j` / mac `ctrl+cmd+j`. The webview gets the variant (`gitGraph` | `sourceControlGraph`
| `offerInstall` | `hidden`) in the snapshot and on change, to label `◈`, the `⋯` item and the row detail button.
Before running `git-graph.view`, the extension is activated (`getExtension(...).activate()`) and
`vscode.commands.getCommands(true)` is checked, as Git Graph Opener does, because Git Graph may still be activating.

### D-3. Repository roots context key

`repohangar.repositoryRoots` = Git API roots ∪ the scan of D-1, as `Uri.fsPath` strings (the form `resourcePath` has in
`when` clauses), deduplicated case-insensitively on Windows. A generation counter drops results of a scan that a newer
one replaced. The scan runs after activation, off the startup path (target < 200 ms for 10 folders at depth 3,
§11.2). `repohangar.refresh` awaits the rescan.

### D-4. Explorer menus

```jsonc
"explorer/context": [
  { "command": "repohangar.openInGitGraph", "group": "navigation@100",
    "when": "explorerResourceIsFolder && !listMultiSelection && !repohangar.legacyOpenerInstalled && (repohangar.gitGraph.installed || config.repohangar.gitGraph.whenMissing == 'offerInstall') && (config.repohangar.explorer.contextMenu.showOn == 'allFolders' || resourcePath in repohangar.repositoryRoots)" },
  { "command": "repohangar.openInSourceControlGraph", "group": "navigation@100",
    "when": "explorerResourceIsFolder && !listMultiSelection && !repohangar.legacyOpenerInstalled && !repohangar.gitGraph.installed && config.repohangar.gitGraph.whenMissing == 'sourceControlGraph' && (config.repohangar.explorer.contextMenu.showOn == 'allFolders' || resourcePath in repohangar.repositoryRoots)" },
  { "submenu": "repohangar.explorer", "group": "navigation@101",
    "when": "explorerResourceIsFolder && !listMultiSelection && config.repohangar.explorer.submenu && (config.repohangar.explorer.contextMenu.showOn == 'allFolders' || resourcePath in repohangar.repositoryRoots)" }
]
```

The submenu holds `repohangar.showInDashboard`, `repohangar.fetch` and `repohangar.pullFf`; the MR items come with
phase 2 (`repohangar.hostedRoots`). Every command is hidden from the command palette where it needs a folder argument,
and resolves an Explorer `Uri` through the active repository resolution of `add-git-operations` (innermost listed
repository). `Open in Git Graph` on a folder that is a scanned root but not a listed repository still works: it needs
only the root path, not a registry row.

### D-5. Source Control menu

`scm/sourceControl` items **Open in Git Graph** / **Open in Source Control Graph** and **Reveal in Explorer**, with
`scmProvider == git`, in a group after `add-git-operations`' **Fetch**. The argument is the `SourceControl`, resolved
through its `rootUri`.

### D-6. Migration

`migration.ts` runs once per installation (`globalState` key `repohangar.migration.gitGraphOpener`), before the menus
read the settings. It uses `getConfiguration().inspect(oldKey)` and writes with `update(newKey, value, target)` for
`Global`, `Workspace` and, per workspace folder, `WorkspaceFolder`, only where `inspect(newKey)` has no value at that
scope. `vscode.extensions.onDidChange` keeps `repohangar.legacyOpenerInstalled` current; the notice flag is a second
`globalState` key.

### D-7. Log channel

`window.createOutputChannel('RepoHangar', { log: true })`, created at activation and shared. Selection sync and
reveal failures log at `warn`, the sync result at `debug`. The text of log lines is not specified.

### D-8. Webview

The `◈` and `▤` hover buttons and the `⋯` items **Open in Git Graph** (`g`), **Reveal in Explorer** (`e`) and **Show in
Source Control** (`s`) are added before **Open terminal**, per W12. Row details get the buttons `[Open in Git Graph]
[Reveal in Explorer] [Show in Source Control] [Open terminal]` (W3). The Repository name and the Changes cell become
buttons with the action of `nameClick` and Show in Source Control. New view messages: `runAction` with the actions
`graph`, `revealInExplorer` and `showInSourceControl`.

## Risks / Trade-offs

- [The `{ rootUri }` argument of `git-graph.view` is not a documented Git Graph API] → a contract test against the
  installed Git Graph release pins it, and the fallback without arguments keeps the graph opening.
- [VS Code renames `workbench.scm.action.toggleRepositoryVisibility.scm<handle>`] → the sync finds no command, logs it
  and does nothing else (spec `Failure isolation`); reveal keeps working.
- [The Source Control Graph may not follow the Repositories selection in every VS Code release] → the integration
  test records whether it does in 1.141; if it does not, the graph opens and its Repo picker chooses the repository,
  and the log says so (§9.2).
- [Copying settings writes `.vscode/settings.json` in a folder that has old workspace-scope keys] → only where the old
  key is already set at that scope, so the file already exists.
- [The scan visits many folders in a large workspace] → depth 3 by default, never into a repository or
  `node_modules`, off the startup path.

## Migration Plan

1. Users with Git Graph Opener install RepoHangar: settings are copied once, the duplicate Explorer item is hidden,
   and the notification offers to uninstall the old extension.
2. Rollback: uninstalling RepoHangar leaves the `gitGraphOpener.*` keys untouched, so reinstalling Git Graph Opener
   works as before.

## Open Questions

- Does the Source Control Graph follow the Repositories selection in VS Code 1.141? Answered by the integration test of
  task 4.3; the spec's outcome holds either way, since the selection sync and the focus command run in both cases.
