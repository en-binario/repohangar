## Context

Phase 1 left a seam for providers: `src/providers/detect.ts` assigns `gitlab`, `github` or `unknown` from settings
(repo-registry), `RemoteInfo` carries `{ host, projectPath, webUrl }` without credentials, and the store emits
coalesced row patches to the webview. Nothing talks to a host yet. The extension runs only in trusted workspaces
(dashboard `Restricted Mode`), so no trust check is needed per request. See proposal.md for the scope.

## Goals / Non-Goals

**Goals:**
- One request per host for the whole MR column (G7), measured by the contract tests and the performance benchmark.
- One provider interface (§6.1) that `add-mr-creation` extends with `projectInfo`, `createReview`, `searchUsers` and
  `closeReview`, without changing what this change builds.
- Every module with logic (GraphQL building, answer mapping, cell text, back-off, credential order) free of `vscode`
  imports, so it is unit-tested with `it.each`.

**Non-Goals:**
- Merged and closed reviews: the query asks for open ones only. `add-auto-merge` adds the merged lookup it needs.
- Individual check runs or jobs: the pipeline line shows the rollup state and links to the provider page.
- Avatars in the webview: no images are loaded, so the CSP stays `img-src` free.

## Decisions

### D-1. HTTP through the extension host's `fetch`

`src/providers/http.ts` wraps the global `fetch` (Node 20, VS Code ≥ 1.93): it adds the credential header for the
request's own host, sets `redirect: 'manual'` and treats any `3xx` as a failure (spec `Token handling`), applies the 15 s
timeout with an `AbortController`, stores ETags per URL in memory, and turns `429` / `403` + `X-RateLimit-Remaining: 0`
/ `Retry-After` into a `RateLimited(untilMs)` error. VS Code's `http.fetchAdditionalSupport` (default on) makes this
`fetch` follow `http.proxy`, `http.proxyStrictSSL` and system certificates (§12). *Alternatives:* `node:https` (more
code, same proxy support) or `undici` as a dependency (duplicates what the host ships).

Headers: GitLab `Authorization: Bearer <token>` (accepted for personal access tokens and OAuth tokens); GitHub
`Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`.

Base URLs come from the remote's web URL, so a port is kept: GitLab `https://<host>[:port]/api/graphql` and
`/api/v4`; GitHub `https://api.github.com` / `https://api.github.com/graphql` for `github.com`, else
`https://<host>/api/v3` and `https://<host>/api/graphql`.

### D-2. Provider modules

| Module | Holds | `vscode` import |
|---|---|---|
| `providers/provider.ts` | `HostingProvider` interface, `ReviewState`, `ProviderFactory` keyed by host | No |
| `providers/gitlab.ts`, `github.ts` | Query building with aliases `r0…r49`, answer mapping, REST fallback | No |
| `providers/reviewCell.ts` | Pipeline, approval, mergeable and cell text mapping (the spec matrices) | No |
| `providers/probe.ts` | Unknown-host probe and the version check | No (storage port) |
| `providers/reviewQueue.ts` | Per-host queue, 2 s flush, chunking, back-off, focus gating | No (clock and focus ports) |
| `providers/auth.ts` | Credential order, `glab` / `gh` import, sign-in and sign-out flows | Yes (thin), logic in `authOrder.ts` (no) |

The GraphQL selection is a list of field paths, so a schema error removes one path and the query is rebuilt; the
reduced list per host goes to `globalState` key `repohangar.providers.selection.<host>` with the extension version and
the GitLab version it was computed for. Field names are parsed from the error message
(`Field '<name>' doesn't exist on type '<Type>'`, GitLab and GitHub use the same wording); an unparseable error is
treated as a failure (back-off), never as a schema reduction.

