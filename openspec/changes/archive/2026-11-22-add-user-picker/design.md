## Context

What exists today (see proposal.md for the problems):

- `webview/Drawer.tsx` `Chips` renders the chips, a text input and, when the drawer has suggestions, a `<datalist>`.
  Enter adds the trimmed text (with `userName()` from `src/mr/users.ts` for Reviewers and Assignees). Every keystroke
  posts `drawerSearchUsers { id, text }`, for Labels too. `webview/App.tsx` holds a single `drawerUsers: string[]`
  that both user fields receive.
- `MrService.drawerSearchUsers` (`src/mr/service.ts`) debounces with **one** timer for both fields, returns nothing
  when the host has no credential, logs failures at debug level only, and posts `drawerUsers { id, users }` with up to
  10 usernames.
- `HostingProvider.searchUsers(projectPath, text, credential): Promise<string[]>`. GitLab calls
  `members/all?query=&per_page=20` and keeps `username`. GitHub fetches `/repos/<o>/<r>/assignees?per_page=100` and
  filters logins locally, so names never match and a repository with more than 100 assignable users loses the rest.
- `webview/ProfileEditor.tsx` reuses `Chips` with `suggestions={[]}`. `ProfileEditor` (`src/mr/profileEditor.ts`)
  knows the focused row only as `{ repo, branch }` through `ProfileEditorPort.focused()` (wired in `src/extension.ts`),
  and has no access to the repository store or the providers.
- Both webviews validate every incoming message against a shape table (`src/shared/protocol.ts`,
  `src/shared/profileEditor.ts`). The webview is a pure view, and logic modules import nothing from `vscode`.

## Goals / Non-Goals

**Goals:**
- One search path for the drawer and the profile editor: same text rules, same provider calls, same answer states.
- The view never shows an answer for text the field no longer holds, without request ids or cancellation.
- Keyboard-first selection that leaves `Esc` and `Ctrl+Enter` working for the drawer.

**Non-Goals:**
- Avatars. Avatar URLs on a private GitLab need the token, and the webview CSP allows no remote images.
- Searching labels or GitHub teams (`team:<slug>` stays free text).
- Caching answers between keystrokes or sessions. Each answer is a fresh request. The 300 ms debounce keeps typing to a
  few requests.
- Showing display names in the chips. Chips and settings keep usernames, which is what the APIs and the profiles store.
- Checking at save time that typed names exist. Unknown names are still reported after creation (`notFoundNotice`).

## Decisions

### D-1. One `UserSearch` in the extension host, keyed by surface and field

`src/mr/userSearch.ts` (no `vscode` import) owns the debounce and the answer:
`search(key, repoId, field, text, post)`. `key` is `drawer:<field>` or `profiles:<field>`, and one timer runs per key,
so typing in Reviewers no longer cancels the Assignees search. After 300 ms it:

1. computes the search text with `searchText(text)` from `src/mr/users.ts`: trimmed, one leading `@` dropped,
   `undefined` when empty or starting with `team:`. In that case it posts nothing;
2. resolves the repository's provider and host and reads the credential, through a port that `MrService` and
   `ProfileEditor` both get from `src/extension.ts`. With no credential it answers `signedOut`;
3. calls `provider.searchUsers` and answers `users`, or `failed` with the `HttpError` message (GitHub GraphQL errors
   through `graphqlMessage`, as the review status logs them).

The webview uses the same `searchText()` to decide whether to show `Searching…` and post at all, so view and host
cannot disagree about which texts search. The host checks again, because the view is not trusted.

*Alternatives:* debouncing in the view would keep timers out of the host, but the drawer's existing debounce is in the
host and tested there, and a view-side debounce would still need the host-side check. One `UserSearch` per webview was
rejected: it would duplicate the provider and credential lookup.

### D-2. The answer carries its field and text, and the view filters it

The protocol changes:

- `drawerSearchUsers { id, field: 'reviewers' | 'assignees', text }` and
  `profilesSearchUsers { repo, field, text }`, with `field` validated as an enum and `text` as today (≤ 256).
- `drawerUsers { id, field, text, state: 'users' | 'signedOut' | 'failed', users: { username, name }[], host, message }`,
  and the same shape as `profilesUsers` without `id`. `text` is the search text after `searchText()`.

The view keeps `{ text, answer }` per field and renders an answer only when `answer.text === searchText(field text)`.
An answer for `jho` that arrives after the user typed `jhon` is dropped (spec *Answer for older text*). The view
keeps one answer per field, so an older answer arriving *after* the newer one would replace it. `UserSearch` therefore
also remembers the latest text per key and posts only the answer for that text. The view's own
"posted but no matching answer yet" state renders `Searching…`. Request ids and `AbortController` would also work, but
text equality needs no extra state in the host, and an aborted GitLab request still counts against its rate limit.

