## Context

`add-mr-creation` creates reviews (API and push options) and reads `projectInfo` (GitHub's `allow_auto_merge`,
`allow_*_merge` and `delete_branch_on_merge` are already in its cached answer). `add-hosting-providers` reads the GitLab
version per host and sends one GraphQL review request per host and chunk. `add-profile-editor` owns the editor and
Save as defaults. See proposal.md for the scope.

## Goals / Non-Goals

**Goals:**
- Auto-merge costs one request after the create request, and nothing on refresh.
- Delete-after-merge costs no request until a pull request is merged, and never deletes a branch that moved.

**Non-Goals:**
- Merging from the dashboard (D21) and turning auto-merge off from RepoHangar: the provider's page does both.
- Deleting local branches after merge: no capability does.
- Delete-after-merge for pull requests RepoHangar did not create.

## Decisions

### D-1. Method choice

`mr/autoMerge.ts` (pure) implements `Auto-merge and merge method policy` (mr-profiles): `squash: true` → `SQUASH`
when allowed, else `MERGE`, else `REBASE`; `squash: false` → `MERGE`, else `REBASE`, else `SQUASH`. GitLab has no method
choice at this step: squash is a field of the merge request (`add-mr-creation`), so auto-merge is on or off.

### D-2. GitLab parameter by version

`merge_when_pipeline_succeeds` is deprecated from GitLab 17.11 in favour of `auto_merge`; 17.10 (the minimum, D20)
only knows the first. The version comes from `add-hosting-providers`' version check (cached per session); an
unreadable version uses the 17.10 name, which 17.11+ still accepts while deprecated. `sha` makes GitLab refuse the
request if the branch moved between create and enable.

### D-3. Pending deletions ride in the review request

`workspaceState` `repohangar.mr.pendingDeletes` = `[{ host, owner, name, number, branch, createdAt }]`. `github.ts`
adds, per pending entry of the host, an alias
`pN: repository(owner:, name:) { pullRequest(number:) { state merged mergeCommit { oid } headRefOid headRef { target { oid } } } }`
to the same GraphQL request as the status aliases, inside the 50-alias chunks, so `Forty repositories on two hosts`
still costs 2 requests. `headRef` is `null` once the branch is gone (R4). When merged and `headRef.target.oid ==
headRefOid`, `DELETE /repos/{o}/{r}/git/refs/heads/{branch}` runs; otherwise the branch is kept and the entry dropped.

Hosts without any status alias in a refresh (every repository moved away from GitHub branches) still get their
pending aliases in a request on the next trigger for that host; `repohangar.refresh` always includes them.

### D-4. "Explicitly set" for `deleteSourceBranch`

`profiles.resolve()` already tracks where each value comes from (built-in, profile, rule, memory, edit) for the
editor's inherited display (`add-profile-editor` D-2). Delete-after-merge requires a source other than built-in, so the
default `true` keeps GitLab's `remove_source_branch` behaviour without making RepoHangar delete GitHub branches nobody
asked it to.

## Risks / Trade-offs

- [§12 asks for a confirmation before deleting a branch] → this deletion is the GitHub equivalent of GitLab's
  `remove_source_branch`, opted into per profile (D7, §7.6), only after the merge, only when the branch did not move,
  and announced afterwards; the remote branch can be restored from GitHub's pull request page.
- [GitHub refuses auto-merge on a pull request that is already mergeable with no required checks (`clean status`)] →
  reported in the result (R5); the user can merge on GitHub.
- [The deprecated GitLab parameter disappears in a later major version] → chosen by version from 17.11.

## Migration Plan

None. Existing profiles without `autoMerge` resolve to `false`.
