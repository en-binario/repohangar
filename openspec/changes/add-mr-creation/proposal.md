## Why

Creating a merge request takes a trip to the browser, the same reviewers typed again, and the squash and delete-branch
boxes ticked by hand, and people forget to (PROPOSAL.md §2.1). Teams already agree on these values; RepoHangar should
hold them once, as **MR profiles**, and create a complete merge request or pull request in one keystroke (goals G4 and
G5, design principles 1–3).

Roadmap phase: **2. Providers and MRs** (§13), second and last slice: MR profiles, rules and templates; create with
defaults (`m`, `Ctrl+Alt+M`), the drawer (`M`) and the quick input; guards; the result notification with Undo; the
Source Control and Explorer menu items; the push-options spike and the sign-in-free GitLab path. It implements §6.6,
§7.1, §7.2 (without the per-repo memory, which comes with `add-profile-editor`), §7.4–§7.7, §10.1–§10.3 for the MR
commands and keys, W4, W5, W6, the MR items of §8.1, W1 and §9.4, Appendix B (create, users, close), and decisions D6,
D7 (delete source branch on GitLab), D8, D19 and D21. Push options are part of this change, not a change of their own,
because they replace the sign-in guard for GitLab hosts without a token, and both rules have to be read together.

Acceptance criteria of the phase covered here: **`m` on an unpublished branch pushes and creates a complete MR
(reviewers, labels, squash, delete branch) with no dialog; an existing MR opens instead of a duplicate; the squash
policy is enforced.**

**Depends on: `add-hosting-providers`** (provider interface, review states, credentials, `repohangar.mr.open`,
`repohangar.hostedRoots`) **and `add-git-graph-and-explorer`** (the Explorer **RepoHangar** submenu that gets the MR
items).

## What Changes

- **MR profiles** (§7.1, D6): `repohangar.mr.profiles` holds named profiles (`target`, `reviewers`, `assignees`,
  `labels`, `squash`, `deleteSourceBranch`, `draft`, `title`, `description`, `pushIfNeeded`, `openAfterCreate`,
  `extends`); `repohangar.mr.rules` picks a profile per repository and branch, first match wins, with an optional `set`.
  Values resolve in the order built-in defaults → `default` → the rule's profile → the rule's `set` → the form → the
  project's squash policy (§7.2).
- **Templates** (§7.4): `{branch}`, `{type}`, `{ticket}`, `{branchTitle}`, `{firstCommit}`, `{commits}`, `{repo}`,
  `{defaultBranch}`, `{latestRelease}`, `{me}`; the single-commit rule; `template:default` and `template:<name>` read
  the repository's own template from the working tree. Settings `repohangar.mr.ticketPattern` and `repohangar.mr.typeMap`.
- **Create with defaults** (§7.7, D8): `m`, the **[Create MR]** button in the MR / PR cell, the `⤴` hover button,
  `repohangar.mr.create` (`Ctrl+Alt+M`, `Ctrl+Cmd+M` on macOS), and **Create MR** in the Source Control Repositories
  menu and the Explorer **RepoHangar** submenu. It checks for an existing review first and opens it instead, runs the
  guards, pushes or publishes when needed, creates the MR or PR with every resolved value, and shows
  `Created !142 in billing-api (pushed 2 commits): …` with **Open MR**, **Copy link** and **Undo** (30 s, closes it).
- **`repohangar.mr.quickCreate`** (default `"direct"`): `"confirm"` shows one quick input (W5) before creating.
- **Create MR drawer** (W4): `M`, `repohangar.mr.createEdit` (`Ctrl+Alt+Shift+M`), **Create MR…** in both menus; every
  field pre-filled, user suggestions, `Ctrl+Enter` creates.
- **Reviewers and assignees** (§7.5): usernames resolved to GitLab user IDs once per host; `@me`; the author removed
  from reviewers; `team:<slug>` for GitHub; unknown users reported without blocking; GitLab Free's single reviewer and
  assignee read back and reported.
- **GitLab push options** (§6.6, D19): without a GitLab token, `m` still creates the merge request during the push
  (`git push -o merge_request.create …`), with every value except reviewers and a multi-line description; the result
  offers **Connect git.acme.com** to add the reviewers with one request. `repohangar.gitlab.usePushOptions` (default
  `"whenNoToken"`, or `"always"`, `"never"`). A spike against GitLab CE 17.10.0 comes first and confirms the options.
- **Squash and delete source branch** (§7.6): sent on create on GitLab; GitLab's `squash_option` forces the value
  (`never`, `always`). GitHub keeps both for auto-merge and delete-after-merge (`add-auto-merge`).

## Capabilities

### New Capabilities

- `mr-profiles`: profile settings and `extends`, rules, the resolution order, the squash policy check, templates and
  placeholders, repository templates, and the ticket and type settings.
- `mr-creation`: the create entry points and quick-create mode, existing-review detection, guards, push before create,
  the GitLab and GitHub create requests, reviewer and assignee resolution, the result notification, `openAfterCreate`,
  Undo, GitLab push options, the drawer, the quick input, the **[Create MR]** cell button, the menu items and the
  `m` / `M` keys.

### Modified Capabilities

None. The MR / PR cell (`hosting-providers`) and the Explorer submenu (`explorer-open-in-git-graph`) are not archived
yet; this change adds to them through requirements of `mr-creation`.

## Impact

- **Code**: `src/mr/profiles.ts`, `templates.ts`, `rules.ts` (no `vscode` import), `src/mr/create.ts`, `guards.ts`;
  `createReview`, `closeReview`, `projectInfo`, `currentUser` and `searchUsers` in `src/providers/gitlab.ts` and
  `github.ts`; webview drawer, `[Create MR]` button and `⤴` hover button; `src/ui/quickInputs.ts`.
- **Settings** (Appendix A): `repohangar.mr.profiles`, `repohangar.mr.rules`, `repohangar.mr.quickCreate`,
  `repohangar.mr.ticketPattern`, `repohangar.mr.typeMap`, `repohangar.gitlab.usePushOptions`.
- **Public surface**: commands `repohangar.mr.create`, `repohangar.mr.createEdit`; keybindings `Ctrl+Alt+M` /
  `Ctrl+Cmd+M` and `Ctrl+Alt+Shift+M` / `Ctrl+Cmd+Shift+M`; dashboard keys `m`, `M`; `scm/sourceControl` and
  `repohangar.explorer` menu items; `globalState` caches of GitLab user IDs and single-reviewer hosts. CHANGELOG `Added`
  entries.
- **Git**: on the push-options path RepoHangar runs `git push` itself (execFile, no shell, `GIT_TERMINAL_PROMPT=0`),
  with the system credential helper or SSH agent instead of VS Code's askpass (§6.6).
- **Network**: `POST` requests that create merge requests and pull requests, and `PUT` / `PATCH` requests that close
  them on Undo.
