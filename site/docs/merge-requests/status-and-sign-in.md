---
title: Status and signing in
description: How RepoHangar shows the merge request or pull request of every branch, which hosts it supports, and how it signs in to GitLab and GitHub.
---

# Status and signing in

## The MR / PR column

The **MR / PR** column of the [dashboard](../guide/dashboard.md) shows the open merge request (GitLab) or pull request
(GitHub) of each repository's branch:

| Shows | Meaning |
|---|---|
| `!142` / `#311` | The merge request or pull request number; a click opens it in the browser |
| `Draft` | It's a draft |
| `✓ passed`, `⟳ running`, `◷ pending`, `✗ failed` | The pipeline (GitLab) or checks (GitHub) |
| `1/2` | Approvals on GitLab |
| `changes requested` | A reviewer requested changes on GitHub |
| `auto ⇢` | Set to merge automatically |
| `Sign in` | The host has no credential; a click signs in |
| `?` | RepoHangar doesn't know the host's provider; a click lets you choose |

`o` on a row, or **RepoHangar: Open Merge Request of Current Branch**, opens it in the browser; **RepoHangar: Copy
Merge Request Link** copies it. Row details add the merge request, its pipeline or checks, **Copy link** and **Compare
with main**; the row menu has **Open compare page**.

## When RepoHangar asks the host

The column costs one GraphQL request per host for all the repositories on it. RepoHangar asks again only when
something changed:

- a commit or a branch switch;
- a push from RepoHangar;
- the window gaining focus after 60 s;
- every [`repohangar.providers.refreshMinutes`](../reference/settings.md#repohangar-providers-refreshminutes) (3) while
  a pipeline runs;
- **RepoHangar: Refresh**.

Nothing is sent while the window is unfocused. The last values are kept, so the dashboard opens with them, dimmed
until they're refreshed.

## Hosts

`github.com` and `gitlab.com` are known. A self-hosted host is asked once, without credentials (`/api/v4/version`,
then `/api/v3/meta`), or you choose with the `?` cell, which writes
[`repohangar.hosts`](../reference/settings.md#repohangar-hosts):

```json
"repohangar.hosts": { "git.acme.com": "gitlab" }
```

Entries in user and workspace settings add up. RepoHangar warns once about a GitLab older than 17.10.

## Signing in

| Host | How RepoHangar gets a credential |
|---|---|
| github.com | Your VS Code GitHub account (`repo` scope); click `Sign in` if you aren't signed in |
| GitHub Enterprise | The VS Code account of `github-enterprise.uri`, a stored token, or your `gh` login |
| GitLab (gitlab.com or self-hosted) | A stored token, else your `glab` login; `Sign in` opens the token page with the name `RepoHangar` and the `api` scope filled in, then asks you to paste the token |

The first time the dashboard opens, a panel lists your hosts and how each is connected, with **Skip — git only** for
hosts you don't want RepoHangar to contact. **RepoHangar: Sign In to Host…** and **RepoHangar: Sign Out of Host…** do
the same later.

Tokens are kept only in VS Code's secret storage, per host, and sent only to their own host. They never reach
settings, logs or the dashboard. A token the host rejects is deleted, and RepoHangar asks you to sign in again. See
[Privacy and security](../privacy-and-security.md).
