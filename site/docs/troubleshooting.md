---
title: Troubleshooting
description: Answers to common RepoHangar problems, from missing repositories to Source Control selection and GitLab versions.
---

# Troubleshooting

**Where do I see what went wrong?** Failures that don't deserve a notification go to the **RepoHangar** output
channel: **View: Toggle Output**, then pick **RepoHangar**. Git errors have **Show Git Output**.

## The dashboard is empty, or a repository is missing

- RepoHangar lists the repositories VS Code's Git extension opened. Check that the workspace is
  [trusted](privacy-and-security.md#workspace-trust) and that the **Git** extension is enabled.
- VS Code opens nested repositories only down to its own scan depth. Open the repository folder once in Source
  Control, or add it to the workspace, then run **RepoHangar: Refresh**.
- Check the filter (`/`) and the chips: `Esc` clears the filter, and `1` shows all rows.

## A branch I expect isn't in the Switch quick pick

The list comes from local refs. Run [Fetch all](guide/batch-operations.md) first to see branches that only exist on
the server.

## The MR / PR column shows `Sign in` or `?`

- `Sign in`: the host has no credential. Click it, or run **RepoHangar: Sign In to Host…**. See
  [Signing in](merge-requests/status-and-sign-in.md#signing-in).
- `?`: RepoHangar doesn't know whether the host is GitLab or GitHub. Click it and choose, which writes
  [`repohangar.hosts`](reference/settings.md#repohangar-hosts).

## Merge requests miss reviewers on GitLab

- GitLab Free keeps one reviewer; RepoHangar reports the ones it couldn't add.
- Merge requests created [without a token](merge-requests/gitlab-without-token.md) can't have reviewers. Click
  **Connect `<host>`** in the result and sign in; RepoHangar adds them.
- `team:<slug>` reviewers are GitHub teams and are left out on GitLab.

RepoHangar warns once about a GitLab older than 17.10, the oldest version it supports.

## Show in Source Control doesn't select the repository

Set `scm.repositories.selectionMode` to `single`. VS Code has no API for selecting a repository, so RepoHangar uses
its internal commands, and writes any failure to the **RepoHangar** output channel.

## The Source Control Graph shows another repository

VS Code's Source Control Graph shows the repository of its own **Repo** picker. Pick the repository there, or install
[Git Graph](integrations/git-graph.md).

## Comments disappeared from my profile settings

The [profile editor](merge-requests/profiles.md#the-profile-editor) keeps the rest of `settings.json` and its
comments, but not comments *inside* the `repohangar.mr.profiles` value. Use **Open settings.json** to edit those by
hand.
