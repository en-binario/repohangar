## Why

Many teams merge as soon as the pipeline is green and the reviews are in. RepoHangar does not merge (D21), but it can
ask the provider to: GitLab's auto-merge and GitHub's `enablePullRequestAutoMerge` let the profile's `autoMerge` value
finish the job without anyone watching the pipeline (PROPOSAL.md §7.6, goal G4). GitHub also has no "delete source
branch" field on a pull request, so a profile's `deleteSourceBranch` does nothing there today unless the repository's
own setting is on.

Roadmap phase: **3. Batch and profiles UX** (§13), last slice: auto-merge on both providers and GitHub delete-after-merge
handling. It implements the `autoMerge` rows of §6.6 and §7.6, the auto-merge step of §7.7, the Auto-merge line of W3,
the **Auto-merge** box of W4 and W9, Appendix B (auto-merge, delete branch after merge) and decision D7.

**Depends on: `add-mr-creation`** (create flow, push options, profiles and the drawer), **`add-hosting-providers`**
(review states, the GitLab version check, row details) **and `add-profile-editor`** (the editor that gets the
**Auto-merge** box).

## What Changes

- **`autoMerge`** becomes a profile key (built-in `false`), with an **Auto-merge** box in the drawer, the quick input
  detail and the profile editor.
- **GitLab**: after the create request, `PUT /projects/:id/merge_requests/:iid/merge` with
  `merge_when_pipeline_succeeds: true` on GitLab 17.10, `auto_merge: true` from 17.11 (version from
  `/api/v4/version`); on the push-options path, `-o merge_request.merge_when_pipeline_succeeds` or
  `-o merge_request.auto_merge`.
- **GitHub**: `enablePullRequestAutoMerge` with the merge method from `squash` and the repository's allowed methods;
  the box is hidden when the repository does not allow auto-merge.
- A draft never gets auto-merge; a refused auto-merge keeps the merge request and says why.
- **GitHub delete after merge** (D7): with `deleteSourceBranch` set explicitly and the repository's
  `delete_branch_on_merge` off, RepoHangar remembers the pull request and, when a refresh sees it merged with no newer
  commits on the branch, deletes the remote branch (`DELETE /repos/{o}/{r}/git/refs/heads/{branch}`) and says so. The
  row details show `After merge  RepoHangar deletes feature/ABC-12-notes`.
- Row details gain the **Auto-merge** line (`squash`, `merge`, `rebase` or `on`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mr-profiles`: adds the `autoMerge` key and the auto-merge and merge-method policy checks.
- `mr-creation`: adds enabling auto-merge after creation and on the push-options path, the drawer and quick input
  values, and the result text.
- `hosting-providers`: adds GitHub delete-after-merge and the auto-merge and after-merge lines of the row details.

All three are created by changes that are not archived yet, so these are ADDED requirements.

## Impact

- **Code**: `enableAutoMerge` and `deleteBranch` in `src/providers/gitlab.ts` and `github.ts`, `src/mr/autoMerge.ts`
  (method choice, no `vscode`), `src/providers/afterMerge.ts` (pending deletions), the review query gains merged-state
  aliases for pending pull requests; drawer and editor boxes.
- **State**: `workspaceState` `repohangar.mr.pendingDeletes`.
- **Network**: one auto-merge request per created review with `autoMerge`; one `DELETE` per merged pull request with a
  pending deletion. No extra status request: pending pull requests ride in the host's review request.
- **Public surface**: the profile key `autoMerge`. CHANGELOG `Added` entries.
