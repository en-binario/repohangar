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
- **Added — row actions in the dashboard.** On the focused row, `f` fetches, `p` pulls, `P` pushes (or publishes a
  branch without upstream), `b` switches branch with VS Code's branch picker and `t` opens a terminal in the
  repository. A click on the Branch cell switches branch, on the Fetched cell fetches, and on the Sync cell pulls,
  pushes, publishes or syncs depending on what it shows. Push and Pull refuse a detached HEAD, a rebase or merge in
  progress, or a push behind the remote branch, and say why (with **Pull** when you are behind). The Sync cell shows
  `⟳ fetching` while an action runs and `↷ <reason>` or `✗ fetch failed` afterwards; a failure shows a notification
  with **Show Git Output**.
- **Added — hover buttons and the `⋯` menu.** Hovering a row shows **Fetch**, **Pull**, **Push** or **Publish**,
  **Switch Branch…** and **More Actions…**. The `⋯` menu (also `.`) has **Open terminal**, **Stash changes**, **Pop
  latest stash**, **Discard all changes…** (with VS Code's confirmation), **Reveal in File Explorer**, **Copy path** and
  **Copy branch name**, and works with `↑` `↓` `Enter` `Esc`.
- **Added — Fetch all and Pull all (ff).** **RepoHangar: Fetch All** (`repohangar.fetchAll`, `F`, toolbar
  `⟳ Fetch all`) and **RepoHangar: Pull All (Fast-Forward Only)** (`repohangar.pullAllFf`, toolbar `⇣ Pull all (ff)`)
  run on every repository, or on the selected rows (`⟳ Fetch (3)`); `f` and `p` with rows selected do the same. Pull
  (ff) only fast-forwards a clean branch that is behind and not ahead, and skips every other repository with its
  reason (`dirty (3 files)`, `diverged (↑1 ↓1)`, `detached HEAD`, …); nothing is forced, stashed, merged or rebased. A
  progress notification with **Cancel** and a summary such as `Pull all (ff) — finished in 6.2 s: ✓ 9 updated ·
  ↷ 4 skipped · ✗ 1 failed` follow each batch.
- **Added:** **RepoHangar: Fetch Repository** (`repohangar.fetch`) and **RepoHangar: Pull (Fast-Forward Only)**
  (`repohangar.pullFf`) act on the repository of the active editor, the one selected in Source Control, or one you
  pick.
- **Added:** **Fetch** in the context menu of the Source Control Repositories view.
- **Added:** the settings `repohangar.concurrency` (how many repositories a batch fetches at once, default `6`) and
  `repohangar.fetchTimeoutSeconds` (when a fetch counts as failed, default `60`).
- **Added — Open in Git Graph.** `g`, the `◈` button on a row, the row's `⋯` menu and details, the Source Control
  Repositories menu, the Explorer context menu and **RepoHangar: Open in Git Graph** (`repohangar.openInGitGraph`,
  `Ctrl+Alt+J`, `Ctrl+Cmd+J` on macOS) open the Git Graph extension switched to the repository, show Source Control
  next to it with the same repository selected, and keep keyboard focus on the graph. Git Graph is optional: without
  it the items read **Open in Source Control Graph** (`repohangar.openInSourceControlGraph`) and open VS Code's
  built-in graph. RepoHangar notices Git Graph being installed or removed without a reload and never installs it
  unless you click **Install Git Graph**.
- **Added — Reveal in Explorer.** `e`, the `▤` button, the `⋯` menu, the row details, the Source Control
  Repositories menu, **RepoHangar: Reveal Repository in Explorer** (`repohangar.revealInExplorer`) and a click on a
  repository name show its folder in the Explorer. A repository outside the workspace folders can be added to the
  workspace, opened in a new window or revealed in the file manager, with **Always do this**.
- **Added — Explorer context menu.** Right-click a repository folder for **Open in Git Graph** (or **Open in Source
  Control Graph**) and the **RepoHangar** submenu with **Show in RepoHangar** (`repohangar.showInDashboard`), which
  clears the filter and expands the group to focus the repository's row, **Fetch** and **Pull (ff)**. Repository
  folders are found down to `repohangar.repositoryScanDepth` levels, including repositories the Git extension did not
  open; **RepoHangar: Refresh** scans again. The context keys `repohangar.gitGraph.installed`,
  `repohangar.repositoryRoots` and `repohangar.legacyOpenerInstalled` can be used in your own `when` clauses.
- **Added — Show in Source Control.** `s`, a click on the Changes cell, the `⋯` menu, the row details and
  **RepoHangar: Show Repository in Source Control** (`repohangar.showInSourceControl`) show Source Control with the
  repository selected (with `scm.repositories.selectionMode` set to `single`). Failures go to the new **RepoHangar**
  output channel instead of a notification.
- **Added — moving from Git Graph Opener.** On its first start RepoHangar copies `gitGraphOpener.contextMenu.showOn`,
  `gitGraphOpener.repositoryScanDepth`, `gitGraphOpener.sourceControl.reveal` and
  `gitGraphOpener.sourceControl.syncSelection` to their `repohangar.*` keys at every scope where you set them, and
  keeps the old keys. While Git Graph Opener is installed, RepoHangar hides its own Explorer graph item and offers once
  to uninstall Git Graph Opener.
- **Added:** the settings `repohangar.dashboard.nameClick` (`explorer`), `repohangar.gitGraph.whenMissing`
  (`sourceControlGraph`), `repohangar.gitGraph.revealSourceControl` (`true`),
  `repohangar.gitGraph.syncSourceControlSelection` (`true`), `repohangar.explorer.contextMenu.showOn`
  (`repositoryRoots`), `repohangar.explorer.submenu` (`true`), `repohangar.explorer.collapseBeforeReveal`
  (`false`), `repohangar.explorer.outsideWorkspace` (`ask`) and `repohangar.repositoryScanDepth` (`3`).
- **Added — the MR / PR column.** Each row shows the open GitLab merge request (`!142`) or GitHub pull request
  (`#311`) of its branch with `Draft`, the pipeline or checks (`✓ passed`, `⟳ running`, `◷ pending`, `✗ failed`),
  approvals (`1/2` on GitLab, `approved` or `changes requested` on GitHub) and `auto ⇢`. One request per host loads
  every repository on it; RepoHangar asks again after a commit, a branch switch or a push, when the window gains focus,
  every 3 minutes while a pipeline runs, and on **RepoHangar: Refresh**, never while the window is unfocused. The last
  values are shown at once, dimmed until refreshed. The **Has MR** (`5`) and **Pipeline ✗** (`6`) chips filter by them.
- **Added — signing in to GitLab and GitHub.** github.com uses your VS Code GitHub account; GitHub Enterprise and
  GitLab use your `gh` or `glab` login when there is one, or a token you paste after RepoHangar opens the token page
  with the name and scope filled in. Tokens are kept only in VS Code's secret storage. **RepoHangar: Sign In to Host…**
  and **RepoHangar: Sign Out of Host…**, a `Sign in` button in the MR / PR column, and a first-run panel that lists your
  hosts with **Skip — git only**.
- **Added — open and copy merge requests.** `o`, a click on `!142`, **RepoHangar: Open Merge Request of Current
  Branch** and **RepoHangar: Copy Merge Request Link**; without a credential, `o` opens the host's merge request list
  for the branch. Row details show the merge request, its pipeline or checks and **Compare with main**, and the `⋯`
  menu has **Open compare page**.
- **Added:** a self-hosted host is identified once (`/api/v4/version`, `/api/v3/meta`), or by choosing **This host is
  GitLab** / **GitHub** in its `?` cell; RepoHangar warns once about a GitLab older than 17.10.
- **Added:** the status bar summary counts open merge requests and pull requests (`$(git-pull-request)5`).
- **Added:** the setting `repohangar.providers.refreshMinutes` (`3`).
- **Changed:** `repohangar.hosts` entries from user and workspace settings now add up, so a host chosen from the
  dashboard also applies in a workspace that sets its own hosts.
- **Added — MR profiles and rules.** `repohangar.mr.profiles` holds named defaults for new merge requests and pull
  requests (target, reviewers, assignees, labels, squash, delete source branch, draft, title, description, push and
  what happens after creating), at user or workspace scope, with `extends`; `repohangar.mr.rules` chooses a profile by
  repository and branch glob and can override its values. Titles and descriptions take `{type}`, `{ticket}`,
  `{branchTitle}`, `{commits}`, `{latestRelease}` and other placeholders, and the repository's own merge request or
  pull request template.
- **Added — create with defaults.** `m` on a row, **[Create MR]** / **[Create PR]** in the MR / PR cell, the `⤴` hover
  button and **RepoHangar: Create Merge Request (Defaults)** (`Ctrl+Alt+M`, `Ctrl+Cmd+M` on macOS) create the merge
  request or pull request of the branch in one step: they open an existing one instead, stop with a fix button when the
  branch is not ready, push it when needed and report what was applied, with **Undo** for 30 seconds.
- **Added — the Create MR drawer and quick input.** `M` and **RepoHangar: Create Merge Request…** (`Ctrl+Alt+Shift+M`,
  `Ctrl+Cmd+Shift+M` on macOS) open a drawer beside the grid with every field of the profile to review before
  `Ctrl+Enter`; with `repohangar.mr.quickCreate` set to `"confirm"`, create with defaults shows a quick input first.
- **Added:** **Create MR**, **Create MR…** and **Open MR** in the Source Control Repositories menu and the Explorer
  **RepoHangar** submenu of GitLab and GitHub repositories.
- **Added — GitLab merge requests without a token.** A GitLab host without a token gets its merge request during the
  push, through GitLab's push options; **Connect `<host>`** adds the reviewers afterwards.
- **Added:** the settings `repohangar.mr.profiles`, `repohangar.mr.rules`, `repohangar.mr.quickCreate`,
  `repohangar.mr.ticketPattern`, `repohangar.mr.typeMap` and `repohangar.gitlab.usePushOptions`.
- **Added — switch and create a branch across repositories.** `b` with rows selected, the toolbar button `⎇ Switch…`
  and **RepoHangar: Switch Branch in Repositories…** (`repohangar.switchBranch`) switch the selected repositories, or
  every repository, to a branch picked from one list ranked by how many repositories have it
  (`local in 2 · remote in 1 (tracking branch will be created)`). A branch only on the remote becomes a tracking branch,
  a repository without it is skipped, and repositories with uncommitted changes are skipped, stashed
  (`RepoHangar: before switching to <branch>`) or switched anyway, as you choose once. `n`, the toolbar button
  `＋ Branch…` and **RepoHangar: Create Branch in Repositories…** (`repohangar.createBranch`) create and check out one
  branch name, checked with `git check-ref-format`, from the current HEAD of each repository; the switch list offers
  `＋ Create "<name>"` too. The Sync cell reads `⟳ switching` or `⟳ creating branch` meanwhile.
- **Added — batch result panel.** After Fetch all, Pull all (ff), Switch or Create with a skipped or failed repository,
  a panel above the grid lists every repository with its result and a fix button (**Stash and pull**, **Pull with
  rebase**, **Publish**, **Open SCM**, **Show Git Output**, **Stash and switch**, **Create branch here**), with **Retry
  failed** for the failed ones and **Close**. Batches started from the Command Palette add **Show Details** to their
  summary notification.
- **Changed:** `b` with rows selected switches the selected repositories instead of only the focused row. Without a
  selection, `b`, a click on the Branch cell and the `⎇` hover button still switch the focused row with VS Code's
  branch picker.
- **Added — merge requests for several repositories.** `m` with rows selected, the toolbar button `⤴ Create MRs (3)`
  and **RepoHangar: Create Merge Request (Defaults)** while the dashboard has rows selected create one merge request or
  pull request per repository, in parallel, each with its own profile and checks; one that is not ready is skipped
  with its reason. Each description then gets a `Related:` section linking the others, at `{related}` (a new
  placeholder) or at the end, replaced rather than repeated when the set is created again. A result panel lists every
  repository with **Open ↗**, **Copy all links** and **Retry failed**.
- **Added — the MR profile editor.** **RepoHangar: Edit MR Profiles** (`repohangar.profiles.edit`), the `⚙` button of
  the dashboard toolbar and **Set up a default profile** in the first-run hosts panel (which now says `Merge request
  defaults: none yet.` or `Merge request defaults: 2 profiles.`) open a form over `repohangar.mr.profiles` and
  `repohangar.mr.rules`, with a **User** / **Workspace** switch: add profiles, edit every key with a live title preview,
  see inherited values dimmed with where they come from, and add, move and delete rules. **Save** writes only the
  chosen scope and keeps the rest of `settings.json`, comments included; a change made in `settings.json` while you
  have unsaved edits shows **Reload** and **Keep editing** instead of overwriting them.
- **Added — Save as defaults.** **Save as defaults ▾** in the Create MR drawer keeps the reviewers, assignees, labels,
  squash, delete-branch and draft values that differ from the profile: **For me (all workspaces)** in the profile at user
  scope, **For this workspace (shared)** at workspace scope, or **For this repo only**, remembered for that repository
  in this workspace and applied after the rule's `set`. The profile editor lists what each repository remembers, with
  **Forget**. The title, description and target are never saved, nor a squash value the GitLab project forces.
- **Added — recent reviewers and labels.** The drawer shows `recent: luis.gomez · team:backend` under **Reviewers** and
  **Labels**: the last 10 you sent on that host that the field does not hold yet, each one click to add.
- **Changed:** a push stopped by the repository's local pre-push hook (`P`, the Sync cell, or the push before
  **Create MR**) now says so: the failure reads `pre-push hook failed: <the hook's first line>` instead of only the
  hook's output, which Git prints without naming the hook.
