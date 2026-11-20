---
title: Explorer and Source Control
description: Reveal repositories in the Explorer, use RepoHangar's Explorer context menu, and show a repository in Source Control.
---

# Explorer and Source Control

## Reveal in Explorer

**Reveal in Explorer** shows the repository folder in the Explorer. It's available from `e`, the `▤` button, the
`⋯` menu and the row details in the dashboard, the Source Control Repositories menu, and **RepoHangar: Reveal
Repository in Explorer**.

For a repository outside the workspace folders, RepoHangar asks whether to add it to the workspace, open it in a new
window or reveal it in the file manager. **Always do this** remembers the choice in
[`repohangar.explorer.outsideWorkspace`](../reference/settings.md#repohangar-explorer-outsideworkspace). Set
[`repohangar.explorer.collapseBeforeReveal`](../reference/settings.md#repohangar-explorer-collapsebeforereveal) to
collapse the Explorer first.

## The Explorer context menu

Right-click a repository folder in the Explorer for **Open in Git Graph** and the **RepoHangar** submenu:

- **Show in RepoHangar**
- **Fetch**
- **Pull (ff)**
- **Create MR**, **Create MR…** and **Open MR** for GitLab and GitHub repositories

RepoHangar finds repository folders down to
[`repohangar.repositoryScanDepth`](../reference/settings.md#repohangar-repositoryscandepth) levels below each
workspace folder (3 by default), including repositories the Git extension didn't open. **RepoHangar: Refresh** scans
again after a clone.

Set [`repohangar.explorer.contextMenu.showOn`](../reference/settings.md#repohangar-explorer-contextmenu-showon) to
`"allFolders"` to get the items on every folder, for the repository that contains it, or
[`repohangar.explorer.submenu`](../reference/settings.md#repohangar-explorer-submenu) to `false` to hide the submenu.

## Show in Source Control

**Show in Source Control** shows Source Control with the repository selected: `s`, a click on the Changes cell, the
`⋯` menu, the row details, or **RepoHangar: Show Repository in Source Control**.

Selecting a repository needs `scm.repositories.selectionMode` set to `single`. VS Code has no API for it, so
RepoHangar uses its internal commands and writes any failure to the **RepoHangar** output channel instead of showing
an error.

The Source Control Repositories menu (the `⋯` of a repository in the Source Control view) has the RepoHangar items
too: **Open in Git Graph**, **Reveal in Explorer**, **Create MR** and **Open MR**.
