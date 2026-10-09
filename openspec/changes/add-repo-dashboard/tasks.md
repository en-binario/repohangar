## 1. Extension scaffold

- [x] 1.1 Create `package.json` per design D-1 and PROPOSAL.md §E.4–§E.5 (`name` `repohangar`, `displayName` `RepoHangar - Multi-Repo Git Dashboard`, description, keywords, categories, `publisher` `enbinario`, `author`, `license` `MIT`, `homepage`, `repository`, `bugs`, `engines.vscode` `^1.93.0`, `extensionKind`, `extensionDependencies`, `capabilities`, `activationEvents`, `main`, version `0.0.0`), plus `LICENSE` (MIT, `Copyright (c) 2026 Jhon Tapia - enbinario.com`) and `README.md` opening with the §E.5 title and pitch; verify with `npx @vscode/vsce ls` listing only `dist/`, `LICENSE`, `README.md`, `CHANGELOG.md` and `package.json`
- [x] 1.2 Add `tsconfig.json` (strict) and `esbuild.mjs` with the two bundles of D-1, the codicons copy and `npm run build` / `npm run watch`; verify `npm run build` writes `dist/extension.js`, `dist/webview.js`, `dist/webview.css` and `dist/codicons/`
- [x] 1.3 Add Vitest (`vitest.config.ts`, jsdom environment for `test/unit/webview/**`) and `npm test`; verify a placeholder test in `test/unit` passes
- [x] 1.4 Add the `@vscode/test-electron` harness (`test/integration/runTest.ts`, Mocha) and a fixture builder `test/integration/fixtures/repos.ts` that creates, in a temp folder with a bare remote, the repositories clean, dirty, ahead, behind, diverged, detached, rebasing, merging, worktree, submodule, no remote, no commits and stashed; verify a smoke test opens the fixture workspace and `getAPI(1).repositories` lists every fixture repository
- [x] 1.5 Add the Playwright harness (`test/ui/`, `_electron.launch` on the VS Code build downloaded by `@vscode/test-electron`, a helper that returns the dashboard webview frame); verify a smoke test runs `repohangar.open` and finds the grid
- [x] 1.6 Add `src/git/git.d.ts` (from microsoft/vscode, `extensions/git/src/api/git.d.ts`) and `src/git/api.ts` (getAPI(1), API state, `git.enabled`); verify the integration smoke test reads the state `initialized`

## 2. Repository registry

- [x] 2.1 Implement `src/git/remoteUrl.ts` (D-12); `Remote URL parsing matrix` (repo-registry) → `test/unit/remoteUrl.test.ts`, `it.each` with one case per R1–R12
- [x] 2.2 Implement the remote choice (upstream remote, `origin`, first remote, fetch URL else push URL) as a pure function; `Remote choice matrix` (repo-registry) → `test/unit/remoteChoice.test.ts`, one case per R1–R6
- [x] 2.3 Implement `src/providers/detect.ts`; `Provider detection matrix` (repo-registry) → `test/unit/detect.test.ts`, one case per R1–R10
- [x] 2.4 Implement `src/git/groups.ts` with glob matching per the requirement's constraints; `Group assignment matrix` (repo-registry) → `test/unit/groups.test.ts`, one case per R1–R9
- [x] 2.5 Implement `src/git/registry.ts` (rows from `api.repositories`, `onDidOpenRepository` / `onDidCloseRepository`, re-detection on `repohangar.hosts` and `github-enterprise.uri` changes); verify `test/integration/suite/main/10-registry.test.ts` covers the scenarios *Repository opened by the Git extension*, *Repository closed by the Git extension*, *Submodule listed as its own row*, *Folder with a .git directory that the Git extension did not open* and *Hosts setting changed while the dashboard is open*

## 3. Local state reads

- [x] 3.1 Implement `src/git/gitDirs.ts` (D-7: `.git` directory or file, `commondir`, the `git rev-parse` fallback through an `execFile` helper with argument array, 10 s timeout and `GIT_TERMINAL_PROMPT=0`); verify `test/unit/gitDirs.test.ts` covers a plain repository, a worktree, a submodule and an unparsable `.git` file that calls the fallback once
- [x] 3.2 Implement the stash count in `src/git/fastPaths.ts`; `Stash count matrix` (dashboard) → `test/unit/stashCount.test.ts`, one case per R1–R4, asserting the process helper is never called
- [x] 3.3 Implement the operation markers and the newest `FETCH_HEAD` mtime in `src/git/fastPaths.ts`; verified through the Branch cell and Fetched cell matrix tests (4.2, 4.5), which feed marker files through the in-memory file system port

## 4. State store and cell formatting