- **Changed:** a right-click on a dashboard row opens the row's `⋯` menu (Open terminal, Stash changes, Copy path, Copy
  branch name, …) at the pointer instead of the Cut / Copy / Paste menu. The filter box and the row details keep Cut /
  Copy / Paste.
- **Added:** the value `"auto"` of `repohangar.dashboard.nameClick`: Open in Git Graph when Git Graph is installed,
  else Reveal in Explorer.
- **Changed:** a click on a repository name opens the repository in Git Graph when Git Graph is installed
  (`repohangar.dashboard.nameClick` now defaults to `"auto"`); without Git Graph it still reveals the repository in the
  Explorer. Set `"explorer"` to keep revealing it in the Explorer.
- **Fixed:** `Ctrl+Alt+H` and **RepoHangar: Open Dashboard** opened a second RepoHangar tab after a window reload while
  the restored dashboard waited in a background tab; they now show that tab. A second dashboard restored from an
  earlier session is closed.
- **Fixed:** the dashboard showed a vertical scrollbar when every row fit in the panel.
- **Fixed:** after a reload, the dashboard footer and toolbar could read `2 selected` and `Fetch (2)` with no row
  checked, when the rows selected in an earlier session were no longer listed; **Fetch (2)** then fetched every
  repository. The count, the toolbar and the keys now use only the selected rows that are listed.
