## Context

The repository holds only the OpenSpec setup and the standards in `docs/`; there is no extension code, `package.json`
or test harness. This change creates them and the first three capabilities (see proposal.md). The behaviour is in the
delta specs; this document records how to build it and where it departs from PROPOSAL.md (r4).

Constraints that shape the approach (from PROPOSAL.md and `openspec/config.yaml`):

- Git state only from the built-in Git API (`vscode.git`, `getAPI(1)`), D2; no own status polling.
- Own `git` processes only for local fast paths: `execFile`, argument array, no shell, 10 s timeout,
  `GIT_TERMINAL_PROMPT=0`, §5.3.
- The webview is a pure view; every message is validated; logic modules import nothing from `vscode`.
- Performance targets in §11.2: first paint < 300 ms for 50 repos, row update < 250 ms, activation < 50 ms.
- The Git Graph Opener extension (`vscode-gitgraph-improve`, engines `^1.90.0`, `out/` with `tsc`, `node:test`) is the
  nearest existing code; RepoHangar uses esbuild and Vitest instead (§14, Appendix C).

## Goals / Non-Goals

**Goals:**
- A scaffold that later phase 1 changes extend without restructuring: the folder layout of Appendix C, one esbuild
  config with two bundles, and the four test levels of §14 runnable from `npm test` and `npm run test:*`.
- A clear split between pure modules (unit-tested with `it.each`, one case per table row) and the thin `vscode` wiring
  (integration-tested on real temporary repositories).
- No `git` process at all on the paths this slice needs, except one fallback.

**Non-Goals:**
- The job runner, network operations and the `git` process helper for ff-only (later `git-operations` and
  `batch-operations` changes). Only the read-only helper for the git dir fallback is added.
- The release script (`scripts/version.mjs`), the CI workflows and the website: separate changes.
- A virtualized list beyond what 100 rows need; the 100-repo benchmark is a phase 4 target.

## Decisions

### D-1. Toolchain and layout

npm (the versioning standard names `package-lock.json`), TypeScript `strict`, esbuild with two entry points:

| Bundle | Entry | Target | Output |
|---|---|---|---|
| Extension host | `src/extension.ts` | Node, CommonJS, `vscode` external | `dist/extension.js` |
| Webview | `webview/main.tsx` | Browser, IIFE, Preact (`jsxImportSource: preact`) | `dist/webview.js`, `dist/webview.css` |

`@vscode/codicons` CSS and font are copied to `dist/codicons/`. Tests: Vitest for `test/unit` (jsdom for `test/unit/webview`);
`@vscode/test-electron` with Mocha for `test/integration` (the runner VS Code expects), one VS Code session per fixture
(`suite/main`, `suite/gitDisabled`, `suite/perf`), each on real repositories built by `test/integration/fixtures`;
Playwright `_electron.launch` against the VS Code build that `@vscode/test-electron` downloads for `test/ui`. The runner
deletes `ELECTRON_RUN_AS_NODE`, which leaks in from a VS Code terminal and would start the test VS Code as plain Node.
Versions are pinned to the ones ReqAnchor uses (TypeScript 5.9.3, Vitest 3.2.7, esbuild 0.28.2) and to the latest
release of the previous major for Preact (10.29.8) and Mocha (11.8.0), rather than majors released days ago. Alternatives: `tsc` only, as Git Graph Opener does, cannot bundle
the webview; webpack is slower and heavier for the same result.

`engines.vscode` is `^1.93.0`, the first release with the Source Control Graph that phase 1 needs (D14), so a later
phase 1 change does not have to raise it (a `Changed` entry, versioning R10). Nothing in this slice needs a newer API.

`package.json` sets `extensionDependencies: ["vscode.git"]`, `extensionKind: ["workspace"]`,
`capabilities.untrustedWorkspaces.supported: false` (D-6), `capabilities.virtualWorkspaces: false`, and
`activationEvents: ["onStartupFinished", "onWebviewPanel:repohangar.dashboard"]` (commands activate implicitly).
`workspaceContains:.git` is left out: `onStartupFinished` already covers the status bar, and activation stays off the
startup path.

