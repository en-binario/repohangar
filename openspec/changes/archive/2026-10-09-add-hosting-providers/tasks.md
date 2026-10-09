## 1. HTTP and provider core

- [x] 1.1 Add `msw` (dev) and a `test/contract/` Vitest project with a recorded-fixture helper (`test/contract/fixtures/<host>/<operation>.json`); verify `npm test` runs an empty contract suite
- [x] 1.2 Implement `src/providers/http.ts` (D-1: credential header per host, `redirect: 'manual'`, 15 s timeout, ETags, rate-limit errors); `Redirect to another host` and `Trace logging of a request` (provider-auth) → `test/contract/http.test.ts`, asserting no request to `sso.acme.com` and no token in the captured log lines
- [x] 1.3 Implement `provider.ts`, `ReviewState` and the `ProviderFactory`; verify `npm run typecheck` passes with GitLab and GitHub stubs

## 2. Credentials

- [x] 2.1 Implement `authOrder.ts` (D-6); `GitHub credential matrix` (provider-auth) → `test/unit/authOrder.test.ts`, one case per R1–R7; `GitLab credential matrix` (provider-auth) → the same file, one case per R1–R4
- [x] 2.2 Implement `auth.ts` with `SecretStorage` keys `repohangar.token.<host>`, session lookups without prompts and the `glab` / `gh` imports (execFile, argument array, 10 s, no shell); verify `test/integration/suite/providers/10-auth.test.ts` stores a `glab` token from a fake `glab` (`test/integration/fixtures/fake-cli.js` run through the CLI port, since `execFile` without a shell cannot run a script shim on Windows) and announces `Using your glab login for git.acme.com.`
- [x] 2.3 Record in design.md which `glab` releases need `glab auth status --show-token` (Open Question); verify by running both commands against `glab` 1.46 and the latest release
- [x] 2.4 Implement the sign-in flows and `repohangar.signIn`; `Sign-in matrix` (provider-auth) → `test/integration/suite/providers/20-signIn.test.ts`, one case per R1–R6 (VS Code session, token page and password input stubbed through the `AuthUi` port, `/user` answered by the HTTP fetch override)
- [x] 2.5 Implement `repohangar.signOut` and the rejected-credential handling; verify `20-signIn.test.ts` covers *Sign out of a GitLab host*, *Sign out of github.com* and *Revoked GitLab token*
- [x] 2.6 Implement host skipping; verify `20-signIn.test.ts` covers *Skipped GitLab host* (no request on the stub, no `glab` process)

## 3. Detection and status

- [x] 3.1 Implement `probe.ts`; `Probe matrix` (hosting-providers) → `test/contract/probe.test.ts`, one case per R1–R6, plus *Probe sends no credentials*
- [x] 3.2 Implement the `?` cell and the host choice; verify `test/ui/providers.spec.ts` covers *Choose GitLab for an unknown host* and *Host choice dismissed*, reading `repohangar.hosts` at user scope; verify `test/integration/suite/providers/30-reviewCommands.test.ts` covers *Host chosen in a workspace with its own hosts*
- [x] 3.3 Implement GitLab and GitHub query building and chunking; `Repository inclusion matrix` (hosting-providers) → `test/unit/reviewInclusion.test.ts`, one case per R1–R8; verify `test/contract/batching.test.ts` covers *Forty repositories on two hosts* (exactly 2 requests) and *Chunks of 50 aliases*
- [x] 3.4 Implement the reduced selection and the REST fallback; `Schema error matrix` (hosting-providers) → `test/contract/schemaErrors.test.ts`, one case per R1–R6, plus *REST answer not modified*
- [x] 3.5 Implement failure handling and back-off in `reviewQueue.ts`; `Failure matrix` (hosting-providers) → `test/contract/failures.test.ts`, one case per R1–R5 (fake clock), plus *Project not readable*
- [x] 3.6 Persist review states (D-4); `Cache matrix` (hosting-providers) → `test/unit/reviewCache.test.ts`, one case per R1–R5
- [x] 3.7 Implement the refresh triggers and focus gating (D-5); `Refresh trigger matrix` (hosting-providers) → `test/unit/reviewQueue.test.ts`, one case per R1–R10 (fake clock and focus port)
- [x] 3.8 Implement the GitLab version check; `GitLab version matrix` (hosting-providers) → `test/contract/version.test.ts`, one case per R1–R5

