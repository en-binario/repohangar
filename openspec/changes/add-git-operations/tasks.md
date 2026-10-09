## 1. Pure decisions

- [x] 1.1 Implement `src/git/guards.ts`; `Push matrix` (git-operations) → `test/unit/pushGuard.test.ts`, one case per R1–R10
- [x] 1.2 `Pull matrix` (git-operations) → `test/unit/pullGuard.test.ts`, one case per R1–R4
- [x] 1.3 Implement `src/git/ffEligibility.ts` (D-5, distinct dirty paths); `Pull (ff) eligibility matrix` (batch-operations) → `test/unit/ffEligibility.test.ts`, one case per R1–R12
- [x] 1.4 Implement batch target resolution; `Batch target matrix` (batch-operations) → `test/unit/batchTargets.test.ts`, one case per R1–R7, including the toolbar labels
- [x] 1.5 Implement `src/jobs/summary.ts`; `Batch summary matrix` (batch-operations) → `test/unit/batchSummary.test.ts`, one case per R1–R4
- [x] 1.6 Implement the job text of the Sync cell in `src/shared/format.ts`; `Job state matrix` (git-operations) → `test/unit/jobState.test.ts`, one case per R1–R6
- [x] 1.7 Implement the more-actions menu model; `Menu item state matrix` (git-operations) → `test/unit/rowMenu.test.ts`, one case per R1–R3
- [x] 1.8 Implement `src/git/activeRepository.ts` (D-7); `Active repository matrix` (git-operations) → `test/unit/activeRepository.test.ts`, one case per R1–R7

## 2. Runner and Git operations

- [x] 2.1 Implement `src/jobs/runner.ts` (D-4: pool, per-repository lock, timeout, cancellation, idempotence) with `RowStore.setJob` and the `job` field of `RowData` (D-2); verify `test/unit/runner.test.ts` with fake timers: never more than N running, a second request on a locked repository makes no call, a timeout records `failed: timed out after 5 s`, cancel records `skipped: canceled` for repositories not started, and a Fetch all on the same set within 10 s makes no call
- [x] 2.2 Implement `src/git/operations.ts` for every action of the row action matrix; `Row action matrix` (git-operations) → `test/integration/suite/main/72-rowActions.test.ts`, one case per R1–R13 on fixture repositories (spied `Repository` methods, `git.*` commands run with the repository, a terminal named after the repository with the root as `cwd`, the clipboard text)
- [x] 2.3 Verify `72-rowActions.test.ts` covers *Fetch a repository without a remote* (`scratch`), *Fetch pressed twice* and *Fetch from the Source Control Repositories menu* (`repohangar.fetch` with the `SourceControl` argument)
- [x] 2.4 Implement Pull (ff) on real repositories (status refresh, `git merge --ff-only @{u}` through `runGit`); verify `test/integration/suite/main/74-batch.test.ts` runs Pull all (ff) on the fixture and records R7 `dirty (n files)` for `billing-api`, R9 `diverged (↑1 ↓1)` for `notifications`, R11 `fast-forwarded 2 commits` for `ledger`, R6 `detached HEAD` for `detached` and R2 `rebase in progress` for `rebasing`, with HEAD and working tree of every skipped repository unchanged
- [x] 2.5 Verify `74-batch.test.ts` covers *Concurrency limit* (`repohangar.concurrency` = 2, at most 2 unfinished fetches), *Fetch timeout* (a remote on a local TCP port that accepts and never answers, `repohangar.fetchTimeoutSeconds` = 5), *Cancel a batch* (through the runner's cancellation token), *Fetch all twice in a row*, and *Pull (ff) on a dirty repository* (`repohangar.pullFf`)

## 3. Commands, notifications and menus

- [x] 3.1 Register `repohangar.fetch`, `repohangar.fetchAll`, `repohangar.pullFf`, `repohangar.pullAllFf`, the `scm/sourceControl` item **Fetch** (`scmProvider == git`), the progress notification with `Cancel`, single-row notifications with `Show Git Output`, and the behind notification with `Pull`; verify the commands and the menu item are declared in `package.json` (integration smoke test)
- [x] 3.2 Declare `repohangar.concurrency` (`6`, `1`–`32`) and `repohangar.fetchTimeoutSeconds` (`60`, `5`–`600`) in `contributes.configuration`; verify `00-smoke.test.ts` reads both defaults
- [x] 3.3 Extend `src/shared/protocol.ts` with `runAction` and `runBatch` (D-3); verify `test/unit/protocol.test.ts` accepts them and rejects an unknown action, a non-string id and a non-array `ids`, and that the host ignores ids that are not listed repositories

## 4. Webview

- [x] 4.1 Add the toolbar batch buttons, the hover buttons, the `⋯` menu (D-6), the job badge in the Sync cell, and the keys `f` `F` `p` `P` `b` `t` `.`; verify `test/ui/actions.spec.ts` covers *Publish tooltip on an unpublished branch*, *Menu by keyboard*, *Push key with rows selected* and, with Playwright clicking the VS Code dialogs, *Discard canceled in VS Code's confirmation*, *Pull from the behind notification* and *Fetch fails* (`billing-api`, whose remote host does not exist, shows `Fetch failed in billing-api: …` with `Show Git Output`)
- [x] 4.2 Update the footer and the key help (dashboard `Keyboard navigation`); verify `test/ui/keys.spec.ts` still passes one case per R1–R22 of `Grid key matrix` and add the case *Footer with action keys*, and that the key help lists `f`, `F`, `p`, `P`, `b`, `t` and `.`

## 5. Release notes

- [x] 5.1 Run `npm run build`, `npm test`, the integration and UI suites, and `openspec validate add-git-operations --strict`; all pass
- [x] 5.2 Add `Added` entries under `## Unreleased` in `CHANGELOG.md` (docs/versioning.md R6, `changelog-entry` skill): the row actions and their keys, hover buttons and `⋯` menu, Fetch all and Pull all (ff), `repohangar.fetch`, `repohangar.pullFf`, the Source Control **Fetch** item, and the two settings; verify the entries start with `- **Added`
