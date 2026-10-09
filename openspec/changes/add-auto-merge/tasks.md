## 1. Profiles and policy

- [ ] 1.1 Add `autoMerge` to the profile keys, the JSON schema of `repohangar.mr.profiles`, Save as defaults and the editor box; verify `test/unit/profiles.test.ts` covers *Auto-merge from a hotfix profile*
- [ ] 1.2 Implement `mr/autoMerge.ts` (D-1); `Auto-merge policy matrix` (mr-profiles) → `test/unit/autoMerge.test.ts`, one case per R1–R9

## 2. Enabling auto-merge

- [ ] 2.1 Add `enableAutoMerge` to both providers (D-2); `Auto-merge request matrix` (mr-creation) → `test/contract/autoMerge.test.ts`, one case per R1–R6
- [ ] 2.2 Add the auto-merge push option; `Auto-merge push option matrix` (mr-creation) → `test/unit/pushOptions.test.ts`, one case per R1–R3
- [ ] 2.3 Add the box to the drawer and the detail to the quick input; verify `test/ui/mrDrawer.spec.ts` covers *Draft turns off auto-merge in the drawer* and `110-createMr.test.ts` covers *Undo after auto-merge*
- [ ] 2.4 Add `merge_when_pipeline_succeeds` (API and push option) to the nightly GitLab CE 17.10.0 job; verify one manual run shows auto-merge set on the created merge request

## 3. GitHub delete after merge

- [ ] 3.1 Remember pull requests at creation (D-4); verify `test/unit/pendingDeletes.test.ts` covers *Repository deletes branches itself* and a built-in `deleteSourceBranch` that is not remembered
- [ ] 3.2 Add the pending aliases to the review request (D-3); `Delete after merge matrix` (hosting-providers) → `test/contract/afterMerge.test.ts`, one case per R1–R6; verify `test/contract/batching.test.ts` still counts 2 requests in *Forty repositories on two hosts* with 3 pending entries
- [ ] 3.3 Add the row detail lines; `Row details line matrix` (hosting-providers) → `test/unit/reviewCell.test.ts`, one case per R1–R4

## 4. Docs and release notes

- [ ] 4.1 Update the README (auto-merge on GitLab and GitHub, delete after merge on GitHub and when it is skipped); run `npm run build`, `npm test`, the integration and UI suites and `openspec validate add-auto-merge --strict`; all pass
- [ ] 4.2 Add `Added` entries under `## Unreleased` in `CHANGELOG.md`: auto-merge from the MR profile on GitLab and GitHub, and deleting merged GitHub branches; verify the entries start with `- **Added`
- [ ] 4.3 After archiving, edit the `## Purpose` non-goals of `openspec/specs/mr-creation/spec.md` so they no longer list auto-merge and deleting a GitHub branch after merge as "no capability yet"; verify `openspec validate --specs --strict` passes
