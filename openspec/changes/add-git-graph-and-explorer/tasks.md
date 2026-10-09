## 1. Port Git Graph Opener

- [ ] 1.1 Port `repositories.ts` to `src/git/repoRoots.ts` (D-1, file system port with `readdir`); `Repository scanner matrix` (explorer-open-in-git-graph) → `test/unit/repoRoots.test.ts`, one case per R1–R6, plus Git Graph Opener's `findRepoRoot` cases (root, subfolder, `.git` file, outside every repository)
- [ ] 1.2 Port `scmReveal.ts` to `src/integrations/scmReveal.ts`; `Reveal outcome matrix` (source-control-reveal) → `test/unit/scmReveal.test.ts`, one case per R1–R6, and `Sidebar after sync matrix` → the same file, one case per R1–R3; every case of Git Graph Opener's `scmReveal.test.ts` kept
- [ ] 1.3 Port `scmSelection.ts` to `src/integrations/scmSelection.ts` with the `force` flag (D-1); `Sync outcome matrix` (source-control-selection-sync) → `test/unit/scmSelection.test.ts`, one case per R1–R8, and `Selection commands availability matrix` → the same file, one case per R1–R4; every case of Git Graph Opener's `scmSelection.test.ts` kept (handle parsing, input box URIs, candidate order, confirmation, remembered handles, *Second sync to the same repository*, *Repository closed and reopened*, *Internal command removed in a future VS Code release*)
- [ ] 1.4 Add the RepoHangar log channel (D-7); verify `00-smoke.test.ts` finds an output channel named `RepoHangar`

## 2. Git Graph and Source Control Graph

- [ ] 2.1 Implement Git Graph detection and `repohangar.gitGraph.installed` (D-2); verify `test/integration/suite/gitGraph/detection.test.ts` covers *Git Graph installed while the window is open* (install `mhutchie.git-graph` from the test, key turns `true` without a reload)
- [ ] 2.2 Implement the two graph commands, their keybindings on `ctrl+alt+j` / mac `ctrl+cmd+j` and the `whenMissing` variants; `Graph item matrix` (explorer-open-in-git-graph) → `test/integration/suite/main/80-graphVariants.test.ts` (R2–R4, Git Graph absent, `whenMissing` set per case) and `test/integration/suite/gitGraph/graph.test.ts` (R1), one case per row, asserting the command run, the notification text and the label sent to the webview
- [ ] 2.3 Implement Open Git Graph behind a commands port; `Open Git Graph matrix` (explorer-open-in-git-graph) → `test/unit/openGitGraph.test.ts`, one case per R1–R4; plus a contract test in `gitGraph/graph.test.ts` that `git-graph.view` with `{ rootUri }` shows the repository in the installed Git Graph release
- [ ] 2.4 Implement the Source Control Graph path (`workbench.view.scm`, forced sync, `workbench.scm.history.focus`); verify `main/82-sourceControlGraph.test.ts` covers *Source Control Graph on a repository* in `single` mode and records in design.md whether the graph follows the selection in VS Code 1.141
- [ ] 2.5 Wire every graph entry point (D-8); `Graph entry point matrix` (explorer-open-in-git-graph) → `test/ui/graph.spec.ts`, one case per R1–R7 (R5 and R6 run the command with a `SourceControl` and an Explorer `Uri` argument), with Git Graph absent so the target is visible in Source Control

## 3. Explorer

- [ ] 3.1 Implement the repository roots context key (D-3) with the scan generation counter and its triggers; verify `main/84-repositoryRoots.test.ts` covers *Repository the Git extension does not open*, *Newly cloned repository* and the dashboard scenario *Refresh rescans the repository roots*
- [ ] 3.2 Contribute the Explorer menu items and the `repohangar.explorer` submenu (D-4); `Explorer menu visibility matrix` (explorer-open-in-git-graph) → manual checklist in this file, one line per R1–R7, run on Windows, macOS and Linux:
  - [ ] R1 file → neither item
  - [ ] R2 two folders selected → neither item
  - [ ] R3 repository root, `repositoryRoots`, opener not installed, submenu on → both items
  - [ ] R4 plain folder, `repositoryRoots` → neither item
  - [ ] R5 plain folder, `allFolders` → both items
  - [ ] R6 repository root with Git Graph Opener installed → submenu only
  - [ ] R7 repository root, `repohangar.explorer.submenu` = `false` → graph item only