GitLab selection adds `approvalsRequired` to the proposal's §6.4 list, so the cell can show `given/required`; it is
optional like the other approval fields (Free has no approval rules). The nightly job showed that GitLab CE 17.10.0
has neither `approvalsRequired` nor `approvalsLeft` (Premium fields) and reports both for every alias
(`test/contract/fixtures/git.acme.com/schema-error-ce-17.10.json`, recorded from the container): the first load of a CE
host costs one retry, after which the reduced selection is remembered and a load costs one request per chunk again.
Repeated reports of a field already removed are ignored; only a report that removes nothing falls back to REST.

### D-3. GitHub approvals as `reviewDecision`

The wireframe shows `1/2` for GitHub, but the GraphQL API exposes the required approving review count only through
branch protection rules, which need admin read access. `reviewDecision` (`approved`, `changes requested`,
`review required`) is available to every reader and says what a person needs to know. *Alternative:* query
`branchProtectionRules` — rejected, it fails for most users and costs a second selection per repository.

### D-4. Review state in the store and cache

`RowData` gains `review?: ReviewInfo` (the stored state, or why there is none: `signIn`, `unknownHost`, `skipped`,
`loading`, `notFound`) plus `hosted`, `headSha` and `defaultBranch`; `src/shared/review.ts`, which both the host and
the webview import (like `format.ts`), turns it into the cell text, accessible name and tooltip, so the webview keeps
no logic of its own and one table-driven test covers both. The store applies the provider layer as a row decorator
(`RowStore.setDecorator`), and republishes only rows whose decoration changed. The store keeps `ReviewState` per `repoId + branch` with `headSha` and `fetchedAt`, persists
it in `workspaceState` (`repohangar.reviews`), and drops entries whose repository is gone at activation. "Not refreshed"
= loaded in a previous session (`fetchedAt` before activation) or `headSha` ≠ HEAD or the host is in back-off.

### D-5. Refresh queue and focus

`reviewQueue` receives events from the store (branch or SHA change), from `git-operations` (push and publish ended),
from `window.onDidChangeWindowState` and from `repohangar.refresh`. A per-host timer flushes 2 s after the first queued
repository; while the window is unfocused, events only mark repositories dirty and no timer is armed. The
`refreshMinutes` timer exists only while focused and a listed review has a `running` or `pending` pipeline value
(R2/R3 of the pipeline matrix, or GitHub `PENDING`). The probe and the version check also wait for focus.

### D-6. Credentials

`authOrder.ts` decides the order of the spec matrices from inputs (host, GHE URI, session present, secret present,
CLI output) and returns the next step; `auth.ts` executes it. `vscode.authentication.getSession` is called with
`{ createIfNone: false, silent: true }` for lookups and `{ createIfNone: true }` only from a user action. `glab` and `gh`
run through the existing `src/git/process.ts` runner (execFile, argument array, 10 s timeout, no shell). Newer `glab`
versions that keep the token in the OS keyring print nothing for `config get token`; for them
`glab auth status --hostname <host> --show-token` is tried as the second command, parsed for the `Token:` line (task
2.3 records which `glab` releases need it). The token is validated with `GET /user` before it is stored, so a stale
CLI login never reaches `SecretStorage`.

The username shown in the first-run panel and the quick pick comes from that `GET /user` (GitLab `username`, GitHub
`login`), or from the session's `account.label`.

### D-7. Webview

New protocol messages: host → view `review` cells inside `patch`, `firstRun` panel data; view → host `openReview`,
`copyReviewLink`, `openCompare`, `openPipeline`, `signIn { host }`, `chooseProvider { host }`, `skipHost { host }`,
`firstRunDone`. Every message is validated against the protocol schema (dashboard `Webview safety`). The MR / PR column
is 22 ch wide by default; long titles stay in the tooltip.

### D-8. Status bar

`statusBar.ts` counts rows whose `review` is an open review (stale or not) and adds `$(git-pull-request)<m>`; the
tooltip line lists them by repository name with the same 10-name limit as the other lines.

### D-9. `repohangar.hosts` across scopes

