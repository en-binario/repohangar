## Why

Batch actions work on a selection (PROPOSAL.md §2 goal G3), and the most common selection is "every repository of one
group": the repositories of one product, one team folder or one workspace folder. Today that takes one `Space` or
checkbox click per row, or a filter typed to match the group followed by `Ctrl+A`, which breaks as soon as a repository
name in another group matches the same text. With 40 or more repositories in one group, selecting it row by row is the
slowest step of a batch. The grid also always lists rows by name, so the repositories that need attention (most
behind, most changes, oldest fetch, failed pipeline) are scattered across the list instead of at the top of their
group; W2 (§8.3) draws the column headers, and §8.12 says sorting runs in the webview on the snapshot it holds, but no
capability specifies it (the `dashboard` Purpose lists "Sorting by column" as not owned by any capability yet).

Roadmap phase: a follow-up to **1. Dashboard MVP** (§13, "filters and groups") that serves the selection-based batches
of **3. Batch and profiles UX**. It is a lighter step toward the phase 4 "saved selections", which stay out of scope.

## What Changes

- **Group checkbox.** Every group header gets a checkbox in the selection column, left of `▾ <group> (<n>)`. It is
  checked when every row the header counts is selected, mixed (`aria-checked="mixed"`, shown as `−`) when some are, and
  unchecked when none are. A click selects every row the header counts, or clears them when all are already selected.
  It acts on the rows that match the filter and chips, also in a collapsed group, and never on rows the filters hide.
  The group still collapses or expands only from a click on its name or `Enter`.
- **`Space` on a group header** does what the group checkbox click does, so selecting a group works from the keyboard.
- **Select-all checkbox** in the column header of the selection column, with the same three states over every row the
  filters and chips match (the rows the group headers count, also in collapsed groups): the mouse counterpart of
  `Ctrl+A` that can also clear those rows.
- **Shift+click range.** A Shift+click on a row's checkbox selects every shown row from the last row whose checkbox was
  clicked (or toggled with `Space`) through the clicked row, in grid order.
- **Sort by column.** A click on a column header (**Repository**, **Branch**, **Sync**, **Changes**, **Fetched**,
  **MR / PR**) sorts the rows by that column within each group; groups keep their order by name. The first click uses
  the order that puts what needs attention first (A→Z for names, most behind for Sync, most changes for Changes, oldest
  fetch for Fetched, failed pipeline for MR / PR), a second click reverses it, and a third click returns to the default
  order (Repository A→Z). Ties fall back to repository name A→Z. The sorted header shows `▲` or `▼` and carries
  `aria-sort`.
- **`S` sorts from the keyboard.** `S` (free in the §10.2 key map) moves focus to the column headers, the way `/` moves
  it to the filter box: `←` `→` choose a column, `Enter` or `Space` sorts by it, `↓` or `Esc` returns to the row.
- **Sort remembered per workspace**, like the Group menu choice: kept across window reloads and dashboard reopenings,
  no setting written. Rows re-sort when their state changes; keyboard focus and the selection stay on the same
  repositories.
- No change to which rows the filters show, to the batch actions, or to the order of group headers.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dashboard`:
  - adds **Group selection** (the group header checkbox and `Space` on a group header), **Select all matching rows
    from the column header**, **Range selection with Shift+click**, **Sort by column**, **Sort from the keyboard** and
    **Sort remembered per workspace**;
  - replaces **Grid columns** with **Grid columns and row order** (same columns; the row order within a group follows
    the chosen sort, the default stays repository name A→Z), because the old requirement fixes the row order and its
    scenario reads the header labels without a sort indicator.

  The `dashboard` Purpose still says "Sorting by column and choosing columns: no capability does yet". A delta cannot
  change a Purpose, so a task edits `openspec/specs/dashboard/spec.md` directly to read "Choosing columns: no
  capability does yet".

## Impact

- **Webview**: `webview/App.tsx` (group header checkbox cell and `Space` on a header, select-all header checkbox,
  Shift+click anchor, sortable header buttons with `aria-sort`, the `S` header focus, key help entries), `webview/layout.ts` (sort within
  groups), `webview/styles.css` (mixed checkbox, header buttons and sort arrows).
- **Shared logic**: a pure sort module in `src/shared/` (sort keys per column, default directions, tie-break) and the
  tri-state computation, with no `vscode` import.
- **Extension host and protocol**: `src/ui/viewState.ts` remembers the sort in workspace state
  (`repohangar.view.sort`); `src/shared/protocol.ts` adds a validated `setSort` message and a `sort` field in the
  snapshot; `src/ui/dashboard.ts` handles it. No setting, command or keybinding is added.
- **Tests**: Vitest table tests in `test/unit` for the sort keys and the selection states; Playwright tests in
  `test/ui/grid.spec.ts` and `test/ui/keys.spec.ts`.
- **Docs**: an `Added` entry under `## Unreleased` in `CHANGELOG.md` (docs/versioning.md).
