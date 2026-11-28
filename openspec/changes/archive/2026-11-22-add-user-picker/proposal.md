## Why

Reviewers and assignees are GitLab or GitHub usernames, and nobody remembers them. Jhon Tapia is
`jtapia` on `git.acme.com`, but the drawer only accepts what is typed. A guess such as `@jtapia`,
`jhon.tapia` or `Jhon Tapia` ends in `Reviewer … not found on <host>.` after the merge request already exists. The
`@` and case slips are fixed (`9c76cc7`), but people still have to know the exact username.

The drawer already sends a debounced search (`drawerSearchUsers`), but its answer only fills an HTML `<datalist>`:

- it lists bare usernames, so you cannot see who `jtapia2` is, and on GitHub the search matches logins only, never
  names;
- the Reviewers and Assignees fields share one list, and an answer for older text can replace a newer one;
- choosing a suggestion only fills the text box, and Enter is still needed to add the chip;
- VS Code webviews show `<datalist>` popups unreliably, with no keyboard highlight and no `Esc` handling;
- a failed search, a missing sign-in and an empty result all look the same: no list.

The MR profile editor offers no search at all: its Reviewers and Assignees fields are free text.

Roadmap phase: **3. Batch and profiles UX** (§13), a follow-up to W4 (drawer **Reviewers** and **Assignees**, "an add
field that suggests users"), W9 (profile editor fields), §7.3 and Appendix B (users).

**Depends on: `add-mr-creation`** (the drawer, `searchUsers`, `mr-creation`) **and `add-profile-editor`** (the
profile editor, `mr-profiles`). Both are unarchived, so the deltas use `ADDED` only. Archive both before this change.

## What Changes

- **A user picker in the Reviewers and Assignees fields** of the Create MR drawer. Typing shows a list under the field,
  up to 10 entries such as `Jhon Tapia  @jtapia`, matching the display name or the username. `↑` `↓`
  move the highlight, Enter or a click adds the highlighted username as a chip and clears the field, and `Esc` closes the
  list without closing the drawer. Enter with nothing highlighted still adds the typed text (`@` dropped), so
  `team:<slug>` and unlisted names keep working.
- **States of the list**: `Searching…`, `No users on <host> match "<text>".`,
  `Sign in to <host> to search users.` and `User search failed: <message>`. Users already in the field are left out.
  An answer for text that is no longer in the field is ignored. Each field has its own list.
- **Search requests**: GitLab keeps `GET /projects/<id>/members/all?query=<text>&per_page=20`, now also reading `name`
  and leaving out users whose `state` is not `active`. GitHub moves from `GET /repos/<o>/<r>/assignees`, which only
  allows a local match on logins, to the GraphQL `repository.assignableUsers(query:, first: 10)`, which matches login
  and name.
- **The same picker in the MR profile editor.** Its Reviewers and Assignees fields search one hosted repository, chosen
  in a new **Search users in** list. The list defaults to the focused dashboard row's repository when it is hosted, else
  the first hosted repository by name. Without a hosted repository the fields stay free text, with the note
  `Add a GitLab or GitHub repository to search users.`
- Labels stay free text with the `recent:` line, as today.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mr-creation` (created by `add-mr-creation`, not archived): adds **Find users in the Reviewers and Assignees fields**
  (list states, keyboard and pointer selection, the provider requests). The **Create MR drawer** requirement keeps its
  text. Its constraint naming the GitHub `assignees` endpoint changes, so this change revises that one constraint in
  place in `add-mr-creation/specs/mr-creation/spec.md` (and the matching line of its design), the same way
  `fix-dashboard-and-review-status` revised `explorer-reveal`.
- `mr-profiles` (created by `add-mr-creation`, extended by `add-profile-editor`, not archived): adds **Find users in the
  profile editor** (the **Search users in** list and its default).

## Impact

- **Extension host**: `src/providers/provider.ts` (`searchUsers` returns `{ username, name }` entries),
  `src/providers/gitlab.ts` (reads `name` and `state`), `src/providers/github.ts` (GraphQL `assignableUsers`),
  `src/mr/service.ts` (search per field, no-credential and failure answers, the text the answer belongs to),
  `src/mr/profileEditor.ts` and its port (hosted repositories, the focused row, search).
- **Protocol**: `drawerSearchUsers` gains `field`; `drawerUsers` carries `field`, `text`, a `state` and the user
  entries. The profile editor gets `profilesSearchUsers` / `profilesUsers` and the **Search users in** choices in its
  state. Every new field is validated in `src/shared/protocol.ts` and `src/shared/profileEditor.ts`.
- **Webview**: a `UserPicker` list in `webview/Drawer.tsx`, used by `Chips` for `reviewers` and `assignees`, and in
  `webview/ProfileEditor.tsx`. The `<datalist>` is removed. Styles in `webview/styles.css`.
- **No new settings, commands or keybindings.** No request is sent for Labels, for text that starts with `team:`, or for
  an empty field.
- **Tests**: unit tests for the list state and the key handling; contract tests for the GitLab and GitHub search
  requests (`test/contract`); Playwright tests for the drawer and the profile editor (`test/ui`).
- **Docs**: README (drawer and profile editor), CHANGELOG `## Unreleased` (`Added` for the picker in both places,
  `Changed` for GitHub matching names).