`getConfiguration().get('repohangar.hosts')` returns only the narrowest scope's object, so the user-scope entry the `?`
cell writes was hidden in a workspace with its own `repohangar.hosts` (found by
`providers/30-reviewCommands.test.ts`). The registry now merges `inspect()`'s global, workspace and workspace-folder
values, the narrower scope winning per host (spec `Host choice for an unknown host`).

### D-10. Test seams

The integration tests replace `Http.fetchOverride` and the `AuthUi` port (VS Code sessions, the token page, the
password input, `glab` and `gh`) through the test API. Outside Production mode two environment variables are read:
`REPOHANGAR_HTTP_STUB` sends every provider request to a local stub server (`<stub>/<host><path>`), which every
integration session and the Playwright providers spec start, so no test reaches GitLab or GitHub; and
`REPOHANGAR_TEST_TOKENS` seeds tokens per host for the Playwright tests, which cannot drive VS Code's GitHub sign-in or
a browser. Neither is read in Production mode.

### D-11. Hover buttons in their own column

The row's hover buttons were positioned over the right edge of the row, which is now the MR / PR cell with its own
buttons (`Sign in`, `?`, `!142`); a pointer over the cell showed the hover buttons on top of it, so the cell could not
be clicked. The buttons get a 184 px grid column of their own.

### D-12. When the first-run panel shows

Rows arrive one by one after activation, and a repository on GitHub can be among the last (a repository without
commits takes longest). Deciding on the first snapshot showed the grid and then swapped the panel in a moment later;
deciding only when every row exists kept a restored dashboard on `Loading repositories…` for seconds. The dashboard
therefore decides once per panel: at once after a dismissal or when a GitLab or GitHub row exists, else when the rows
are complete or after 2 s; the snapshot carries `firstRunPending` until then, and the webview shows `Loading
repositories…` instead of a grid it could replace. A restored panel never shows it, so the reload requirement of
`dashboard` holds.

## Risks / Trade-offs

- [`401` from `/api/v4/version` identifies GitLab on hosts that put everything behind SSO] → the result can be wrong
  only for hosts that answer `401` to that exact path; `repohangar.hosts` overrides it and the user can choose in the
  `?` cell after clearing it with **RepoHangar: Refresh**.
- [Auto-importing a `glab` or `gh` token surprises a user] → it is announced once (`Using your glab login for …`),
  validated first, and removable with **Sign Out of Host…**; **Skip — git only** stops it per host.
- [Rate limits on GitHub with many repositories] → one GraphQL request per 50 repositories costs 1 point each;
  back-off honors `Retry-After` and `X-RateLimit-Reset`; no timer when nothing is running.
- [GitLab field drift between 17.10 and later releases] → reduced selection per host, REST fallback, nightly CE 17.10.0
  job (§14).
- [Cached values mislead after a long time away] → dimmed with `Not refreshed since …`, refreshed on focus.

## Migration Plan

No migration: new settings default to the documented values and no existing setting changes meaning. Rollback is
uninstalling; `SecretStorage` entries are removed with the extension's secrets.

## Open Questions

- Does `glab config get token --host` print the token on `glab` 1.50 and later, or only `glab auth status
  --show-token`? **Answered** (task 2.3), with a config-file login on glab 1.46.0, 1.80.4 and 1.121.0 (Windows):
  `config get token --host` prints the token on its first line in all three; 1.80 and 1.121 add update and telemetry
  notices on stderr, which RepoHangar now turns off (`GLAB_CHECK_UPDATE=false`, `GLAB_SEND_TELEMETRY=false`) and
  ignores (first line only). `auth status --show-token` labels the token differently in each release: `Token:`
  (1.46), `Token found:` (1.80), `Token found in configuration file (plaintext):` (1.121); the parser reads any
  `Token …:` label. A keyring login prints nothing for `config get token`, so the second command is the one that
  finds it; its label is covered by the same parser. None of this changes the spec.
