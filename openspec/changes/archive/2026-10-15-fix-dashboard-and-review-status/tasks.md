## 1. One dashboard tab

- [x] 1.1 In `src/ui/dashboard.ts`, when no panel is set up, reveal an existing dashboard tab (focus its editor group, `workbench.action.openEditorAtIndex` with its index) instead of creating a panel, and fall back to creating one when that fails (design D-1); in `deserializeWebviewPanel`, dispose the received panel and reveal the existing one when a panel is already set up (design D-2); verify `npm run typecheck`
- [x] 1.2 `Dashboard tab matrix` (dashboard: Opening the dashboard) → `@vscode/test-electron` cases in `test/integration/suite/main/30-dashboard.test.ts`, one per row: R1 and R2 (the existing *opens a pinned panel* and *reveals the existing panel* tests, checked against the row), R3 and R4 with a dashboard tab RepoHangar did not set up (a `createWebviewPanel` of the dashboard view type made by the test, in the active group for R3 and in a second editor group for R4; `repohangar.open` leaves one dashboard tab, that tab active, in its group), R5 by passing a second dashboard panel to `deserializeWebviewPanel` while one is open (one dashboard tab after, the first one active)

## 2. Dashboard height

- [x] 2.1 Size the page from the layout viewport in `webview/styles.css`: `html { height: 100% }`, a `border-box` flex column `body` with `min-height: 100%` while it shows the dashboard, `#root` and `.dashboard` with `flex: 1` (design D-3)
- [x] 2.2 Add the scenarios *Rows that fit the panel*, *Rows that fit a panel narrower than the grid* and *Rows taller than the panel* (dashboard: Dashboard height) to `test/ui/grid.spec.ts`: filter the fixture to 2 rows in a window 1000 px high, 2000 px wide (no horizontal scrollbar) and 1400 px wide (horizontal scrollbar), and assert `scrollHeight === clientHeight` of the webview document and the footer's bottom 12 px above `clientHeight`; resize the window to 400 px high with every row shown and assert `scrollHeight > clientHeight` and the footer inside the visible area

## 3. Name click "auto"

- [x] 3.1 Add `'auto'` to `NameClick` and give `nameClickAction` the graph variant (`src/shared/graph.ts`), default unknown values to `'auto'` in `nameClickSetting()` (`src/ui/dashboard.ts`), pass `snapshot.graph` in `webview/App.tsx`, and declare `"auto"` (first, with its enum description) and the default `"auto"` for `repohangar.dashboard.nameClick` in `package.json` (design D-4)
- [x] 3.2 `Name click matrix` (explorer-reveal: Repository name click, as revised in `add-git-graph-and-explorer`) → Vitest `it.each` in `test/unit/nameClick.test.ts` over `nameClickAction`, one case per R1–R5 (graph variants `gitGraph` for "installed" and `sourceControlGraph` and `offerInstall` for "not installed"); plus a Playwright case for R5 in `test/ui/explorer.spec.ts` (`auto` without Git Graph reveals `ledger` in the Explorer) and an assertion in `test/integration/suite/gitGraph/20-graph.test.ts` for R4 (with Git Graph installed and the default setting, the snapshot has `nameClick` `auto` and `graph` `gitGraph`); update the default read by `test/integration/suite/main/00-smoke.test.ts`

## 4. GitLab review requests

- [x] 4.1 Read the first GraphQL `errors[].message` in `statusMessage` (`src/providers/http.ts`, design D-6); add `GITLAB_CHUNK_SIZE = 10` (`src/providers/provider.ts`) and the chunk queue that splits a chunk rejected for size or complexity (`src/providers/gitlab.ts`, design D-5); verify `npm run typecheck`
- [x] 4.2 `GitLab chunk limit matrix` (hosting-providers: Batched review status) → contract tests with msw in `test/contract/batching.test.ts`, one case per R1–R5, asserting the alias counts of the requests sent, the results mapped and, for R4 and R5, the error message the loader logs (`ReviewLoader` with a recording `log` port)
- [x] 4.3 Update *Forty repositories on two hosts* (GitLab 10, 10, 5 and GitHub 15) and *Chunks of 50 aliases* (120 repositories on `github.com`: 50, 50, 20) in `test/contract/batching.test.ts`, and the performance test `test/integration/suite/perf/reviewStatus.test.ts` to one request per host and chunk; verify `npm test` passes

## 5. Docs and release notes

- [x] 5.1 README: the name click sentence and the `repohangar.dashboard.nameClick` row of the settings table (`"auto"`)
- [x] 5.2 Add entries under `## Unreleased` in `CHANGELOG.md` (docs/versioning.md): `Added` (R6) for the value `"auto"` and `Changed` (R8) for the `repohangar.dashboard.nameClick` default `"auto"`, `Fixed` (R12) for the second dashboard tab, the scrollbar and the GitLab review requests; verify each starts with `- **Added`, `- **Changed` or `- **Fixed`
- [x] 5.3 Run `npm run typecheck`, `npm test`, `npm run test:integration`, the affected Playwright specs and `openspec validate fix-dashboard-and-review-status --strict`; all pass
