## Context

What exists today (see proposal.md for the problems):

- `webview/layout.ts` `layout(rows, grouping, collapsed, filter, chips)` filters the rows, sorts them by
  `compareNames(a.name, b.name)` (`src/shared/format.ts`), groups them and emits `GridItem`s: a group header
  `{ kind: 'group', name, count, collapsed }` followed by its rows unless collapsed. `count` already is "rows of the
  group that match the filter and chips", also when collapsed, but the member rows of a collapsed group are dropped.
- `webview/App.tsx` keeps the selection in `PersistedView.selected` (webview state, restored after a reload) and posts
  `setSelection` to the host on every change. `toggleSelected(id)` is the only way rows enter or leave the selection,
  besides `Ctrl+A` (shown rows) and `Esc` (clear). The group header is a single `gridcell` with `aria-colspan={7}`;
  a click on it toggles collapse, and `Space` on a focused header does nothing.
- The column headers are plain `<span role="columnheader">` texts; the selection column header is an empty span.
- The Group menu choice and the collapsed groups live in workspace state through `src/ui/viewState.ts`
  (`repohangar.view.groupBy`, `repohangar.view.collapsedGroups`) and reach the webview in the snapshot (`grouping`,
  `collapsed`). Every webview message is checked against the shape table in `src/shared/protocol.ts`.
- §8.12 of the proposal: sorting and filtering run in the webview on the snapshot it holds. Rows arrive as
  `snapshot` and then `patch` messages; the webview re-runs `layout` on every change.

## Goals / Non-Goals

**Goals:**
- One pure function decides the row order, so the sort tables of the spec map one to one onto a Vitest `it.each`.
- One pure function decides each checkbox's state from the selection and the rows it covers, shared by the group
  headers and the select-all header.
- No new setting, command or keybinding outside the dashboard.

**Non-Goals:**
- Multi-column sort (Shift+click on a second header). Ties already fall back to the repository name, which covers the
  common case; a secondary key can come later without changing these rules.
- Sorting the groups themselves (for example the group with the most behind repositories first). Groups stay by name.
- Choosing, hiding or resizing columns (the phase 4 column chooser).
- Saved selections ("backend repos", phase 4) and selecting with `Shift+↑` / `Shift+↓`.
- Changing `Ctrl+A`, which keeps selecting the rows shown in the grid (rows of collapsed groups excluded).

## Decisions

### D-1. The sort lives in `src/shared/sort.ts`, applied inside `layout`

`src/shared/sort.ts` (no `vscode` import) exports:

- `type SortColumn = 'repository' | 'branch' | 'sync' | 'changes' | 'fetched' | 'review'` and
  `interface Sort { column: SortColumn; direction: 'asc' | 'desc' }`, with `DEFAULT_SORT = { repository, asc }`;
- `FIRST_DIRECTION: Record<SortColumn, 'asc' | 'desc'>` and `nextSort(current, clicked): Sort` (the cycle of the
  `Sort cycle matrix`);
- `sortKey(row, column, now)` returning a tuple of numbers or a lower-cased string, built from the same cell
  functions the grid renders (`branchCell`, `syncCell`, the change counts, the review cell of `src/shared/review.ts`),
  so a row sorts by what it shows, including `—` for a Sync cell hidden by an operation in progress. Sync uses the
  sync state, not the job text that replaces it while a job runs (`⟳ fetching`), so a running batch does not reorder
  rows by job;
- `compareRows(sort, now)` which compares keys, flips the sign for `desc`, and breaks ties with `compareNames` on the
  repository name without flipping.

`layout` takes a `sort` argument and calls `rows.sort(compareRows(sort, now))` where it calls `compareNames` today;
grouping keeps the order of its input, so each group's rows come out sorted and groups stay ordered by name.

*Alternative considered:* sorting in the extension host and sending ordered rows. Rejected: §8.12 puts sorting in the
webview, every patch would need a re-send of the order, and the host has no reason to know the sort.

*Fetched key:* the age is `now - lastFetch`, with `never` as `+Infinity`. Using the epoch timestamp instead would
invert the direction names of the spec; the age keeps "descending = oldest first" literal.

### D-2. The sort is remembered in workspace state, like the Group menu

`ViewState` gets `sort` / `chooseSort(sort)` over the key `repohangar.view.sort`, validated on read (an unknown column
or direction reads as `DEFAULT_SORT`). The snapshot carries `sort`; the webview posts `{ type: 'setSort', column,
direction }`, checked by two new field kinds in the protocol shape table. The webview applies the new sort at once
(optimistic) and the next snapshot confirms it, so a click feels instant.

*Alternative considered:* the webview state (`PersistedView`), which holds filter and chips. Rejected: it is lost when
the dashboard closes, and the sort is a preference of the workspace like the grouping, not a transient view state.
Unlike the Group menu, there is no setting to fall back to, so no `onDidChangeConfiguration` handling is needed.

