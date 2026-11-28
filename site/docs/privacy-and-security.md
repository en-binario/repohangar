---
title: Privacy and security
description: No telemetry, what RepoHangar sends to GitLab and GitHub, what it stores locally, how tokens are isolated, and website privacy.
---

# Privacy and security

## No telemetry

RepoHangar collects **no telemetry, analytics, usage metrics, or crash reports**, and operates no EnBinario backend
servers. Every request goes directly from your machine to the Git hosts of your workspace repositories.

Third-party platforms remain governed by their own privacy policies and terms:

- Your Git hosts (for example, GitLab.com, GitHub.com, or your organization's self-hosted servers) process API and Git
  requests under their own policies.
- Installing or running the extension inside VS Code, VSCodium, Cursor, or another editor is subject to that editor's
  and registry's (VS Code Marketplace or Open VSX) own telemetry and privacy terms.

## What RepoHangar contacts

RepoHangar talks only to the Git hosts of your workspace repositories, and only for the merge request features:

- one GraphQL request per host for the [MR / PR column](merge-requests/status-and-sign-in.md#when-repohangar-asks-the-host),
  only when something changed and never while the window is unfocused;
- the requests that create, look up, link (the **Related:** section) or undo a merge request or pull request, and
  the user search of the drawer and the profile editor;
- once per self-hosted host, a request without credentials (`/api/v4/version`, then `/api/v3/meta`) to learn whether
  it's GitLab or GitHub Enterprise.

API requests include an identifying `User-Agent` header (`RepoHangar/<version> (+https://repohangar.enbinario.com)`),
do not follow HTTP redirects, and time out after 15 seconds.

**Skip — git only** in the first-run panel keeps a host out of all of this. Fetch, pull, push and branch operations
run through VS Code's built-in Git extension and your own credentials, as they would from the command line.

## Credentials and tokens

- On `github.com` and GitHub Enterprise (`github-enterprise.uri`), RepoHangar prefers your VS Code authentication
  session, so there's often no separate token to store.
- Personal access tokens you paste are kept only in VS Code's `SecretStorage`, keyed per host, and sent only in the
  `Authorization` header to that exact host (never across redirects or to another host).
- When RepoHangar borrows a `glab` or `gh` CLI login, it runs the CLI with update checks, telemetry and interactive
  prompts turned off, validates the token against that host, and caches a copy in VS Code `SecretStorage` under that
  host.
- Tokens never reach `settings.json`, output logs, or webview messages.
- A token the host rejects (`401`) is deleted automatically, and RepoHangar asks you to sign in again.
- **RepoHangar: Sign Out of Host…** deletes the stored token for a host and clears its cached merge request metadata
  for the current workspace.

## Local data stored on your machine

Everything RepoHangar remembers stays locally inside VS Code on your machine and is never transmitted to EnBinario:

| Storage | What is stored | How to remove it |
|---|---|---|
| VS Code `SecretStorage` | Per-host personal access tokens (`repohangar.token.<host>`), including tokens imported from `glab`/`gh` | Run **RepoHangar: Sign Out of Host…** |
| VS Code `globalState` | Skipped hosts, detected self-hosted provider types, GitLab version warnings, GraphQL schema compatibility selections, GitLab username-to-ID cache, recent reviewers and labels (up to 10 per host), first-run and migration flags | Clear VS Code extension global state or uninstall RepoHangar |
| VS Code `workspaceState` | Cached open MR/PR metadata for the workspace (cleared on sign-out), per-repo MR overrides (*For this repo only*), dashboard grouping, collapsed groups and sort order | Sign out (clears MR cache), click **Forget** in the MR profile editor (clears per-repo overrides), or clear workspace state |
| `settings.json` (user or workspace) | Explicit `repohangar.*` settings, profiles, rules and self-hosted `repohangar.hosts` entries you save | Edit or remove the `repohangar.*` entries in VS Code Settings |
| **RepoHangar** output channel | Local diagnostics and, at `Trace` level, HTTP method, URL, status and duration (never tokens, `Authorization` headers or request bodies) | Clear the output channel or close the window |

## Webview isolation and Workspace Trust

### Webview security

The dashboard and MR profile editor webviews run with a strict Content Security Policy (`default-src 'none'`, nonce-based
scripts only, local bundled assets only, no remote scripts or fonts). Every message from a webview is validated against
the host protocol before any command runs.

### Workspace Trust

RepoHangar relies on VS Code's built-in Git extension, which doesn't run in Restricted Mode, so RepoHangar starts only
once the workspace is trusted.

## Documentation website (`repohangar.enbinario.com`)

- This website sets no cookies, runs no analytics or tracking scripts, and loads no third-party fonts or trackers.
- Your browser's `localStorage` is used only for UI preferences (light/dark theme and dismissing the announcement bar),
  which never leave your device.
- The site is hosted on **GitHub Pages**, which processes visitors' IP addresses for security and delivery under the
  [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Reporting a vulnerability

Report security vulnerabilities privately with **Report a vulnerability** under the *Security* tab of the
[GitHub repository](https://github.com/en-binario/repohangar/security), or email `admin@enbinario.com`, rather than
opening a public issue. See [SECURITY.md](https://github.com/en-binario/repohangar/blob/main/SECURITY.md) and
[`/.well-known/security.txt`](https://repohangar.enbinario.com/.well-known/security.txt) for supported versions, scope
and coordinated disclosure guidelines.
