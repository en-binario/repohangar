## 1. Pure logic

- [x] 1.1 Implement `saveDefaults.ts` (D-3); `Save as defaults matrix` (mr-profiles) → `test/unit/saveDefaults.test.ts`, one case per R1–R4, plus a policy-forced `squash` that is not saved
- [x] 1.2 Add the memory step to `profiles.resolve()` (D-4); `Memory in the resolution order matrix` (mr-profiles) → `test/unit/profiles.test.ts`, one case per R1–R3
- [x] 1.3 Implement profile name validation and the editing model's explicit and inherited values (D-2); `New profile name matrix` (mr-profiles) → `test/unit/profileEditorModel.test.ts`, one case per R1–R4

## 2. Profile editor

- [x] 2.1 Add the `webview/profiles.tsx` entry to `esbuild.mjs` and the `MR Profiles` panel with `repohangar.profiles.edit` and the `⚙` toolbar button (D-1); verify `test/ui/profileEditor.spec.ts` covers *Open the editor twice* and *Title preview*
- [x] 2.2 Implement Save through `WorkspaceConfiguration.update` (D-2); `Save scope matrix` (mr-profiles) → `test/integration/suite/main/140-profileEditor.test.ts`, one case per R1–R4, reading `inspect()` after each save; verify the same file covers *Round trip keeps comments* by comparing the user `settings.json` text before and after
- [x] 2.3 Implement profile and rule deletion with the confirmation; verify `test/ui/profileEditor.spec.ts` covers *Delete the default profile*
- [x] 2.4 Implement the external-change reload and banner; verify `140-profileEditor.test.ts` covers *External change with unsaved edits*
- [x] 2.5 Show the repository memory with **Forget**; verify `test/ui/profileEditor.spec.ts` covers *Forget a repository memory*

## 3. Drawer and first run

- [x] 3.1 Add **Save as defaults ▾** to the drawer; verify `test/ui/mrDrawer.spec.ts` runs R1–R3 of `Save as defaults matrix` end to end and checks the notifications
- [x] 3.2 Record and show recent reviewers and labels (D-5); `Recent reviewers matrix` (mr-profiles) → `test/unit/recent.test.ts`, one case per R1–R3
- [x] 3.3 Add the defaults line to the first-run panel; `Defaults line matrix` (mr-profiles) → `test/unit/firstRun.test.ts`, one case per R1–R2

## 4. Docs and release notes

- [x] 4.1 Update the README (profile editor, Save as defaults scopes, repository memory); run `npm run build`, `npm test`, the integration and UI suites and `openspec validate add-profile-editor --strict`; all pass
- [x] 4.2 Add `Added` entries under `## Unreleased` in `CHANGELOG.md`: the MR profile editor (`repohangar.profiles.edit`, `⚙`), Save as defaults (user, workspace, this repository), recent reviewers and labels; verify the entries start with `- **Added`
- [ ] 4.3 After archiving, edit the `## Purpose` non-goals of `openspec/specs/mr-profiles/spec.md` and `openspec/specs/mr-creation/spec.md` so they no longer list the profile editor, saving defaults, the repository memory and recent reviewers as "no capability yet"; verify `openspec validate --specs --strict` passes