### D-3. Checkbox state from one function, over "covered rows"

`selectionState(covered: string[], selected: ReadonlySet<string>): 'none' | 'some' | 'all' | 'empty'` lives next to
`layout`. The covered rows are:

- for a group header, the rows of that group that pass the filter and chips, whether collapsed or not. `layout`
  already computes them to count the header; `GridItem` for a group gains `ids: string[]` so the header does not
  recompute them;
- for the select-all header, the union of every group's `ids` (or every matching row with grouping `none`), returned by
  `layout` as a second value or a small `matchingIds` helper on the same filtered list.

A click with `none` or `some` adds every covered id to the selection; a click with `all` removes them; `empty`
disables the checkbox. Rows outside `covered` are never touched, which is what keeps hidden selected rows selected.
`mixed` is rendered with the native `indeterminate` property plus `aria-checked="mixed"`, so the theme draws `−`.

*Alternative considered:* a "Select group" item in a group header context menu. Rejected: it is hidden, needs two
clicks, and gives no feedback on how much of the group is already selected; the tri-state checkbox shows that state
at a glance, aligned with the rows' checkboxes.

### D-4. Group header becomes two cells

The group header row gets a `check` cell (the checkbox, `tabIndex={-1}` like the row checkboxes) and a name cell with
`aria-colspan={6}` that keeps `data-focus` and the collapse click. `Space` on a focused group header runs the same
handler as the checkbox (in `activate`, which already dispatches `Space` and `Enter` by item kind). The header text
`▾ <group> (<n>)` is unchanged, so the **Groups in the grid** scenarios keep holding.

### D-5. Range anchor in component state, not persisted

`App` keeps `anchor: string | null` in a `useRef`. A plain checkbox click and `Space` on a row set it; a Shift+click
(`MouseEvent.shiftKey` on the checkbox) computes the shown row ids between the anchor and the clicked row from the
current `items` (so the order follows the sort and skips collapsed groups) and adds them. When the anchor is not among
the shown rows, the click falls back to a plain toggle. The anchor is not saved in webview state: after a reload a
range has to start again, as in a file list. The checkbox's `mousedown` with Shift calls `preventDefault()` so the
browser does not select text across rows.

### D-6. Header labels are buttons outside the roving tabindex; `S` enters the header row

Each sortable `columnheader` holds a `<button class="sort" tabIndex={-1}>Label ▲</button>`. Keeping them out of the
Tab order preserves **Accessible grid** (one focusable cell at a time). `S` in `onGridKey` remembers the focus key and
focuses the header of the sorted column; a `keydown` handler on the header row handles `←` `→` `Enter` `Space` `↓`
`Esc` and stops propagation so the grid keys (`Esc` clearing the filter, `Space` selecting) do not also run. `S` is
ignored while the filter box has focus because the document handler already skips text inputs.

*Alternatives considered:* making the header buttons tabbable (adds six tab stops in front of the grid and breaks the
roving rule); letting `↑` on the first row enter the header row (changes the **Keyboard navigation** matrix, where
`↑` on the first row leaves the focus unchanged); a Sort menu in the toolbar (duplicates the headers and takes toolbar
space next to the Group menu).

### D-7. Live re-sort keeps focus and selection by id

Focus (`view.focus` is `row:<id>`) and selection (ids) are keyed by repository, not position, so re-running `layout`
after a patch moves rows without moving the focus or the selection. Moving the focused row in the DOM can drop the
browser focus to `body`; a `focusin` listener remembers whether the focus was on a grid row or group header, and the
focus layout effect then gives it back to the focused row, so keyboard users stay on the row they were on even when it
moves.

## Risks / Trade-offs

- [Rows jump while a batch runs, for example sorted by Fetched during **Fetch all**] → Focus and selection follow the
  repository (D-7), and the batch result panel lists results by repository; freezing the order during a batch is left
  for later if users report it.
- [Sorting 100+ rows on every patch] → One `sort` of at most a few hundred rows per patch batch (at most one per 100 ms,
  **Live row updates**) is well under a millisecond; the keys are computed from fields already on the row.
- [The select-all checkbox (collapsed groups included) and `Ctrl+A` (shown rows only) cover different rows when a
  group is collapsed] → Both are listed in the key help with their wording; the checkbox matches what the group header
  counts. Aligning `Ctrl+A` would change the **Keyboard navigation** requirement and is left to a later change.
- [The MR / PR rank depends on cell text that `hosting-providers` may extend (a new pipeline state)] → The rank is
  computed from the same pipeline mapping in `src/shared/review.ts`; an unknown state ranks with "a review with no
  pipeline or checks", and the unit table catches a new state that needs its own rank.

## Migration Plan

No migration. An absent `repohangar.view.sort` reads as the default sort, which is today's order. Rollback: removing
the feature leaves an unused workspace state key.
