---
title: Privacy and security
description: What RepoHangar sends to GitLab and GitHub, where it keeps tokens, and why it needs a trusted workspace.
---

# Privacy and security

## What RepoHangar contacts

RepoHangar talks only to the Git hosts of your repositories, and only for the merge request features:

- one GraphQL request per host for the [MR / PR column](merge-requests/status-and-sign-in.md#when-repohangar-asks-the-host),
  only when something changed and never while the window is unfocused;
- the requests that create, look up, link (the **Related:** section) or undo a merge request or pull request, and
  the user search of the drawer and the profile editor;
- once per self-hosted host, a request without credentials (`/api/v4/version`, then `/api/v3/meta`) to learn whether
  it's GitLab or GitHub Enterprise.

**Skip — git only** in the first-run panel keeps a host out of all of this. Fetch, pull, push and branch operations
run through VS Code's Git extension and your own credentials, as they would from the command line.

When RepoHangar borrows a `glab` or `gh` login, it runs them with update checks, telemetry and prompts turned off.

## Tokens

- Tokens are kept only in VS Code's secret storage, per host, and sent only to their own host.
- They never reach settings, logs or the dashboard.
- A token the host rejects is deleted, and RepoHangar asks you to sign in again.
- **RepoHangar: Sign Out of Host…** deletes a stored token.

On github.com and GitHub Enterprise, RepoHangar prefers your VS Code account, so there's often no token to store.

## Workspace Trust

RepoHangar relies on VS Code's built-in Git extension, which doesn't run in Restricted Mode, so RepoHangar starts only
once the workspace is trusted.

## Reporting a vulnerability

Report it privately with **Report a vulnerability** under the *Security* tab of the
[GitHub repository](https://github.com/en-binario/repohangar/security), not in a public issue.