Filtering out users already in the field happens in the view, because the view owns the chips being edited.

### D-3. Provider requests

`searchUsers(projectPath, text, credential): Promise<UserMatch[]>` with `UserMatch = { username: string; name: string }`
(`name` empty when unknown).

- **GitLab**: unchanged endpoint, `members/all?query=<text>&per_page=20`. It now reads `name` and `state`, keeps
  `state === 'active'` (blocked and deactivated users cannot be reviewers), then takes the first 10. `query` matches
  name and username on GitLab 17.10. `GET /projects/:id/users?search=` was considered: it lists the same people, but
  `members/all` already has recorded fixtures and includes inherited and invited-group members explicitly.
- **GitHub**: one GraphQL request to the provider's `graphqlUrl` (`api.github.com/graphql` or `<origin>/api/graphql`
  on GHE): `query($owner,$name,$q){ repository(owner:$owner,name:$name){ assignableUsers(query:$q, first:10){ nodes {
  login name } } } }`, with `splitProject()` for owner and name. It matches login and name on the server, with no
  100-user ceiling. REST `/search/users` was rejected: it searches all of GitHub, not the people who can be assigned
  to the repository, and allows 30 requests per minute.

### D-4. A `UserPicker` combobox replaces the `<datalist>`

`webview/UserPicker.tsx` renders the input as an ARIA combobox (`role="combobox"`, `aria-expanded`,
`aria-controls`, `aria-activedescendant`) with a `role="listbox"` of `role="option"` entries below it, and a
non-option status line for `Searching…`, `No users on <host> match "<text>".`, `Sign in to <host> to search users.`
and `User search failed: <message>.`. `Chips` uses it for `reviewers` and `assignees`. Labels keep the plain input.

Keys: `↓` / `↑` move the highlight and wrap, Enter adds the highlighted username, or the typed text (via `userName()`)
when nothing is highlighted, and `Esc` closes the list and calls `stopPropagation()` so the drawer's `Esc` handler
does not close the drawer. With the list closed, `Esc` bubbles as before. `Ctrl+Enter` is not handled by the picker,
so it still reaches the drawer's create handler. Entries use `onMouseDown` + `preventDefault()` so the click adds the
user before the input's `blur` closes the list. `blur` closes the list and keeps the text.

The entry text is two spans, the name and a dimmed `@username`, rendered as text (never HTML), in line with dashboard
*Webview safety*.

`<datalist>` was dropped rather than kept as a fallback. It cannot show a name next to the username or a status line,
and Electron's popup ignores the webview's theme.

### D-5. Profile editor wiring

`ProfileEditorPort` gains `hostedRepos(): { id, name, host }[]` (store rows whose provider is `gitlab` or `github`,
sorted by name), `focusedId(): string | undefined`, and the `UserSearch` from D-1. The editor's state message gets
`searchRepos` and `searchDefault` (spec `mr-profiles` *Search users in default matrix*). The view keeps the chosen
repository in component state only, so nothing is written to settings. **Search users in** is a `<select>` above
**Reviewers**. With no hosted repository, the view shows the note and passes `search={undefined}` to `Chips`, which
then renders the plain input.

`searchDefault` is computed when the state is posted (open, Reload, external settings change). A focus change in the
dashboard while the editor is open does not move the user's choice.

## Risks / Trade-offs

- [GitHub `assignableUsers` lists people who can be assigned. On some repositories a reviewer only needs read access,
  so a valid reviewer can be missing from the list] → Enter with nothing highlighted, or Enter after `Esc`, still adds
  the typed name, and an unknown name is still reported after creation.
- [GitLab `members/all` with `per_page=20` can return 20 users of whom fewer than 10 are active, so active matches
  beyond the first page are missed] → typing more characters narrows the query, and the limit keeps one request per
  search.
- [The first entry is highlighted, so Enter picks it even when the user meant the exact text typed] → R5/R6 of the
  selection matrix: while `Searching…` or with no match, Enter adds the text. With a match the list shows it, and
  `Esc`, then Enter adds the text.
- [`Esc` behaviour now depends on whether the list is open] → the selection matrix rows R7 and R8 pin both cases, and
  Playwright covers them.

## Migration Plan

None. The protocol and the provider method are internal (docs/versioning.md §1). No setting or stored data changes.
Rollback is a revert.
