## 1. Branch plans

- [ ] 1.1 Implement `suggestBranches` in `src/git/branchBatch.ts` (D-2); `Suggestion matrix` (batch-operations) → `test/unit/branchBatch.test.ts`, one case per R1–R3
- [ ] 1.2 Implement `switchPlan`; `Switch eligibility matrix` (batch-operations) → `test/unit/branchBatch.test.ts`, one case per R1–R11
- [ ] 1.3 Implement `createPlan`; `Create eligibility matrix` (batch-operations) → `test/unit/branchBatch.test.ts`, one case per R1–R5
- [ ] 1.4 Add `fastPaths.stashPush` (D-3); verify `test/integration/suite/main/120-branchBatch.test.ts` stashes 3 changed files (untracked included) in a temp repository and leaves the stash list with one entry named `RepoHangar: before switching to feature/ABC-12-notes`

## 2. Jobs and commands

- [ ] 2.1 Add the `switch` and `createBranch` job kinds with parameters (D-1); verify `120-branchBatch.test.ts` runs the switch on real temp repositories for R6, R8, R9 and R11 of `Switch eligibility matrix` and asserts HEAD, upstream and working tree
- [ ] 2.2 Implement `repohangar.switchBranch`, `repohangar.createBranch`, the quick picks and the branch name validation (D-4, D-5); `Branch batch target matrix` (batch-operations) → `test/integration/suite/main/122-branchTargets.test.ts`, one case per R1–R8; verify the same file covers *Create from the switch quick pick*, *Dirty choice dismissed* and *Invalid branch name*
- [ ] 2.3 Extend the batch summary; `Batch summary matrix` (batch-operations) → `test/unit/batchSummary.test.ts`, one case per R1–R6

## 3. Keys

- [ ] 3.1 Route `b` with a selection and `n` (git-operations `Row action keys`); verify `test/ui/keys.spec.ts` covers *Push key with rows selected*, *Switch key with no row selected* and *n with no row selected*, and the footer hint `n branch`

## 4. Result panel

- [ ] 4.1 Implement the result panel in the webview and the protocol messages (D-6); verify `test/ui/batchResult.spec.ts` covers *Pull all result panel* (line order and buttons)
- [ ] 4.2 Implement the fix buttons; `Fix button matrix` (batch-operations) → `test/integration/suite/main/124-fixButtons.test.ts`, one case per R1–R8, on temp repositories with a bare remote
- [ ] 4.3 Implement **Retry failed**; verify `124-fixButtons.test.ts` covers *Retry a failed fetch* (the bare remote made unreachable, then restored)

## 5. Docs and release notes

- [ ] 5.1 Update the README (switch and create across repositories, the result panel) and the key help; run `npm run build`, `npm test`, the integration and UI suites and `openspec validate add-multi-repo-branches --strict`; all pass
- [ ] 5.2 Add entries under `## Unreleased` in `CHANGELOG.md` (docs/versioning.md): `Added` for switch and create across repositories, `n`, the toolbar buttons and the result panel with fix buttons and Retry failed; `Changed` for `b` on a selection; verify the kinds with the `changelog-entry` skill
- [ ] 5.3 After archiving, edit the `## Purpose` non-goals of `openspec/specs/batch-operations/spec.md` and `openspec/specs/git-operations/spec.md` so they no longer say "no capability yet" for these features; verify `openspec validate --specs --strict` passes
