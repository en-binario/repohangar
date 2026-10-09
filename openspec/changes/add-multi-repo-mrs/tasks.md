## 1. Batch flow

- [x] 1.1 Add the batch flag to the single-repository flow (D-1); `Selection result matrix` (mr-creation) → `test/unit/mrBatchResult.test.ts`, one case per R1–R10 (flow with stubbed provider and Git ports, asserting the job result and the line text)
- [x] 1.2 Add the `createMr` batch kind, `m` on a selection, the toolbar button and `repohangar.mr.create` with a selection (D-4); verify `test/integration/suite/main/130-multiMr.test.ts` covers *Three linked merge requests in two keystrokes* (3 temp repositories with bare remotes, stubbed GitLab and GitHub servers counting requests) and *Confirmation before a selection*

## 2. Related links

- [x] 2.1 Implement `mr/related.ts` (D-2); `Related placeholder matrix` (mr-profiles) → `test/unit/related.test.ts`, one case per R1–R3; `Related links matrix` (mr-creation) → the same file, one case per R1–R5
- [x] 2.2 Add `updateDescription` to both providers and the update step (D-3); verify `test/contract/relatedUpdate.test.ts` sends one `PUT` (GitLab) and one `PATCH` (GitHub) per review and covers *Description update fails*

## 3. Result panel

- [x] 3.1 Add the merge request lines, **Open ↗** and **Copy all links** to the result panel; verify `test/ui/batchResult.spec.ts` covers *Copy all links*
- [x] 3.2 Extend the batch summary; `Merge request summary matrix` (mr-creation) → `test/unit/batchSummary.test.ts`, one case per R1–R3
- [x] 3.3 Implement **Retry failed** for merge requests; verify `130-multiMr.test.ts` covers *Retry after a failed push* (the bare remote of `infra-charts` rejects the first push)

## 4. Docs and release notes

- [x] 4.1 Update the README (multi-repository merge requests and related links); run `npm run build`, `npm test`, the integration and UI suites and `openspec validate add-multi-repo-mrs --strict`; all pass
- [x] 4.2 Add an `Added` entry under `## Unreleased` in `CHANGELOG.md`: merge requests for a selection with related links and the result panel; verify it starts with `- **Added`
- [ ] 4.3 After archiving, edit the `## Purpose` non-goals of `openspec/specs/mr-creation/spec.md` so they no longer list merge requests for several repositories as "no capability yet"; verify `openspec validate --specs --strict` passes