### D-2. Module split

```
src/
  extension.ts            activation: wires registry, store, status bar, dashboard, commands
  git/api.ts              getAPI(1) wrapper; git.d.ts from microsoft/vscode
  git/registry.ts         repositories, open/close events, remote choice      (vscode)
  git/remoteUrl.ts        URL parsing                                          (pure)
  git/groups.ts           group assignment, glob matching                      (pure)
  git/gitDirs.ts          gitdir and common dir from .git / commondir files    (pure, fs port)
  git/fastPaths.ts        FETCH_HEAD age, stash count, operation markers       (pure, fs port)
  providers/detect.ts     static provider detection                            (pure)
  state/store.ts          per-repo snapshots, 150 ms debounce, 100 ms batches  (vscode-free core)
  ui/dashboard.ts         WebviewPanel, serializer, CSP, message routing       (vscode)
  ui/statusBar.ts         status bar item                                      (vscode)
  shared/protocol.ts      message types and validators                         (pure, both bundles)
  shared/format.ts        cell text, ages, accessible names, chip membership   (pure, both bundles)
webview/                  Preact grid, toolbar, chips, details, key handling, help overlay
```

Pure modules take a small `FileSystemPort` (`stat`, `readFile`, `exists`) so unit tests use an in-memory map and
integration tests use real repositories. This follows Git Graph Opener's port-interface style, which the later port of
its modules (Appendix D) keeps.

### D-3. Where cell text is computed

The host sends **raw row data** (counts, timestamps, branch, operation, remote without credentials, provider, group);
`shared/format.ts` turns it into cell text, accessible names, the status bar text and chip membership, and both bundles
import it. The webview needs raw timestamps anyway to re-render ages every 60 s without a host round trip, and §8.12
already puts sorting and filtering in the webview. Alternative rejected: the host sends finished strings, which would
need a host timer and a patch per row every minute, and still duplicate chip logic in the webview.

### D-4. Message protocol

Host → view: `snapshot` (all rows, empty state, effective grouping, collapsed groups), `patch` (upserted and removed
rows), `details` (last commit for one row). View → host: `ready`, `firstPaint { ms, rows }`, `setGrouping`,
`toggleGroup`, `loadDetails { repoId }`, `openSettings`. Every incoming message goes through a hand-written validator
in `shared/protocol.ts`; anything else is dropped and logged at `debug`. A schema library (zod, valibot) is not worth
its size for six message types. `jobUpdate` arrives with the job runner in a later change.

### D-5. View state

| State | Where | Why |
|---|---|---|
| Filter text, chips, selection, open details | Webview `setState`, returned to the serializer | Survives reload with the panel, matches "restored after a reload" |
| Collapsed groups, Group menu choice | `workspaceState` (`repohangar.view.collapsedGroups`, `repohangar.view.groupBy`) | Must survive closing the panel; per workspace |

The Group menu never writes `repohangar.groupBy`: in a single-folder workspace that would create `.vscode/settings.json`
inside a repository and make it dirty in the dashboard that wrote it. `onDidChangeConfiguration` for
`repohangar.groupBy` clears the stored choice.

### D-6. Restricted Mode (departs from PROPOSAL.md §12)

§12 asks for a read-only dashboard in Restricted Mode. That cannot happen: `vscode.git` declares
`untrustedWorkspaces.supported: false` (checked in the installed VS Code 1.141, Git extension 10.0.0), and the
enablement service disables any extension whose `extensionDependencies` entry is disabled
(`_isDisabledByExtensionDependency`). RepoHangar therefore declares `supported: false` itself, so the reason shown in
the Extensions view is the honest one, and the spec states the observable result: no process, no status bar item, no
commands, and a start once trusted. Dropping the hard dependency to stay active would mean a second code path for
"no Git API", for a screen that could show nothing. The Extension Development Host does not apply this to the
extension under development, so the Restricted Mode UI test installs the packaged VSIX instead. A task updates the `context` in `openspec/config.yaml`; PROPOSAL.md
§12, kept outside this repository, needs the same correction.

