## Why

A right-click on a dashboard row opens the webview's default **Cut / Copy / Paste** menu, which does nothing useful
there: the row has no editable text, and the actions people look for on a right-click (Open terminal, Stash changes,
Copy path, Copy branch name, …) are one hover away in the `⋯` menu. A right-click is the first thing most mouse users
try, so the dashboard should answer it with the row's actions (PROPOSAL.md §3, principle 5 "Keyboard first, mouse
friendly"; W12, the row `⋯` menu).

Roadmap phase: **1. Dashboard MVP** (§13), row actions; a follow-up to the row more-actions menu of `git-operations`
(the menu W12 describes, §8.3 and §9.3). It adds no new action, only a new way to open the existing menu.

## What Changes

- A right-click (the `contextmenu` event) on a repository row opens that row's more-actions menu, the same menu as the
  `⋯` button and the `.` key, with the same groups, items, enabled state and keys, at the pointer, kept inside the
  dashboard. The webview's default **Cut / Copy / Paste** menu no longer opens on repository rows.
- The right-click focuses the row (like the `⋯` button) and leaves the selection unchanged; the chosen item acts on that
  row only.
- A right-click on another row while a menu is open closes it and opens the menu of the new row; a right-click inside
  an open menu does nothing.
- The default menu is kept where it is useful: the filter box, the row details (text that people copy) and the MR
  drawer and profile editor forms. Group header rows keep it too.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `git-operations`: adds the requirement **Row context menu** (a right-click on a repository row opens its more-actions
  menu at the pointer). The existing **Row more-actions menu** requirement is unchanged; its items, as extended by
  `add-git-graph-and-explorer` and `add-mr-creation`, are what the right-click shows.

## Impact

- **Webview**: `webview/App.tsx` (`RowView` gets an `onContextMenu` handler; the menu state records where the menu
  opens), `webview/RowActions.tsx` (`RowMenu` accepts an optional anchor point and keeps itself inside the viewport),
  `webview/styles.css` (a pointer-anchored variant of `.row-menu`).
- **Extension host, protocol, settings, commands**: none. The menu items still run through the existing `RowAction`
  messages.
- **Tests**: a Playwright UI test in `test/ui/actions.spec.ts`.
- **Docs**: an `Added` entry under `## Unreleased` in `CHANGELOG.md` (docs/versioning.md R6: a new way to open a
  menu).