- [x] 4.1 Implement `src/state/store.ts` (raw row data per D-3, 150 ms debounce per repository, at most one batch per 100 ms); verify `test/unit/store.test.ts` with fake timers: 5 changes to one repository within 150 ms produce one recompute, and changes to 3 repositories within 100 ms produce one batch
- [x] 4.2 Implement the Branch cell in `src/shared/format.ts`; `Branch cell matrix` (dashboard) → `test/unit/branchCell.test.ts`, one case per R1–R10
- [x] 4.3 Implement the Sync cell; `Sync cell matrix` (dashboard) → `test/unit/syncCell.test.ts`, one case per R1–R9
- [x] 4.4 Implement the Changes cell and the dirty flag; `Changes cell matrix` (dashboard) → `test/unit/changesCell.test.ts`, one case per R1–R7
- [x] 4.5 Implement the Fetched cell and age format; `Fetched cell matrix` (dashboard) → `test/unit/fetchedCell.test.ts` with a fixed clock, one case per R1–R10
- [x] 4.6 Implement the Repository cell and tooltip; `Repository cell matrix` (dashboard) → `test/unit/repositoryCell.test.ts`, one case per R1–R5
- [x] 4.7 Implement the row details lines and `loadDetails` (D-9, `repository.getCommit('HEAD')`, cached by hash); `Row details matrix` (dashboard) → `test/unit/rowDetails.test.ts`, one case per R1–R3
- [x] 4.8 Implement chip membership; `Chip membership matrix` (dashboard) → `test/unit/chips.test.ts`, one case per R1–R8
- [x] 4.9 Implement the filter (text and AND-combined chips, D-11); `Filter combination matrix` (dashboard) → `test/unit/filter.test.ts`, one case per R1–R9
- [x] 4.10 Implement the empty-state selection; `Dashboard state matrix` (dashboard) → `test/unit/emptyState.test.ts`, one case per R1–R4

## 5. Dashboard panel (extension host)

