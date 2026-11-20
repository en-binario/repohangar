---
title: GitLab without a token
description: How RepoHangar creates GitLab merge requests with push options when a host has no token, and what that can't set.
---

# GitLab without a token

When a GitLab host has no token, RepoHangar creates the merge request during the push, with GitLab's push options
(`git push -o merge_request.create …`) instead of the API.
[`repohangar.gitlab.usePushOptions`](../reference/settings.md#repohangar-gitlab-usepushoptions) controls it:

| Value | How GitLab merge requests are created |
|---|---|
| `"whenNoToken"` (default) | With push options when the host has no token, otherwise with the API |
| `"always"` | With push options, even when the host has a token |
| `"never"` | With the API only, so the host needs a token |

The push runs `git push` with your credential helper or SSH key and sets the target, title, a one-line description,
draft, labels, the first assignee, squash and delete source branch.

## What push options can't do

- set reviewers;
- set a description with line breaks;
- set more than one assignee;
- create the merge request of a branch that is already pushed.

The result says what was left out and offers **Connect `<host>`**: sign in, and RepoHangar adds the reviewers to
that merge request. Merge requests created this way aren't linked in the
[Related section](several-repositories.md#related-links) of the others.