- **Fixed:** MR / PR cells of a GitLab host with more than 13 repositories never refreshed (`Not refreshed since …`,
  no `[Create MR]`): GitLab rejected the batched status request as too large or too complex (`HTTP 422`). Requests now
  carry at most 10 repositories and are split further when GitLab still rejects them, and the RepoHangar log shows
  GitLab's message (`Query too large`) instead of `HTTP 422`.
- **Fixed:** a reviewer or assignee written as `@jtapiap` (with the leading `@`), or in a different case than the
  GitLab username, was left out of the merge request with `Reviewer @jtapiap not found on <host>.` The `@` is now
  dropped (`@me` still means you) and GitLab usernames match regardless of case.
- **Added — find users for Reviewers and Assignees.** Typing in **Reviewers** or **Assignees** in the Create MR drawer
  lists the project's users by name and username (`Jhon Wilber Tapia Pinto @jtapiap`); `↑` `↓` and `Enter` or a click
  add one, and `Esc` closes the list without closing the drawer. The list says `Searching…`,
  `No users on <host> match "<text>".`, `Sign in to <host> to search users.` or `User search failed: <message>.`
- **Added:** **Search users in** in the MR profile editor: **Reviewers** and **Assignees** search the users of the
  chosen GitLab or GitHub repository, the focused dashboard row's by default.
