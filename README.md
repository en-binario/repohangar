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

## Settings

| Setting | Default | Description |
|---|---|---|
| `repohangar.openOnStartup` | `"never"` | `"multiRepo"` opens the dashboard when 3 or more repositories are found |
| `repohangar.groupBy` | `"parentFolder"` | `parentFolder`, `workspaceFolder`, `custom` or `none` |
| `repohangar.groups` | `{}` | Custom groups: name → globs on the repository root path |
| `repohangar.staleFetchHours` | `1` | Age that marks the last fetch as stale; `0` turns the marker off |
| `repohangar.statusBar.enabled` | `true` | Show the status bar summary |
| `repohangar.hosts` | `{}` | Provider of self-hosted hosts, for example `{ "git.acme.com": "gitlab" }` |

## Workspace Trust

RepoHangar relies on VS Code's built-in Git extension, which does not run in Restricted Mode, so RepoHangar starts
only once the workspace is trusted.

## License

[MIT](LICENSE) © 2026 Jhon Tapia - enbinario.com
