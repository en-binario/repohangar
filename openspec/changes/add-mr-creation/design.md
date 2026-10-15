## Context

`add-hosting-providers` provides the provider interface with review states, credentials per host, `http.ts`, the
review queue and `repohangar.hostedRoots`. `add-git-operations` provides the job runner, the push and publish calls
through the Git API, the active repository resolution and the row's job state. `add-git-graph-and-explorer` provides
the Explorer **RepoHangar** submenu. See proposal.md for the scope; the specs `mr-profiles` and `mr-creation` hold the
rules.

## Goals / Non-Goals

**Goals:**
- `m` costs one key and at most: one review request, the push, one create request (GitLab) or one create plus three
  parallel follow-ups (GitHub), with cached project information and user IDs (target < 2 s plus the push, §11.2).
- Profile resolution, rules, templates and the guard order as pure functions (`src/mr/*.ts` without `vscode`), each
  spec matrix a table-driven test.

**Non-Goals:**
- Writing settings: this change only reads `repohangar.mr.*`. `add-profile-editor` writes them.
- Auto-merge and the GitHub merge method: `add-auto-merge`.
- Several repositories per `m`: `add-multi-repo-mrs`.

## Decisions

### D-1. Module layout

| Module | Holds | `vscode` import |
|---|---|---|
| `mr/profiles.ts` | Built-in defaults, scope merge from `inspect()` values, `extends` chains and cycle detection, resolution order | No |
| `mr/rules.ts` | Glob matching (`picomatch`-style, own 40-line matcher: `*`, `**`, `?`), first match | No |
| `mr/templates.ts` | Placeholders, title clean-up, single-commit rule, repository template lookup through the `FileSystemPort` | No |
| `mr/guards.ts` | The guard order of `Create guards` and `GitLab path matrix` as one function over a state snapshot | No |
| `mr/pushOptions.ts` | Building the `-o` arguments and parsing `remote:` lines | No |
| `mr/create.ts` | The flow: review check → guards → push → create → follow-ups → result → Undo timer | Yes |
| `ui/quickInputs.ts` | Quick create input | Yes |

*Alternative for globs:* add `picomatch` as a runtime dependency — rejected for 40 lines of matcher with the two
features the rules need; the test matrix pins the behaviour.

### D-2. Settings scopes

`workspace.getConfiguration('repohangar.mr').inspect('profiles')` gives `globalValue` and `workspaceValue` (and
`workspaceFolderValue`, which is treated as workspace scope). VS Code's own `get()` merges object settings shallowly by
top-level key, which would drop the user's keys of a profile the workspace also defines; `profiles.ts` merges per
profile and per key instead (spec `MR profile settings`).

### D-3. Commits ahead and remote branches

`git rev-list --count refs/remotes/<remote>/<target>..HEAD` and `git log --format=%s --reverse
refs/remotes/<remote>/<target>..HEAD` run through `src/git/process.ts` (local fast path, §5.3). `{latestRelease}` and
the drawer's target list come from `repository.getRefs({ pattern: 'refs/remotes/<remote>/' })` (local
`git for-each-ref`), version-sorted with a natural compare (`release/2.10` > `release/2.9`). The Git extension no longer
fills the deprecated `repository.state.refs` (VS Code 1.141), so the `[Create MR]` cell reads the target commit from the
git dir (`readRef`: the loose ref, else `packed-refs`) and runs `rev-list` only when HEAD or that commit moved. No fetch runs before creating; the review request already costs one round trip, and a
stale remote-tracking ref can only make "commits ahead" larger, never hide work.

### D-4. Provider additions

`HostingProvider` gains `projectInfo(projectPath)` (cached 1 h in memory: GitLab `default_branch`, `squash_option`;
GitHub `default_branch`, `allow_squash_merge`, `allow_auto_merge`, `delete_branch_on_merge` for `add-auto-merge`),
`currentUser()` (cached per session), `resolveUsers(names)` (GitLab IDs in `globalState`
`repohangar.gitlab.userIds.<host>`), `createReview(resolved)`, `updateReviewers(ref, ids)` (push-options follow-up),
`closeReview(ref)` and `searchUsers(projectPath, text)`.