### D-7. Git dirs and fast paths without processes

- **Git dir:** `.git` directory → itself; `.git` file with `gitdir: <path>` → that path (relative to the working tree).
  **Common dir:** the content of `<gitdir>/commondir`, relative to the git dir, else the git dir. Cached per repository.
  Fallback when the files cannot be parsed: `git rev-parse --absolute-git-dir --git-common-dir` once, through the
  process helper (`execFile`, `api.git.path`, 10 s timeout, `GIT_TERMINAL_PROMPT=0`). §5.3 proposes
  `git rev-parse --git-common-dir` first; reading two small files is faster and needs no process.
- **Last fetch:** the newer mtime of `<gitdir>/FETCH_HEAD` and `<commondir>/FETCH_HEAD`. §5.3 reads the common dir only,
  but `FETCH_HEAD` is a per-worktree pseudo-ref, so a fetch run inside a worktree writes the worktree's own file
  (spec row Fetched R10).
- **Stash count:** lines of `<commondir>/logs/refs/stash`; when missing, 1 if `refs/stash` exists loose or in
  `packed-refs`, else 0. §5.3's fallback `git rev-list --walk-reflogs --count refs/stash` needs the same reflog and
  fails without it, so it is dropped.
- **Operation in progress:** the markers in `<gitdir>` (per worktree), checked rebase, merge, cherry-pick, revert.

### D-8. Change detection and batching

- `repository.state.onDidChange` → debounce 150 ms per repository → recompute the Git part of the row from
  `repository.state` and re-read the fast paths (a few `stat` calls).
- One `FileSystemWatcher` per git dir on `{FETCH_HEAD,logs/refs/stash}` (and the common dir when different), for
  changes the Git extension does not report. Watchers are disposed when the repository closes.
- **Status trigger.** The Git extension re-reads a repository after an outside change only while the window is focused
  (`whenIdleAndFocused`) and then sleeps 5 s before the next re-read (`updateWhenIdleAndWait`, checked in VS Code
  1.141), so a commit within 5 s of an earlier change reached the row only after up to ~5 s. RepoHangar therefore also
  watches `HEAD`, `logs/HEAD`, the operation markers (git dir) and `refs/**`, `packed-refs` (common dir), and calls
  `repository.status()` 150 ms after the last change while the window is focused, or once when the window regains
  focus. The index is not watched: `git status` rewrites it, which would loop. Alternative rejected: relying on the
  Git extension alone, which misses PROPOSAL.md §13's "< 1 s" acceptance criterion.
- The store emits at most one batch per 100 ms; the dashboard posts it as one `patch`, the status bar recomputes its
  text from the same batch.
- No interval timer touches Git. The only timer is the webview's 60 s re-render of ages while visible.

### D-9. Row details

Loaded on demand: opening details sends `loadDetails`; the host calls `repository.getCommit('HEAD')` (Git API, local)
and caches the result by commit hash. `HEAD` with no commits → `No commits yet`. Loading it for every row on each change
would add a process per row per update.

### D-10. Opening, pinning and restoring

`createWebviewPanel('repohangar.dashboard', 'RepoHangar', activeColumn, { enableScripts, retainContextWhenHidden:
false, localResourceRoots: [dist] })`; the webview restores its view from `setState`. After the panel becomes active,
`workbench.action.pinEditor` pins it; for the startup path (`preserveFocus`), the pin runs on the panel's first
`onDidChangeViewState` with `active: true`, because the command acts on the active editor. A
`WebviewPanelSerializer` restores the panel and counts as "restored" for the openOnStartup check; so does a dashboard
tab that VS Code restored but has not revived yet (`TabInputWebview` with the view type). On startup with an editor
active, the panel opens with `preserveFocus` and that editor is shown again: a panel created in the active group
becomes its active tab even with `preserveFocus`. Pinned tabs survive **Close All Editors**, as VS Code intends.

