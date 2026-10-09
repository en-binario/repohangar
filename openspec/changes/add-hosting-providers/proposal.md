## Why

The dashboard shows every repository's Git state, but not the question people ask next: *does this branch already have
a merge request, and is its pipeline green?* Today that means opening the browser, finding the project and finding the
MR, once per repository (PROPOSAL.md §2.1, goals G1 and G5). Every merge request feature of phase 2 also needs to know
which host a repository lives on, how to authenticate to it and what review already exists for the branch.

Roadmap phase: **2. Providers and MRs** (§13), first slice: GitLab and GitHub providers, sign-in flows, batched
status, the MR column and the row details. It implements §6.1–§6.4, §11.1 (provider triggers), §12 (tokens), W1 (the
`!5` segment), W2 (MR / PR column, Has MR and Pipeline ✗ chips), W3 (review lines), W10, the provider half of Appendix B,
and decisions D4, D5, D13 and D20. Merge request creation, including GitLab push options, follows in `add-mr-creation`.

Acceptance criterion of the phase covered here: **the MR column for 40 repositories on 2 hosts costs ≤ 2 requests.**

## What Changes

- **Provider detection, completed** (§6.2): a host that static detection leaves `unknown` is probed once
  (`GET /api/v4/version`, then `GET /api/v3/meta`) and the answer is cached; when the probe finds nothing, the MR cell
  offers **This host is GitLab** / **This host is GitHub**, which writes `repohangar.hosts`.
- **Sign-in** (§6.3, D5): github.com through VS Code's GitHub account (`repo` scope, zero steps when already signed
  in); GitHub Enterprise through VS Code's `github-enterprise` account, `gh auth token`, or a pasted token; GitLab
  through a token in `SecretStorage` per host, imported from `glab` when it is logged in, or pasted after RepoHangar
  opens the token page with name and scope pre-filled. **RepoHangar: Sign In to Host…** and **Sign Out of Host…**. A
  first-run panel (W10) lists the hosts and their state once.
- **Batched review status** (§6.4, D4): one GraphQL request per host for every repository on it, split into chunks of 50
  aliases; a schema error drops the missing fields and retries; GitLab without the fields falls back to REST, 4 at a
  time with ETags. Results are cached by repository, branch and head SHA in `workspaceState`, so the dashboard opens
  with the last values marked as not refreshed.
- **Refresh model** (§11.1): HEAD changes, pushes, window focus after 60 s, a timer every
  `repohangar.providers.refreshMinutes` (default `3`) while a pipeline runs and the window is focused, and
  **RepoHangar: Refresh**. No provider request while the window is unfocused.
- **MR / PR column** (W2): `!142 Draft ⟳ running`, `#311 ✗ failed changes requested`, `auto ⇢`, `Sign in`, `?`; a
  click or `o` opens the MR; the **Has MR** (`5`) and **Pipeline ✗** (`6`) chips.
- **Row details** (W3): the merge request line, the pipeline line, and **Open MR**, **Copy link** and **Compare with
  `<target>`**; the `⋯` item **Open compare page**.
- **Commands**: `repohangar.mr.open`, `repohangar.mr.copyLink`, `repohangar.signIn`, `repohangar.signOut`; the context
  key `repohangar.hostedRoots` for the menus of `add-mr-creation`.
- **Status bar** (W1): `$(git-pull-request)5` when 5 repositories have an open merge request or pull request.
- A one-time warning per host for GitLab older than 17.10.0 (D20); no block.

## Capabilities

### New Capabilities

- `hosting-providers`: the unknown-host probe and host choice, batched review status with its chunking, schema-error
  and REST fallbacks, caching and refresh triggers, the MR / PR cell and chips, review lines in row details, Open MR,
  Copy link, the compare page, the hosted-roots context key, the open-MR status bar segment, and the GitLab version
  warning.
- `provider-auth`: GitHub and GitHub Enterprise sessions, GitLab tokens in `SecretStorage`, the `glab` and `gh`
  imports, the token prompt, sign-in from the MR cell, sign out, rejected tokens, the first-run hosts panel, and what
  never happens with a token.

### Modified Capabilities

- `dashboard`: `Grid columns` gains the **MR / PR** column; `Filters` gains the **Has MR** and **Pipeline ✗** chips;
  `Keyboard navigation` makes `5` and `6` toggle them.
- `status-bar`: `Status bar summary text` gains the open merge request segment.

## Impact

- **Code**: new `src/providers/` modules (`provider.ts`, `gitlab.ts`, `github.ts`, `http.ts`, `auth.ts`, `probe.ts`,
  `reviewQueue.ts`) next to the existing `detect.ts`; `ReviewState` in `src/shared/model.ts`; the store persists review
  states; webview MR column, chips, row detail lines and first-run panel; `src/ui/statusBar.ts`.
- **Dependencies**: `msw` (dev) for provider contract tests in a new `test/contract/` folder with recorded fixtures. No
  runtime dependency: requests use the extension host's `fetch`, which follows VS Code's proxy and certificate
  settings.
- **Settings** (Appendix A): `repohangar.providers.refreshMinutes`. `repohangar.hosts` (existing) is now also written by
  the host choice.
- **Public surface**: commands `repohangar.mr.open`, `repohangar.mr.copyLink`, `repohangar.signIn`,
  `repohangar.signOut`; dashboard key `o` and chip keys `5`, `6`; context key `repohangar.hostedRoots`;
  `SecretStorage` entries `repohangar.token.<host>`. CHANGELOG `Added` entries.
- **Network**: first requests RepoHangar makes to GitLab and GitHub; `repo` (GitHub) and `api` (GitLab) scopes.
