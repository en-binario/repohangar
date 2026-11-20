---
title: Moving from Git Graph Opener
description: RepoHangar includes Git Graph Opener and copies its settings on first start.
sidebar_label: From Git Graph Opener
---

# Moving from Git Graph Opener

RepoHangar includes Git Graph Opener. On its first start it copies the `gitGraphOpener.*` settings to their
`repohangar.*` keys at every scope where you set them, and leaves the old keys in place.

| Git Graph Opener | RepoHangar |
|---|---|
| `gitGraphOpener.contextMenu.showOn` | [`repohangar.explorer.contextMenu.showOn`](reference/settings.md#repohangar-explorer-contextmenu-showon) |
| `gitGraphOpener.repositoryScanDepth` | [`repohangar.repositoryScanDepth`](reference/settings.md#repohangar-repositoryscandepth) |
| `gitGraphOpener.sourceControl.reveal` | [`repohangar.gitGraph.revealSourceControl`](reference/settings.md#repohangar-gitgraph-revealsourcecontrol) |
| `gitGraphOpener.sourceControl.syncSelection` | [`repohangar.gitGraph.syncSourceControlSelection`](reference/settings.md#repohangar-gitgraph-syncsourcecontrolselection) |

While Git Graph Opener is installed, RepoHangar hides its own Explorer item, so the menu doesn't show it twice, and
offers once to uninstall Git Graph Opener.