- [ ] 3.3 Implement `repohangar.showInDashboard` and the submenu commands; verify `main/86-explorerSubmenu.test.ts` covers *Fetch from a subfolder* and *Show a filtered-out repository*
- [ ] 3.4 Implement Reveal in Explorer behind a commands port; `Reveal matrix` (explorer-reveal) → `test/unit/reveal.test.ts`, one case per R1–R2; `Outside workspace matrix` (explorer-reveal) → `test/unit/revealOutside.test.ts`, one case per R1–R6 (quick pick, item button and settings ports)
- [ ] 3.5 Wire the reveal entry points and the name click; `Name click matrix` (explorer-reveal) → `test/ui/explorer.spec.ts`, one case per R1–R3, plus *Reveal with e* (the Explorer selects `acme/backend/ledger` and has focus)

## 4. Source Control

- [ ] 4.1 Wire the Source Control reveal after Open in Git Graph and *Source Control shown before the selection sync*; verify in `gitGraph/graph.test.ts` that with both settings on, `workbench.view.scm` runs before the first selection command
- [ ] 4.2 Implement Show in Source Control and its entry points; `Show in Source Control matrix` (source-control-reveal) → `main/88-showInSourceControl.test.ts`, one case per R1–R3, asserting `repository.ui.selected`
- [ ] 4.3 Selection sync on real VS Code (manual checklist, standard §10), on Windows, macOS and Linux, one line per row of `Sync outcome matrix` R6–R8 plus *Git Graph dropdown changes are not synced*:
  - [ ] R6 already selected → unchanged
  - [ ] R7 another repository selected → target becomes the only selected
  - [ ] R8 selection commands removed (simulated by renaming the prefix in a debug build) → logged, no notification
  - [ ] Git Graph dropdown change → Source Control unchanged

## 5. Migration

- [ ] 5.1 Implement the settings migration (D-6); `Settings migration matrix` (git-graph-opener-migration) → `test/integration/suite/migration/migration.test.ts`, one case per R1–R7 (a session whose user `settings.json`, workspace file and folder settings hold the old keys before launch; R1 by a second activation), plus *Old keys kept*
- [ ] 5.2 Implement the legacy opener guard; `Legacy opener matrix` (git-graph-opener-migration) → `gitGraph/legacyOpener.test.ts` with `git-graph-opener-0.1.0.vsix` installed in the session, one case per R1–R3, plus *Uninstall from the notification*
- [ ] 5.3 Add the `gitGraph` and `migration` sessions to `test/integration/runTest.ts` (install `mhutchie.git-graph` and the Git Graph Opener VSIX into the session's extensions folder; seed old settings); verify `npm run test:integration` runs all five sessions

## 6. Settings, docs and release notes

- [ ] 6.1 Declare `repohangar.dashboard.nameClick` (`"explorer"`), `repohangar.gitGraph.whenMissing` (`"sourceControlGraph"`), `repohangar.gitGraph.revealSourceControl` (`true`), `repohangar.gitGraph.syncSourceControlSelection` (`true`), `repohangar.explorer.contextMenu.showOn` (`"repositoryRoots"`), `repohangar.explorer.submenu` (`true`), `repohangar.explorer.collapseBeforeReveal` (`false`), `repohangar.explorer.outsideWorkspace` (`"ask"`) and `repohangar.repositoryScanDepth` (`3`, minimum `0`); verify `00-smoke.test.ts` reads every default
- [ ] 6.2 Update the README (graph, Explorer and Source Control sections, the migration note) and the footer and key help with `g`, `e`, `s`; verify `test/ui/keys.spec.ts` checks the footer `… · g graph · e explorer · s source control · ↑↓ move …` and the key help entries
- [ ] 6.3 Run `npm run build`, `npm test`, the integration and UI suites, and `openspec validate add-git-graph-and-explorer --strict`; all pass
- [ ] 6.4 Add `Added` entries under `## Unreleased` in `CHANGELOG.md` (docs/versioning.md R6; the migration is `Added` for the new keys, versioning §2): Open in Git Graph / Source Control Graph and `Ctrl+Alt+J`, Reveal in Explorer, the Explorer context menu and RepoHangar submenu, Show in Source Control, the settings migration from Git Graph Opener, and the nine settings; verify the entries start with `- **Added`
