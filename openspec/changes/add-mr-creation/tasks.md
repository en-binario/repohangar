## 1. Push-options spike

- [x] 1.1 Run the spike of D-6 against `gitlab/gitlab-ce:17.10.0-ce.0` and record (a)–(d) in design.md; if a result contradicts `Push option matrix` or `GitLab path matrix` (mr-creation), update the delta with `/opsx:update` before task 6.1; verify the recorded `remote:` lines are saved as fixtures in `test/unit/fixtures/pushOptions/`

## 2. Profiles, rules and templates

- [x] 2.1 Implement `mr/profiles.ts` (D-1, D-2); `Profile value matrix` (mr-profiles) → `test/unit/profiles.test.ts`, one case per R1–R6; `Invalid extends matrix` → the same file, one case per R1–R2; `Resolution order matrix` → the same file, one case per R1–R4
- [x] 2.2 Implement `mr/rules.ts`; `Rule matrix` (mr-profiles) → `test/unit/rules.test.ts`, one case per R1–R6, plus a rule that names a missing profile
- [x] 2.3 Implement the squash policy with `projectInfo`; `Squash policy matrix` (mr-profiles) → `test/contract/squashPolicy.test.ts`, one case per R1–R6 (recorded `GET /projects/:id` answers)
- [x] 2.4 Implement `mr/templates.ts`; `Placeholder matrix` → `test/unit/templates.test.ts`, one case per R1–R11; `Title rendering matrix` → the same file, one case per R1–R5; `Single-commit title matrix` → the same file, one case per R1–R3; `Description template matrix` → the same file, one case per R1–R6 (memory file system); plus *Release branch missing* (all mr-profiles)
- [x] 2.5 Declare `repohangar.mr.profiles` (`{ "default": {} }`, with a JSON schema for the profile keys), `repohangar.mr.rules` (`[]`), `repohangar.mr.quickCreate` (`"direct"`), `repohangar.mr.ticketPattern`, `repohangar.mr.typeMap` and `repohangar.gitlab.usePushOptions` (`"whenNoToken"`); verify `00-smoke.test.ts` reads every default

## 3. Provider requests

- [x] 3.1 Add `projectInfo`, `currentUser`, `resolveUsers`, `createReview`, `closeReview`, `updateReviewers` and `searchUsers` to the GitLab and GitHub providers (D-4); `GitLab payload matrix` (mr-creation) → `test/contract/createGitlab.test.ts`, one case per R1–R2; `GitHub follow-up matrix` (mr-creation) → `test/contract/createGithub.test.ts`, one case per R1–R3
- [x] 3.2 Implement reviewer and assignee resolution; `Reviewer resolution matrix` (mr-creation) → `test/contract/reviewers.test.ts`, one case per R1–R9, plus *GitLab user IDs resolved once*
- [x] 3.3 Map create errors; `Create failure matrix` (mr-creation) → `test/contract/createFailures.test.ts`, one case per R1–R4; `Existing review matrix` (mr-creation) → `test/contract/existingReview.test.ts`, one case per R1–R3

## 4. Create flow

- [x] 4.1 Implement `mr/guards.ts`; `Guard matrix` (mr-creation) → `test/unit/mrGuards.test.ts`, one case per R1–R10; `GitLab path matrix` (mr-creation) → the same file, one case per R1–R6
- [x] 4.2 Implement `mr/create.ts` with push before create and the create job (D-5); `Push matrix` (mr-creation) → `test/integration/suite/providers/40-createMr.test.ts` (the providers session, whose fixture has GitLab and GitHub repositories) on real temp repositories with a bare remote and a stubbed provider, one case per R1–R5; verify the same file covers *One keystroke on an unpublished branch* (no quick input, no drawer, one create request with every field), *Sign in continues the creation* and *Create a branch from the target guard*
- [x] 4.3 Implement the result notification and `openAfterCreate`; `Result text matrix` (mr-creation) → `test/unit/mrResult.test.ts`, one case per R1–R3
- [x] 4.4 Implement Undo and the create job state; verify `40-createMr.test.ts` covers *Undo within 30 seconds* (branch refs unchanged), *Undo after 30 seconds* (fake clock) and *m pressed twice*
- [x] 4.5 Implement the entry points, keybindings and `repohangar.mr.quickCreate`; `Entry point matrix` (mr-creation) → `test/integration/suite/providers/42-mrEntryPoints.test.ts`, one case per R1–R8 (R6 with `"direct"` and `"confirm"`)

## 5. Dashboard and menus