GitLab reviewer-limit errors are recognised by status `400` / `422` with a message containing `reviewer` or
`assignee` and `one`/`1`; the host is then stored in `globalState` `repohangar.gitlab.singleReviewer.<host>`. GitHub
duplicate pull requests are recognised by `422` with `A pull request already exists`.

### D-5. The create job

Creation runs as a job of the row (`git-operations` `One job per repository at a time`), with the Sync cell showing
`⟳ creating MR` while it runs, so `m` pressed twice creates once. The Undo timer is a 30 s timestamp kept with the
notification; VS Code cannot remove a notification button, so a late click gets the `Undo is no longer available…`
answer (spec `Undo`).

### D-6. Push-options path and the spike

The Git API's `push()` takes no push options, so `pushOptions.ts` builds the argument list and `src/git/process.ts`
runs `git push --set-upstream <remote> <branch> -o …` with `GIT_TERMINAL_PROMPT=0` and the fetch timeout. Git forbids
line feeds in push options, so a multi-line description is left out and reported (spec R5). The MR URL is the first
`https://…/-/merge_requests/<iid>` in a `remote:` line. The created MR is stored as a review state with a `live: false`
flag, which the cell renders with the tooltip of the spec.

**Spike (task 1.1), before any other task of this group:** against `gitlab/gitlab-ce:17.10.0-ce.0`, push a branch
with every option of the `Push option matrix` and record (a) which options take effect, (b) the exact `remote:` lines for
a new and for an existing merge request, (c) whether `merge_request.assign` accepts a username, and (d) what a push
with nothing new prints. If a result differs from the spec, stop and change the spec with `/opsx:update` before
implementing.

**Spike results** (2026-10-09, `gitlab/gitlab-ce:17.10.0-ce.0`, Git over HTTP, no API token involved):

- (a) Every option of the matrix takes effect in one push: target, title, one-line description, `draft` (title becomes
  `Draft: …`), both labels (created on the fly), `squash` and `remove_source_branch` (`force_remove_source_branch`).
- (b) A new and an existing merge request print the same lines, `remote: View merge request for <branch>:` then
  `remote:   <URL>`; a second push with the same options creates no duplicate. Fixtures:
  `test/unit/fixtures/pushOptions/new-merge-request.txt`, `existing-merge-request.txt`.
- (c) `merge_request.assign` accepts a username, but only for a project member; for anyone else GitLab assigns the pusher
  without a message. RepoHangar cannot read the assignee back without a token, so the result does not report it.
- (d) A push with nothing new prints only `Everything up-to-date` (`nothing-new.txt`) and creates nothing, as the
  `GitLab path matrix` R6 assumes. A line feed in an option makes Git refuse the push before it reaches the server
  (`fatal: push options must not have new line characters`), as `Push option matrix` R5 assumes.

No result contradicts the spec.

**Create requests on CE 17.10.0** (observed while implementing tasks 3.1–3.3, same container, with an API token):

- Two `reviewer_ids` or `assignee_ids` on Free: the merge request is created with the first of each and no error; the
  answer lists only that one. `Reviewer resolution matrix` R5 (read back from the answer) is the path CE takes; the
  `400` retry of R6 stays for instances that reject the request instead.
- A second create for the same source branch: `409` with
  `["Another open merge request already exists for this source branch: !4"]`, handled as `Existing review matrix` R2.
- A `target_branch` that does not exist on the remote: CE creates the merge request anyway (no `422`), so
  `Create failure matrix` R2 is exercised against the recorded answer in the contract test only.
- The nightly job (`test/nightly/pushOptions.test.ts`) repeats the push-options creation with every option of the
  matrix, reads the merge request back through the API and adds a reviewer with the Connect `PUT`.