## 4. Dashboard, status bar and commands

- [x] 4.1 Implement `reviewCell.ts`; `Pipeline value matrix` → `test/unit/reviewCell.test.ts`, one case per R1–R11; `Approval value matrix` → the same file, one case per R1–R7; `Review cell matrix` → the same file, one case per R1–R6; `Mergeable value matrix` → the same file, one case per R1–R7 (all hosting-providers)
- [x] 4.2 Add the MR / PR column, the not-refreshed style and the `Sign in` / `?` / `…` / `—` states to the webview; verify `test/ui/grid.spec.ts` checks the header `Repository`, `Branch`, `Sync`, `Changes`, `Fetched`, `MR / PR` (dashboard *Column headers and row order*)
- [x] 4.3 Add the Has MR and Pipeline ✗ chips and keys `5` and `6`; `Review chip membership matrix` (dashboard) → `test/unit/chips.test.ts`, one case per R1–R6; `Grid key matrix` R23–R24 (dashboard) → `test/ui/keys.spec.ts`, one case each, and the removed R15 case deleted from that file
- [x] 4.4 Implement `o`, the reference click and `repohangar.mr.open`; `Open merge request matrix` (hosting-providers) → `test/unit/openReview.test.ts`, one case per R1–R8 (provider URL port); verify `test/ui/keys.spec.ts` checks the footer hint `o open MR` directly before `↑↓ move`
- [x] 4.5 Implement `repohangar.mr.copyLink` and **Copy link**; verify `test/integration/suite/providers/30-reviewCommands.test.ts` covers *Copy the link of an open merge request* and *Copy the link without a credential*
- [x] 4.6 Implement the compare page item and button; `Compare page matrix` (hosting-providers) → `test/unit/comparePage.test.ts`, one case per R1–R7
- [x] 4.7 Add the review lines to the row details; verify `test/ui/providers.spec.ts` covers *Row details of a pull request*
- [x] 4.8 Set `repohangar.hostedRoots`; verify `30-reviewCommands.test.ts` covers *Provider chosen for an unknown host* (within 1 s)
- [x] 4.9 Add the open review segment, tooltip line and label to the status bar; `Open review segment matrix` (status-bar) → `test/unit/statusBarText.test.ts`, one case per R1–R3; verify `test/unit/statusBarTooltip.test.ts` covers *Tooltip and label with open reviews*
- [x] 4.10 Implement the first-run hosts panel; `Host line matrix` (provider-auth) → `test/unit/firstRun.test.ts`, one case per R1–R6; verify `test/ui/providers.spec.ts` covers *First-run summary line* and *Panel shown once*, and `test/ui/restore.spec.ts` covers *Restored dashboard keeps its view*

## 5. Compatibility, performance and release notes

- [x] 5.1 Add the nightly GitLab CE 17.10.0 job (`gitlab/gitlab-ce:17.10.0-ce.0`, seeded project and MR) that runs the GitLab contract cases against the container instead of fixtures (`npm run test:nightly`, `test/nightly/`, `.github/workflows/nightly-gitlab.yml`); verify one manual run passes and the fixtures match the live answers
- [x] 5.2 Extend `test/integration/suite/perf/` (`reviewStatus.test.ts`) with 50 repositories over 2 stubbed hosts; verify the review status costs 2 requests and arrives in < 1.5 s (§11.2)
- [x] 5.3 Declare `repohangar.providers.refreshMinutes` (`3`, minimum `1`, maximum `60`) and the commands `repohangar.mr.open`, `repohangar.mr.copyLink`, `repohangar.signIn`, `repohangar.signOut`; verify `00-smoke.test.ts` reads the default and finds the commands
- [x] 5.4 Update the README (MR column, sign-in, tokens and scopes, what is sent to which host); run `npm run build`, `npm test`, the integration and UI suites and `openspec validate add-hosting-providers --strict`; all pass
- [x] 5.5 Add `Added` entries under `## Unreleased` in `CHANGELOG.md` (docs/versioning.md): the MR / PR column with pipeline and approvals, the Has MR and Pipeline ✗ chips, sign-in to GitLab and GitHub (VS Code account, `glab` / `gh` login, token), Open MR (`o`) and Copy link, the compare page, the status bar segment, and `repohangar.providers.refreshMinutes`; verify the entries start with `- **Added`