- [x] 5.1 Implement `src/ui/dashboard.ts`: single panel, title `RepoHangar`, pinning per D-10, CSP, `WebviewPanelSerializer`, `repohangar.open` with `Ctrl+Alt+H` / `Ctrl+Cmd+H` (D-13), and the `scm/title` button **Open RepoHangar** (`$(layout)`, `when: scmProvider == git`); verify `test/integration/suite/main/30-dashboard.test.ts` covers *Open the dashboard when none is open* (including `tab.isPinned`), *Open the dashboard when it is already open* and *Open from the Source Control title bar*
- [x] 5.2 Implement `src/shared/protocol.ts` validators (D-4) and route only valid messages; verify `test/unit/protocol.test.ts` accepts each message type and rejects wrong types, missing fields and extra fields, and `test/integration/suite/main/30-dashboard.test.ts` covers *Malformed message from the webview* and *Remote credentials never reach the webview* (recording every posted message)
- [x] 5.3 Implement `repohangar.openOnStartup`; `Open on startup matrix` (dashboard) → `test/integration/suite/main/40-openOnStartup.test.ts`, one case per R1–R5 (the extension's `openOnStartup` with the real dashboard and a Git API whose repository count each case sets)
- [x] 5.4 Implement the Group menu state (D-5); `Group menu matrix` (dashboard) → `test/integration/suite/main/50-groupMenu.test.ts`, one case per R1–R4, asserting no setting is written
- [x] 5.5 Implement `repohangar.refresh` (*RepoHangar: Refresh*); verify `test/integration/suite/main/60-refresh.test.ts` covers *Refresh all rows*: `repository.status()` called once per fixture repository and no `fetch`, `pull` or `push`
- [x] 5.6 Implement the *Open Settings* empty-state button; verify `test/integration/suite/gitDisabled/gitDisabled.test.ts` covers *Open Settings from the empty state* with `git.enabled` set to `false`

## 6. Dashboard webview

- [x] 6.1 Build the Preact grid (`webview/`): toolbar with filter box, chips with counts and the Group menu; columns in spec order; groups with headers, counts and collapse; rows ordered per spec; footer with selection count and key hints; codicons and `--vscode-*` theme variables; verify `test/ui/grid.spec.ts` covers *Column headers and row order*, *Collapse a group* and *Group header count follows the filter*, and opens the dashboard with `Ctrl+Alt+H`
- [x] 6.2 Implement the keyboard map; `Grid key matrix` (dashboard) → `test/ui/keys.spec.ts`, one case per R1–R22
- [x] 6.3 Implement view state through `setState` and the serializer (D-5); verify `test/ui/restore.spec.ts` covers *Window reload with the dashboard open* and `test/ui/grid.spec.ts` covers *Selection kept while filtering*
- [x] 6.4 Implement `role="grid"`, roving `tabindex` and accessible names; `Accessible names matrix` (dashboard) → `test/ui/a11y.spec.ts`, one case per R1–R14
- [x] 6.5 Implement the 60 s age re-render while visible; verify `test/unit/webview/ages.test.tsx` (Vitest, jsdom, fake timers) covers *Fetched cell ages while the dashboard is visible*; a fake clock in the whole VS Code window would also stop the workbench's own timers
- [x] 6.6 Render every value as text; verify `test/unit/webview/escaping.test.tsx` (Vitest, jsdom, Preact) covers *Repository name with markup*, since Windows does not allow `<` and `>` in folder names

## 7. Live updates, worktrees, trust and performance

- [x] 7.1 Wire `onDidChange`, the git dir watchers and the focus-aware `repository.status()` trigger (D-8); `Live update trigger matrix` (dashboard) → `test/integration/suite/main/70-liveUpdates.test.ts`, one case per R1–R5 (window focus through a test override), plus *Commit in a terminal while the window is focused* and *Fetch in an external terminal* (each < 1 s), and no process helper call during 5 s of idle time
- [x] 7.2 Verify `test/integration/suite/main/80-worktree.test.ts` covers *Worktree shares the stash count of its main repository*
- [x] 7.3 Declare `capabilities.untrustedWorkspaces.supported: false` (D-6); verify `test/ui/trust.spec.ts` (packaged VSIX installed into the test profile, launched without `--disable-workspace-trust`) covers *Window opened in Restricted Mode* and *Workspace trusted after opening in Restricted Mode*; if VS Code asks for a reload, update the scenario with `/opsx:update` and record the answer in design.md Open Questions
- [x] 7.4 Verify `test/integration/suite/perf/firstPaint.test.ts` covers *Open with 50 repositories*: the webview's `firstPaint` message arrives within 300 ms of `repohangar.open` with 50 fixture repositories loaded

## 8. Status bar

- [x] 8.1 Implement the status bar text in `src/shared/format.ts` and `src/ui/statusBar.ts` (left alignment, visibility, `repohangar.statusBar.enabled`); `Status bar text matrix` (status-bar) → `test/unit/statusBarText.test.ts`, one case per R1–R7
- [x] 8.2 Implement the tooltip and the accessible label; `Status bar tooltip matrix` (status-bar) → `test/unit/statusBarTooltip.test.ts`, one case per R1–R5, plus one case for *Accessible label*
- [x] 8.3 Wire the item to the store batches and `repohangar.open`; verify `test/integration/suite/main/90-statusBar.test.ts` covers *Counts follow a repository change* (< 250 ms), *Setting turned off while the window is open* and *Click opens the dashboard*

## 9. Settings, docs and release notes

- [x] 9.1 Declare the settings in `contributes.configuration` with type, default and description: `repohangar.openOnStartup` (`"never"`), `repohangar.groupBy` (`"parentFolder"`), `repohangar.groups` (`{}`), `repohangar.staleFetchHours` (`1`, minimum `0`), `repohangar.statusBar.enabled` (`true`), `repohangar.hosts` (`{}`, values `"gitlab"` or `"github"`); verify `test/integration/suite/main/00-smoke.test.ts` reads each default through `getConfiguration('repohangar')`
- [x] 9.2 Keybinding conflict check (PROPOSAL.md §10.3, D11): check the open key against the VS Code 1.141.0 default keymaps of Windows, macOS and Linux and against OS shortcuts; record the result in design.md D-13. Result: `Ctrl+Alt+R` / `Cmd+Alt+R` conflicts on all three platforms; the key becomes `Ctrl+Alt+H` / `Ctrl+Cmd+H`, free on all three. Verify with `test/integration/suite/main/95-keybindings.test.ts`: **Preferences: Open Default Keyboard Shortcuts (JSON)** in the test VS Code lists only `repohangar.open` on the open key of the platform
- [x] 9.3 Update `docs/openspec.md` §3: the `dashboard` row owns the read-only local state in its cells (last fetch, stash count, operation in progress) and the `git-operations` row keeps the default branch and ff-only fast paths; verify the table rows read so
- [x] 9.4 Update the `context` in `openspec/config.yaml` from "Workspace Trust Restricted Mode makes the dashboard read-only" to "RepoHangar does not run in Restricted Mode (its dependency vscode.git is disabled there)"; verify `openspec instructions proposal --change add-repo-dashboard --json` prints the new text
- [x] 9.5 Run `npm run build`, `npm test`, the integration and UI suites, and `openspec validate add-repo-dashboard --strict`; all pass
- [x] 9.6 Add `Added` entries under `## Unreleased` in `CHANGELOG.md` (docs/versioning.md R6, with the `changelog-entry` skill): the dashboard (`repohangar.open`, `Ctrl+Alt+H`, columns, filters, groups, keys), the status bar summary, `repohangar.refresh`, and the six settings; verify the entries start with `- **Added`
- [x] 9.7 Change the default keybinding of `repohangar.open` to `ctrl+alt+h` / mac `ctrl+cmd+h` in `package.json`, and the key in `README.md`, the `CHANGELOG.md` entry, `test/integration/suite/main/30-dashboard.test.ts` (declared keys), `docs/versioning.md` (public surface) and `test/ui/grid.spec.ts` (pressing the key); verify both tests pass