- **Changed:** user suggestions on GitHub match names as well as logins, and are no longer limited to the first 100
  assignable users of the repository.
- **Added:** the value `"drawer"` of `repohangar.mr.quickCreate`: create with defaults opens the Create MR drawer,
  pre-filled from the MR profile.
- **Changed:** `m`, **[Create MR]** in the MR / PR cell, the `⤴` hover button, `Ctrl+Alt+M` and **Create MR** in the
  menus open the pre-filled Create MR drawer instead of creating the merge request at once
  (`repohangar.mr.quickCreate` now defaults to `"drawer"`), and `m` on a selection asks once before creating. Set
  `"direct"` to create with no dialog as before. **[Create MR]** now follows the setting too, so with `"confirm"` it
  shows the quick input.
- **Added — select a group and sort by column.** A checkbox on each group header selects every repository of the group
  that the filter shows, or clears them (`−` when only some are selected); `Space` on a group header does the same, and
  the checkbox above the rows selects every repository the filter shows. Shift+click a row's checkbox to select the
  rows from the last one clicked. A click on a column header sorts the rows within each group: the first click puts
  what needs attention on top (most behind, most changes, oldest fetch, failed pipeline; A→Z for names), a second click
  reverses it and a third returns to repository name A→Z. `S` sorts from the keyboard. The sort is remembered for the
  workspace.
