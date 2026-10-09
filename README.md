# RepoHangar - Multi-Repo Git Dashboard

See every Git repository in your workspace at a glance, act on all of them at once, and open GitLab merge requests
or GitHub pull requests with your team's defaults in one keystroke.

> RepoHangar is in early development. This version has the read-only dashboard and the status bar summary; batch
> operations, Git Graph shortcuts and merge requests follow.

## Dashboard

Run **RepoHangar: Open Dashboard** (`Ctrl+Alt+H`, `Ctrl+Cmd+H` on macOS), click the status bar summary, or click
**Open RepoHangar** in the Source Control title bar. The dashboard has one row per repository that the built-in Git
extension opened:

| Column | Shows |
|---|---|
| Repository | Name and host (`GL` GitLab, `GH` GitHub, `?` unknown); the tooltip has the path and the remote URL |
| Branch | Branch name and a `no upstream` badge, or `detached a1b2c3d`, `REBASING 3/7`, `MERGING`, `CHERRY-PICKING`, `REVERTING` |
| Sync | `↑ahead ↓behind`, `⇡ publish` for unpublished branches, `—` when there is nothing to sync |
| Changes | `⚠ n confl`, `●` unstaged, `+` staged, `?` untracked, `≡` stashes |
| Fetched | Time since the last fetch, `⚠` when older than `repohangar.staleFetchHours` |

Rows update as soon as the Git extension sees a change; RepoHangar never polls.

### Keys

| Key | Action |
|---|---|
| `↑` `↓` / `j` `k` | Move |
| `Space` | Toggle selection |
| `Ctrl+A` | Select all shown rows |
| `/` | Filter by name, branch or group |
| `Enter` | Row details, or collapse a group |
| `1` `2` `3` `4` `7` | Chips All, Dirty, Behind, Ahead, No upstream |
| `Esc` | Clear the filter, then the selection |
| `?` | Key help |
| `g` | Open the focused row in Git Graph (or the Source Control Graph) |
| `e` | Reveal the focused row in the Explorer |
| `s` | Show the focused row in Source Control |

A click on a repository name reveals it in the Explorer (`repohangar.dashboard.nameClick`); a click on the Changes
cell shows it in Source Control.

## Git Graph

**Open in Git Graph** opens the [Git Graph](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph)
extension switched to the repository: `g` or the `◈` button on a row, the row's `⋯` menu and details, the Source
Control Repositories menu, the Explorer context menu, and **RepoHangar: Open in Git Graph** (`Ctrl+Alt+J`,
`Ctrl+Cmd+J` on macOS) for the repository of the active editor. Source Control is shown next to the graph with the
same repository selected, and keyboard focus stays on Git Graph.

Git Graph is optional. Without it the same items read **Open in Source Control Graph** and open VS Code's built-in
graph (`repohangar.gitGraph.whenMissing`: `"offerInstall"` keeps **Open in Git Graph** and offers to install it,
`"hide"` hides the items). RepoHangar installs nothing unless you click **Install Git Graph**. VS Code's Source Control
Graph shows the repository of its own Repo picker, so pick the repository there if it shows another one.

## Explorer

**Reveal in Explorer** (`e`, the `▤` button, the `⋯` menu, the row details, the Source Control Repositories menu, or
**RepoHangar: Reveal Repository in Explorer**) shows the repository folder in the Explorer. For a repository outside
the workspace folders RepoHangar asks whether to add it to the workspace, open it in a new window or reveal it in the
file manager; **Always do this** remembers the choice in `repohangar.explorer.outsideWorkspace`.

Right-click a repository folder in the Explorer for **Open in Git Graph** and the **RepoHangar** submenu: **Show in
RepoHangar**, **Fetch** and **Pull (ff)**. RepoHangar finds repository folders down to
`repohangar.repositoryScanDepth` levels below each workspace folder, including repositories the Git extension did not
open; **RepoHangar: Refresh** scans again after a clone. Set `repohangar.explorer.contextMenu.showOn` to
`"allFolders"` to get the items on every folder, for the repository that contains it.

## Source Control

**Show in Source Control** (`s`, a click on the Changes cell, the `⋯` menu, the row details, or **RepoHangar: Show
Repository in Source Control**) shows Source Control with the repository selected. Selecting a repository needs
`scm.repositories.selectionMode` set to `single`; VS Code has no API for it, so RepoHangar uses its internal commands
and writes any failure to the **RepoHangar** output channel instead of showing an error.

## Moving from Git Graph Opener

RepoHangar includes Git Graph Opener. On its first start it copies the `gitGraphOpener.*` settings to their
`repohangar.*` keys at every scope where you set them, and leaves the old keys in place. While Git Graph Opener is
installed, RepoHangar hides its own Explorer item and offers once to uninstall Git Graph Opener.

| Git Graph Opener | RepoHangar |
|---|---|
| `gitGraphOpener.contextMenu.showOn` | `repohangar.explorer.contextMenu.showOn` |
| `gitGraphOpener.repositoryScanDepth` | `repohangar.repositoryScanDepth` |
| `gitGraphOpener.sourceControl.reveal` | `repohangar.gitGraph.revealSourceControl` |
| `gitGraphOpener.sourceControl.syncSelection` | `repohangar.gitGraph.syncSourceControlSelection` |

## Settings

| Setting | Default | Description |
|---|---|---|
| `repohangar.openOnStartup` | `"never"` | `"multiRepo"` opens the dashboard when 3 or more repositories are found |
| `repohangar.groupBy` | `"parentFolder"` | `parentFolder`, `workspaceFolder`, `custom` or `none` |
| `repohangar.groups` | `{}` | Custom groups: name → globs on the repository root path |
| `repohangar.staleFetchHours` | `1` | Age that marks the last fetch as stale; `0` turns the marker off |
| `repohangar.statusBar.enabled` | `true` | Show the status bar summary |
| `repohangar.hosts` | `{}` | Provider of self-hosted hosts, for example `{ "git.acme.com": "gitlab" }` |
| `repohangar.dashboard.nameClick` | `"explorer"` | What a click on a repository name does: `explorer`, `gitGraph` or `sourceControl` |
| `repohangar.gitGraph.whenMissing` | `"sourceControlGraph"` | Without Git Graph: `sourceControlGraph`, `offerInstall` or `hide` |
| `repohangar.gitGraph.revealSourceControl` | `true` | Show Source Control after Open in Git Graph |
| `repohangar.gitGraph.syncSourceControlSelection` | `true` | Select the repository in Source Control after Open in Git Graph |
| `repohangar.explorer.contextMenu.showOn` | `"repositoryRoots"` | Explorer folders with the RepoHangar items: `repositoryRoots` or `allFolders` |
| `repohangar.explorer.submenu` | `true` | Show the RepoHangar submenu in the Explorer context menu |
| `repohangar.explorer.collapseBeforeReveal` | `false` | Collapse the Explorer before Reveal in Explorer |
| `repohangar.explorer.outsideWorkspace` | `"ask"` | Reveal outside the workspace folders: `ask`, `addToWorkspace`, `newWindow` or `revealInOS` |
| `repohangar.repositoryScanDepth` | `3` | Folder levels scanned for repository folders below each workspace folder; `0` scans only the folder itself |

## Workspace Trust

RepoHangar relies on VS Code's built-in Git extension, which does not run in Restricted Mode, so RepoHangar starts
only once the workspace is trusted.

## License

[MIT](LICENSE) © 2026 Jhon Tapia - enbinario.com
