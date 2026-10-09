## Why

Developers with 5 to 50 Git repositories in one VS Code window cannot see at a glance which repositories are behind,
dirty, unpublished or not fetched recently: the Source Control Repositories view shows a branch and sync counts, one
repository at a time (PROPOSAL.md §1, §2.1, goal G1). Every later RepoHangar feature (row actions, batch operations,
Git Graph shortcuts, merge requests) hangs off a dashboard row, so the repository list and the read-only grid come
first. The repository has no extension code yet, so this change also sets up the extension itself.

Roadmap phase: **1. Dashboard MVP** (§13), first slice. It implements the read-only part of phase 1: the registry, the
grid with its cells, special states, filters, groups and navigation keys, the status bar item and the Source Control
title button.

## What Changes

- **Extension scaffold**: `enbinario.repohangar` with the display name *RepoHangar - Multi-Repo Git Dashboard*, MIT
  license, `extensionDependencies: ["vscode.git"]`, `extensionKind: ["workspace"]`, TypeScript strict, esbuild,
  Vitest, `@vscode/test-electron` and Playwright (D1, D10, D18, §12, §14, Appendix C, §E.4, §E.5).
- **Repository registry** on the built-in Git API (`getAPI(1)`): one row per repository in `api.repositories`,
  following `onDidOpenRepository` / `onDidCloseRepository`; the remote of each repository (upstream remote, else
  `origin`, else the first one) parsed into host, project path and web URL; a provider badge from static detection
  (`repohangar.hosts`, `github.com`, `gitlab.com`, `github-enterprise.uri`); groups by parent folder, workspace folder,
  custom globs or none (§4.2, §4.3, §5.1, §6.2 steps 1–3, D2).
- **Dashboard** webview panel in the editor area (W2, W3, §8.1, §8.3, §8.4, §8.12): columns Repository, Branch, Sync,
  Changes (with the stash count) and Fetched; the special states `REBASING n/m`, `MERGING`, `CHERRY-PICKING`,
  `REVERTING`, `detached <sha>` and the `no upstream` badge; `⇡ publish`; the stale-fetch marker; the filter box and the
  Dirty, Behind, Ahead and No upstream chips; collapsible groups; row details with the last commit and upstream; the
  navigation keys of §10.2 (`↑` `↓` `j` `k`, `Space`, `Ctrl+A`, `/`, `Enter`, `1`–`7`, `Esc`, `?`); empty states;
  live row updates without polling (§11.1, §11.2); a pinned panel restored after a window reload.
- **Read-only local state** shown in the cells: last fetch from `FETCH_HEAD`, stash count from the stash reflog and the
  operation in progress from the git dir markers (§5.3), read from files without starting a process wherever possible.
- **Status bar item** `⎇ 14 repos ↓3 ●2` with a tooltip listing the repositories behind or dirty; a click opens the
  dashboard (W1, §8.1).
- **Entry points**: `repohangar.open` (*RepoHangar: Open Dashboard*, `Ctrl+Alt+H` / `Ctrl+Cmd+H` on macOS, D11 after the
  conflict check of §10.3),
  `repohangar.refresh`, the **Open RepoHangar** button in the Source Control title bar (`scm/title`), and
  `repohangar.openOnStartup` (§8.1, §10.1, §10.3).
- **Settings** (Appendix A): `repohangar.openOnStartup`, `repohangar.groupBy`, `repohangar.groups`,
  `repohangar.staleFetchHours`, `repohangar.statusBar.enabled`, `repohangar.hosts`.
- **Workspace Trust**: RepoHangar declares no support for untrusted workspaces, like the built-in Git extension it
  depends on, so in Restricted Mode it starts no `git` process and contributes nothing; it starts when the workspace is
  trusted. This differs from §12, which expects a read-only dashboard in Restricted Mode: VS Code disables an
  extension whose `extensionDependencies` entry is disabled, and `vscode.git` is disabled in Restricted Mode (see
  design.md).

Not in this change (later phase 1 and phase 2 changes): cell clicks and hover actions, row actions and the action keys
(`f` `F` `p` `P` `b` `n` `s` `t` `g` `e` `.`), Fetch all and Pull all (ff), the default branch and ff-only fast paths,
Open in Git Graph, Reveal in Explorer, the Explorer context menu, Source Control reveal and selection sync, the Git
Graph Opener migration, the MR / PR column and the Has MR and Pipeline chips, the provider probe for unknown hosts,
and scan roots.

## Capabilities

### New Capabilities

- `repo-registry`: which repositories appear and when, the remote chosen for each one and its parsed host, project
  path and web URL, the provider badge from static detection, and the group each repository belongs to.
- `dashboard`: the dashboard panel and how it opens and is restored, its columns and cell text, special states, empty
  states, filters, groups, row details, navigation keys, live updates, refresh, accessibility, Workspace Trust
  behaviour and webview message handling.
- `status-bar`: the status bar summary item, its text, tooltip, visibility and click.

### Modified Capabilities

None. `openspec/specs/` is empty; this change creates the first capabilities.

## Impact

- **New code**: the whole extension (`package.json`, `src/`, `webview/`, `test/`, build and test configuration,
  `LICENSE`, `README.md`) in the layout of PROPOSAL.md Appendix C, limited to the modules this slice needs.
- **Dependencies**: runtime `preact`, `@vscode/codicons`; development `typescript`, `esbuild`, `vitest`,
  `@vscode/test-electron`, `@playwright/test`, `@types/vscode`, `@types/node`. Git API typings (`git.d.ts`) copied
  from the VS Code repository.
- **Public surface** (docs/versioning.md §1): the extension ID, six settings, two commands, one default keybinding and
  the dashboard navigation keys appear for the first time. The CHANGELOG gets `Added` entries.
- **Docs**: the capability table in `docs/openspec.md` §3 records that `dashboard` owns the read-only local state in its
  cells (last fetch, stash count, operation in progress), while `git-operations` keeps the default branch and ff-only
  fast paths. The `context` in `openspec/config.yaml` and PROPOSAL.md §12 change "Restricted Mode makes the dashboard
  read-only" to "RepoHangar does not run in Restricted Mode".
- **Later changes** that add to `repo-registry`, `dashboard` or `status-bar` before this change is archived state
  `Depends on: add-repo-dashboard` and use `ADDED` only.