### D-7. Webview drawer

The drawer is a Preact component on the right of the grid (grid width shrinks, rows stay focusable). The host sends a
`drawer` message with the resolved values, the profile list, the target list, notes and guard warnings; the view
sends `drawerChange` (profile or target changed, so the host resolves again and returns values, keeping the fields the
view marks as edited), `drawerSearchUsers` (debounced 300 ms), `drawerCreate` with the field values, and
`drawerClose`. The host validates every message (dashboard `Webview safety`) and renders all values as text.

### D-8. Menus and keys

```jsonc
"scm/sourceControl": [
  { "command": "repohangar.scm.mr.create",     "group": "0_repohangar_mr@1", "when": "scmProvider == git && scmProviderRootUri in repohangar.hostedRootUris" },
  { "command": "repohangar.scm.mr.createEdit", "group": "0_repohangar_mr@2", "when": "scmProvider == git && scmProviderRootUri in repohangar.hostedRootUris" },
  { "command": "repohangar.scm.mr.open",       "group": "0_repohangar_mr@3", "when": "scmProvider == git && scmProviderRootUri in repohangar.hostedRootUris" }
],
"repohangar.explorer": [
  { "command": "repohangar.explorer.mr.create",     "group": "2_repohangar_mr@1", "when": "resourcePath in repohangar.hostedRoots" },
  { "command": "repohangar.explorer.mr.createEdit", "group": "2_repohangar_mr@2", "when": "resourcePath in repohangar.hostedRoots" },
  { "command": "repohangar.explorer.mr.open",       "group": "2_repohangar_mr@3", "when": "resourcePath in repohangar.hostedRoots" }
]
```

The `scm.` and `explorer.` commands run `repohangar.mr.create`, `repohangar.mr.createEdit` and `repohangar.mr.open`
with the menu's argument; they exist only to carry the menu titles (`Create MR`, `Create MR…`, `Open MR`) and are hidden
from the Command Palette. The `[Create MR]` cell, `m` and the hover button send the row action `createMr`, which does
what `repohangar.mr.quickCreate` says (`Entry point matrix`); `M` sends `createMrEdit`. The cell's former
`createMrDirect` action (always create, whatever the setting) was removed when the default became `"drawer"`
(revision of 2026-10-15, tasks §8): a one-click creation from the grid is what the drawer default is
meant to stop.

`scmProviderRootUri` is a URI string, so `repohangar.hostedRoots` is published twice: as `fsPath` strings for the
Explorer and as `rootUri.toString()` strings under `repohangar.hostedRootUris` for the SCM menu (task 5.3 verifies the
form `when` clauses compare). Keybindings: `ctrl+alt+m` / mac `ctrl+cmd+m` and `ctrl+alt+shift+m` / mac
`ctrl+cmd+shift+m` (D11).

## Risks / Trade-offs

- [A one-keystroke MR is created by mistake] → the default `repohangar.mr.quickCreate: "drawer"` shows every value
  before anything is sent; with `"direct"`, Undo for 30 s and the `draft` profile key (§16.1).
- [GitLab's reviewer-limit error text changes] → the read-back of applied reviewers still reports the difference; the
  retry only shortens the list.
- [The push-options path bypasses VS Code's askpass] → it only runs without a token or with `"always"`; an
  authentication failure shows the Git output and **Connect `<host>`** (§6.6).
- [Stale remote-tracking refs] → "commits ahead" can be too high, never too low; the provider's own validation answers
  `No commits between…`, reported by `Create failures` R3.

## Migration Plan

New settings only. `repohangar.mr.profiles` defaults to `{ "default": {} }`, which resolves to the built-in values.

## Open Questions

- The `remote:` output for an existing merge request on the push-options path: recorded by the spike (task 1.1). The
  spec's result text is the same for both cases, so the answer does not change it.