The Source Control title button runs `repohangar.scm.openDashboard`, titled **Open RepoHangar** and hidden from the
command palette, which runs `repohangar.open`: a menu item shows its command's title, and `repohangar.open` is titled
**Open Dashboard** in the palette.

CSP: `default-src 'none'; script-src 'nonce-<n>'; style-src ${cspSource}; font-src ${cspSource}; img-src
${cspSource}`. Provider avatar hosts arrive with the MR column. Preact renders text nodes only; no
`dangerouslySetInnerHTML`.

### D-11. Filters and keys

- Chips combine with **AND**, as the filter text does: each narrows the list. PROPOSAL.md does not say; AND lets
  `Dirty` + `Behind` find the repositories Pull all will skip. Chip counts ignore the other filters so they stay stable
  while toggling.
- `1`–`7` are bound by chip identity, not position, so adding Has MR (`5`) and Pipeline failed (`6`) later changes no
  existing key (versioning R5 would make that a `Changed` entry).
- The footer lists only the keys this slice implements; later changes add theirs.

### D-12. Credentials in remote URLs

`remoteUrl.ts` returns `{ host, port, projectPath, webUrl, displayUrl }`, where `displayUrl` is the remote URL with the
userinfo of `http(s)` URLs removed. Only parsed fields cross into the store; the raw URL never does, so no later code
path can post it to the webview. The SSH user (`git@`) is not a secret and stays.

## Risks / Trade-offs

- [`Ctrl+Alt+R` / `Cmd+Alt+R` collides with default bindings] → task 9.2. **Windows (VS Code 1.141, checked
  2026-10-08):** `ctrl+alt+r` is bound to `workbench.action.terminal.runRecentCommand` (when `terminalFocus && …
  !accessibilityModeEnabled`) and to `workbench.action.terminal.sendSequence` (when `accessibilityModeEnabled &&
  terminalFocus`). RepoHangar's binding has no `when` clause, so in a focused terminal it would replace **Run Recent
  Command**. **macOS and Linux:** not checked yet; Reveal in OS (`revealFileInOS`) is expected on `Cmd+Alt+R` /
  `Ctrl+Alt+R` when the editor is not focused. Options for D11: add `"when": "!terminalFocus"` (keeps the key, solves
  Windows only), or choose another key. Decided with `/opsx:update` before archive.
- [FS watchers inside `.git` may be excluded by `files.watcherExclude` on some setups] → `onDidChange` also re-reads
  the fast paths, and `git fetch` changes refs, which the Git extension reports; the watcher only shortens the delay.
- [`workbench.action.pinEditor` pins the wrong editor if focus moves between create and pin] → pin only on the panel's
  own `onDidChangeViewState` with `active: true`; the integration test checks `tab.isPinned` through `tabGroups`.
- [First paint < 300 ms depends on webview startup, which VS Code controls] → small bundle (Preact, no toolkit),
  snapshot posted on `ready`, `firstPaint` timing reported by the webview and asserted in the integration benchmark.
- [The Source Control title button appears for every SCM provider, not only Git] → `when: scmProvider == git`.
- [Restricted Mode differs from §12] → D-6; `config.yaml` is corrected in this change and PROPOSAL.md §12 in its own
  repository.

## Migration Plan

Not applicable: first release of the extension; nothing to migrate. Git Graph Opener settings migrate in the later
`git-graph-opener-migration` change.

## Open Questions

- Answered (2026-10-08, VS Code 1.141): VS Code starts RepoHangar without a reload when the workspace is trusted
  (`test/ui/trust.spec.ts`, packaged VSIX).
- Open: the keybinding conflict on macOS and Linux, and the D11 decision for all three platforms (Risks, task 9.2).
