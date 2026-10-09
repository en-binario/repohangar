# Changelog

All notable changes to RepoHangar are recorded here. Entries are written and classified as described in
[docs/versioning.md](docs/versioning.md); the kinds of the entries under `## Unreleased` decide the next version.

## Unreleased

- **Added — the RepoHangar dashboard.** **RepoHangar: Open Dashboard** (`repohangar.open`, `Ctrl+Alt+H`, `Ctrl+Cmd+H`
  on macOS, or **Open RepoHangar** in the Source Control title bar) opens one row per Git repository with its branch,
  sync state, changes, stashes and last fetch, including `REBASING 3/7`, `MERGING`, `detached` and `no upstream`
  states. Filter by name, branch or group, use the Dirty, Behind, Ahead and No upstream chips, group repositories by
  folder, workspace folder or custom globs, open row details with the last commit, and move with the keyboard
  (`↑` `↓` `j` `k`, `Space`, `Ctrl+A`, `/`, `Enter`, `1`–`7`, `Esc`, `?`). Rows update as soon as Git changes; the
  dashboard is restored after a window reload.
- **Added — status bar summary.** `⎇ 14 repos ↓3 ●2` shows how many repositories are behind and dirty; its tooltip
  names them and a click opens the dashboard.
- **Added:** **RepoHangar: Refresh** (`repohangar.refresh`) re-reads every repository.
- **Added:** the settings `repohangar.openOnStartup`, `repohangar.groupBy`, `repohangar.groups`,
  `repohangar.staleFetchHours`, `repohangar.statusBar.enabled` and `repohangar.hosts`.
