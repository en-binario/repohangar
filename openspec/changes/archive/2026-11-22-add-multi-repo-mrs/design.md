## Context

`add-mr-creation` creates one review per call (`mr/create.ts`: review check → guards → push → create → result).
`add-multi-repo-branches` gives the job runner batch parameters, the result panel (`batchResult` messages), fix
buttons and **Retry failed**. This change composes the two. See proposal.md for the scope.

## Goals / Non-Goals

**Goals:**
- One code path for creating a review: the selection batch calls the single-repository flow with a "batch" flag that
  turns its notifications into job results.
- Related links written after every creation finished, so each description lists the final set.

**Non-Goals:**
- One drawer for several repositories: `M` stays single-repository.
- Linking reviews created in different batches, other than replacing the section of a review that takes part again.

## Decisions

### D-1. Batch flag on the single-repository flow

`createReviewFlow(repo, { batch: true })` returns a `JobResult` (`ok: created !142, pushed 2`, `ok: already existed`,
`skipped: <reason>`, `failed: <message>`) plus the review reference, instead of showing notifications, opening the
browser (`openAfterCreate` is ignored in a batch) or offering Undo. The guard notifications map to skip reasons with
the same words in lower case (`You're on main.` → `skipped: on main`). The batch kind `createMr` goes through the job
runner, so concurrency, cancel and the row's job state (`⟳ creating MR`) come for free.

### D-2. Related-links section

`mr/related.ts` (no `vscode`) builds the section and merges it into a description:

```text
<!-- repohangar:related -->
Related:
- ledger !143 https://git.acme.com/payments/ledger/-/merge_requests/143
- web-shop #311 https://github.com/acme/web-shop/pull/311
<!-- /repohangar:related -->
```

At creation, `{related}` renders as the two markers with nothing between them, so the place is kept; otherwise the
section is appended. HTML comments are hidden by both GitLab and GitHub Markdown. For an existing review, its current
description is read from the review request answer (GitLab `description`, GitHub `body` — both added to the review
check's single-repository query, not to the batched status query) and the markers are replaced in place.

### D-3. Update requests after the batch

When all jobs have results, one `updateDescription` per eligible review runs through the pool, in parallel across
hosts. A failure of one update is recorded on that line (`related links not added: 403`) and does not change its `ok`
result. **Retry failed** re-runs D-1 for the failed repositories and then D-3 for every eligible review of the batch.

### D-4. Selection in the command

`repohangar.mr.create` without an argument checks whether the dashboard panel is active and has a selection
(`viewState`); if so it runs the batch, else the active-repository flow. `Ctrl+Alt+M` from an editor therefore never
acts on a selection the user cannot see.

## Risks / Trade-offs

- [Overwriting a description edited by hand between creation and the link update] → the update reads the description
  returned by the create request, replaces only the marked section, and runs seconds later; an existing review's
  description is read in the same batch.
- [Mixed hosts and one without a credential] → those reviews get no links and their line says why (R5, R9).
- [A large selection creates many reviews by accident] → `"confirm"` mode shows the full list first; each review can
  still be closed from its line's **Open ↗** page.

## Migration Plan

None. No setting is added.