- [x] 5.1 Implement the drawer (D-7); `Drawer actions matrix` (mr-creation) → `test/ui/mrDrawer.spec.ts`, one case per R1–R5, plus the squash policy note of `Squash policy matrix` R1 shown under the box
- [x] 5.2 Implement the quick create input; `Quick create item matrix` (mr-creation) → `test/integration/suite/providers/44-quickCreate.test.ts`, one case per R1–R6
- [ ] 5.3 Contribute the menu items (D-8) and `repohangar.hostedRootUris`; `Menu item visibility matrix` (mr-creation) → manual checklist in this file, one line per R1–R5, on Windows, macOS and Linux (`test/ui/mrMenus.spec.ts` checks R1–R5 on the platform it runs on)
  - [x] Windows 11, VS Code 1.141.0: R1 `scm/sourceControl` on `ledger` (gitlab) shows Create MR, Create MR…, Open MR
  - [x] Windows 11, VS Code 1.141.0: R2 `scm/sourceControl` on `web-shop` (github) shows them
  - [x] Windows 11, VS Code 1.141.0: R3 `scm/sourceControl` on `charts` (unknown) and `scratch` (none) hides them
  - [x] Windows 11, VS Code 1.141.0: R4 Explorer RepoHangar submenu on `backend/billing-api` (gitlab) shows them after Pull (ff)
  - [x] Windows 11, VS Code 1.141.0: R5 Explorer RepoHangar submenu on `tools/scratch` (none) hides them
  - [ ] macOS: R1–R5 (run `npx playwright test test/ui/mrMenus.spec.ts`)
  - [ ] Linux: R1–R5 (run `npx playwright test test/ui/mrMenus.spec.ts`)
- [x] 5.4 Add the `[Create MR]` cell button and the `⤴` hover button; `Create button matrix` (mr-creation) → `test/unit/reviewCell.test.ts`, one case per R1–R5
- [x] 5.5 Add `m` and `M` to the keys, footer and key help; verify `test/ui/keys.spec.ts` covers *Footer with merge request keys*

## 6. GitLab push options

- [x] 6.1 Implement `mr/pushOptions.ts`; `Push option matrix` (mr-creation) → `test/unit/pushOptions.test.ts`, one case per R1–R12, and the `remote:` parsing against the spike fixtures
- [x] 6.2 Wire the push-options path and the not-live review state; verify `test/integration/suite/providers/46-pushOptions.test.ts` covers *Push-options result* (a bare remote with a `pre-receive` hook that prints GitLab's `remote:` lines) and *Push rejected for authentication*
- [x] 6.3 Implement **Connect `<host>`**; verify `test/contract/reviewersAfterConnect.test.ts` covers *Add the reviewers after connecting*
- [x] 6.4 Add the push-options cases to the nightly GitLab CE 17.10.0 job: creation without a token with every option of the matrix, and reading the result back through the API; verify one manual run passes

## 7. Docs and release notes

- [x] 7.1 Update the README (MR profiles with the §7.1 example, rules, placeholders, `m` / `M` / `Ctrl+Alt+M`, push options and what they cannot set); run `npm run build`, `npm test`, the integration and UI suites and `openspec validate add-mr-creation --strict`; all pass
- [x] 7.2 Add `Added` entries under `## Unreleased` in `CHANGELOG.md` (docs/versioning.md): MR profiles and rules, create with defaults (`m`, `Ctrl+Alt+M`) with Undo, the Create MR drawer (`M`, `Ctrl+Alt+Shift+M`) and quick input, the menu items, GitLab push options without a token, and the six settings; verify the entries start with `- **Added`

## 8. Revision: the Create MR drawer by default (2026-10-15)

`repohangar.mr.quickCreate` gets the value `"drawer"`, now the default: the triggers of create with defaults, including
**[Create MR]** in the MR / PR cell, open the pre-filled drawer; `"direct"` keeps the creation with no dialog. Revised in
place because `mr-creation` is not archived yet (docs/openspec.md §5).

- [x] 8.1 Route `createWithDefaults` by `repohangar.mr.quickCreate` (`"drawer"` → `openDrawer`, `"confirm"` → the quick input, `"direct"` → create), send `createMr` from the **[Create MR]** cell and remove the `createMrDirect` row action; declare `"drawer"` (with enum descriptions) and the default `"drawer"` in `package.json`; verify `npm run typecheck`
- [x] 8.2 `Entry point matrix` (mr-creation) → `test/integration/suite/providers/42-mrEntryPoints.test.ts`: R6 with `"direct"`, and new cases for R9–R12; `startCreating` pins `"direct"` for the creation flows under test; `00-smoke.test.ts` reads the default `"drawer"`
- [x] 8.3 README (create with defaults, the setting row) and CHANGELOG (`Added` for the value `"drawer"`, `Changed` for the default); run `npm test`, the integration suite, the MR Playwright specs and `openspec validate add-mr-creation --strict`; all pass
