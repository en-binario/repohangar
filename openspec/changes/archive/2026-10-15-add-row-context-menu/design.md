## Context

The row more-actions menu already exists: `RowMenu` in `webview/RowActions.tsx` renders the groups of
`src/shared/rowMenu.ts`, and `App.tsx` keeps one `menuFor: string | null` (the row id whose menu is open), set by the
`⋯` hover button and the `.` key. `RowView` renders `RowMenu` inside the row's `.cell.actions`, and `.row-menu` is
`position: absolute; top: 100%; right: 0`, so the menu always hangs under the right edge of the row. A mousedown
outside the menu closes it (`closeMenu`, which hands the focus back to the focused row).

Nothing in the webview handles `contextmenu`, so VS Code's default webview menu (Cut / Copy / Paste) opens. See
proposal.md for the motivation and the spec delta for the behaviour.

## Goals / Non-Goals

**Goals:**
- One menu component and one menu state for the three triggers (`⋯`, `.`, right-click); only the anchor differs.
- No change to the extension host, the message protocol or `package.json` contributions.

**Non-Goals:**
- A VS Code native context menu (`webview/context` contributions with `data-vscode-context`).
- A keyboard context-menu trigger (`Shift+F10`, the Menu key); `.` already covers the keyboard.

## Decisions

### D-1. Webview menu, not a native `webview/context` menu

VS Code can show a native menu in a webview from `contributes.menus["webview/context"]` items keyed on
`data-vscode-context`. It was rejected: every item would need a command and a `when` clause per enabled state (dirty,
stashes, detached HEAD, compare page, Git Graph label, platform label), duplicating `rowMenu()` in `package.json`; the
disabled-item tooltips and the key hints would be lost; and the menu would look different from the `⋯` menu the user
also sees. Reusing `RowMenu` keeps one source for items and enabled state.

### D-2. Menu state carries an optional anchor point

`menuFor` becomes `{ id: string; at?: { x: number; y: number } } | null`. The `⋯` button and `.` set no point, so the
menu keeps today's position under the row's right edge. The right-click sets `at` to the event's `clientX` / `clientY`.
`RowMenu` takes `at?` and, when set, renders with the class `row-menu at-pointer` and inline `left` / `top`.

### D-3. `position: fixed` at the pointer, clamped after layout

`.row-menu.at-pointer` is `position: fixed` (with `top: auto; right: auto` resetting the anchored rule), so the menu is
placed in viewport coordinates, the same space as `clientX` / `clientY`, and is not clipped by the grid's scroll
container. In a `useLayoutEffect`, `RowMenu` measures itself and moves left by the overflow past
`window.innerWidth` and up by the overflow past `window.innerHeight` (never below 0), before paint, so the menu never
flickers outside the dashboard. A fixed menu would drift from its row when the grid scrolls, so a pointer-anchored menu
also closes on `scroll` (capture phase, any scroller) and on `resize`.

Alternative considered: always open at the `⋯` position. Rejected: on a wide dashboard a right-click on the repository
name would open the menu 1500 px away from the pointer.

### D-4. Where the default menu is suppressed

`RowView`'s `.row.repo` element gets `onContextMenu`: `preventDefault()`, `onFocus()` (focus the row), then open the
menu with the point. The handler is on the repository row only, so group headers, the details row, the filter box,
the drawer and the profile editor keep the default menu without extra code. `RowMenu` gets its own `onContextMenu`
that calls `preventDefault()` and `stopPropagation()`, so a right-click inside the open menu neither shows the default
menu nor reopens the menu at a new point (spec R1).

A right-click on another row while a menu is open needs no special case: the `mousedown` of the right button is
outside the open menu and closes it through the existing listener, then `contextmenu` opens the new one (spec R5).

## Risks / Trade-offs

- [A right-click on selected text in a row no longer offers **Copy**] → Rows hold no text people copy (that is the row
  details, which keeps the default menu), and the menu offers **Copy path** and **Copy branch name**; `Ctrl+C` still
  copies a text selection.
- [The menu closing on scroll surprises someone who scrolls with it open] → Same behaviour as VS Code's own context
  menus; the anchored `⋯` menu, which scrolls with its row, keeps today's behaviour.
- [`position: fixed` breaks if an ancestor gets a `transform`] → No ancestor of the row has one today; the Playwright
  test checks the menu's bounding box against the pointer, so a future transform fails the test.
