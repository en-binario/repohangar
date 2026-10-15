## 1. Provider search

- [ ] 1.1 Change `searchUsers` to return `UserMatch[]` (`{ username, name }`) in `src/providers/provider.ts`. GitLab (`src/providers/gitlab.ts`) reads `name` and `state`, keeps `active` users and takes the first 10. GitHub (`src/providers/github.ts`) sends the GraphQL `assignableUsers(query:, first: 10)` request to `graphqlUrl` and maps `login` and `name` (design D-3). Verify `npm run typecheck`
- [ ] 1.2 `User search request matrix` (mr-creation: Find users in the Reviewers and Assignees fields) → contract tests with msw in `test/contract/userSearch.test.ts`, one case per R1–R3, asserting the request URL or GraphQL query and variables, and the entries returned

## 2. Search in the extension host

- [ ] 2.1 Add `searchText()` to `src/mr/users.ts` (trimmed, one leading `@` dropped, `undefined` when empty or starting with `team:`), with Vitest cases in `test/unit/users.test.ts` for `''`, `'@'`, `' @jhon '`, `'team:sre'` and `'jhon'`
- [ ] 2.2 Add `src/mr/userSearch.ts` (no `vscode` import): one 300 ms timer per key, the `searchText()` check, the credential check (`signedOut`), the provider call (`users`) and the error message (`failed`), answering `{ field, text, state, users, host, message }` (design D-1). Replace `MrService.drawerSearchUsers` / `searchUsers` with it, and wire the port in `src/extension.ts`. Verify `npm run typecheck`
- [ ] 2.3 Protocol: `drawerSearchUsers` gains `field` (enum `reviewers` | `assignees`), and `drawerUsers` carries the answer of 2.2 (`src/shared/protocol.ts`, `src/ui/dashboard.ts`). Add `profilesSearchUsers { repo, field, text }`, `profilesUsers`, and `searchRepos` / `searchDefault` in the editor state (`src/shared/profileEditor.ts`). Add `test/unit/protocol.test.ts` cases that reject a missing or unknown `field` and an extra key

## 3. The picker in the drawer

- [ ] 3.1 Add `webview/UserPicker.tsx`: the combobox and listbox with the status lines, wrap-around `↑` `↓`, Enter, `Esc` with `stopPropagation()` only while open, `onMouseDown` entries and close on `blur` (design D-4). Add a pure `pickerList(fieldText, chips, answer)` that returns the status line or the entries, leaving out users already in the field and dropping an answer whose `text` differs from `searchText(fieldText)`. Use the picker in `Chips` for `reviewers` and `assignees`, post `drawerSearchUsers` with `field` only when `searchText()` is defined, keep one answer per field in `webview/App.tsx`, remove the `<datalist>`, and style the list in `webview/styles.css` with theme variables
- [ ] 3.2 `User search list matrix` (mr-creation: Find users in the Reviewers and Assignees fields) → Vitest in `test/unit/userSearch.test.ts`, with fake timers, `UserSearch` and a fake provider and credential port, feeding the answer into `pickerList()`. One case per R1–R10, asserting the requests sent (none, or one after 300 ms with its `query`) and the list lines
- [ ] 3.3 *Answer for older text* (mr-creation) → a case in `test/unit/userSearch.test.ts`: answers for `jho` and `jhon` delivered out of order, `pickerList()` shows `Searching…` and then only the `jhon` entries
- [ ] 3.4 `User selection matrix` (mr-creation: Find users in the Reviewers and Assignees fields) → Playwright cases in `test/ui/mrDrawer.spec.ts`, one per R1–R10, with the provider stub answering `members/all?query=jhon` with `jtapiap` and `jruiz` (and `query=jdoe` with `[]`, delayed for R5). Assert the chips, the field text, the list's presence and whether the drawer is open. For R9, assert the create request's `reviewer_ids` hold no ID for the typed text

## 4. The picker in the profile editor

- [ ] 4.1 `ProfileEditorPort` gains `hostedRepos()`, `focusedId()` and the `UserSearch` of 2.2 (`src/mr/profileEditor.ts`, `src/extension.ts`). Add a pure `searchDefault(focusedId, hostedRepos)`. Handle `profilesSearchUsers` and post `profilesUsers`. In `webview/ProfileEditor.tsx`, add **Search users in** (a `<select>` above **Reviewers**, kept in component state), the note `Add a GitLab or GitHub repository to search users.` when there is no hosted repository, and the picker in Reviewers and Assignees (design D-5). Verify `npm run typecheck`
- [ ] 4.2 `Search users in default matrix` (mr-profiles: Find users in the profile editor) → Vitest `it.each` over `searchDefault` in `test/unit/profileEditorModel.test.ts`, one case per R1–R4. Add a Playwright case in `test/ui/profileEditor.spec.ts` for R4 (no hosted repository: the note is shown and no search request reaches the stub)
- [ ] 4.3 *Pick a reviewer for a profile* and *Change the repository searched* (mr-profiles) → Playwright cases in `test/ui/profileEditor.spec.ts`. The first asserts that the chip is added, the profile is marked unsaved, the settings file is unchanged before **Save**, and `repohangar.mr.profiles.default.reviewers` contains `jtapiap` after it. The second asserts one GraphQL `assignableUsers` request for `acme/web-shop` and no request to `git.acme.com`

## 5. Docs and release notes

- [ ] 5.1 README: the drawer paragraph (type a name or username in **Reviewers** or **Assignees** and pick from the list) and the profile editor paragraph (**Search users in**)
- [ ] 5.2 Add entries under `## Unreleased` in `CHANGELOG.md` (docs/versioning.md): `Added` (R6) for the user picker in the Create MR drawer and in the MR profile editor (with **Search users in**), and `Changed` (R9) for GitHub user suggestions matching names as well as logins. Verify each starts with `- **Added` or `- **Changed`
- [ ] 5.3 Run `npm run typecheck`, `npm test`, `npx playwright test test/ui/mrDrawer.spec.ts test/ui/profileEditor.spec.ts` and `openspec validate add-user-picker --strict`; all pass
