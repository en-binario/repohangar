## 1. Menu anchor

- [ ] 1.1 Change the menu state in `webview/App.tsx` from `menuFor: string | null` to `{ id, at? } | null` (design D-2); the `⋯` button and `.` set no point; verify `npm run typecheck` passes and the existing `test/ui/actions.spec.ts` test *copies the path from the more-actions menu by keyboard* still passes
- [ ] 1.2 Give `RowMenu` an optional `at` point: class `row-menu at-pointer` with inline `left` / `top`, a `useLayoutEffect` that moves it left and up by its overflow past the viewport, and close on capture-phase `scroll` and `resize` while pointer-anchored; add `.row-menu.at-pointer { position: fixed; top: auto; right: auto; }` to `webview/styles.css` (design D-3); verify by the tests of 2.2

## 2. Right-click

- [ ] 2.1 Add `onContextMenu` to the `.row.repo` element of `RowView` (`preventDefault`, focus the row, open the menu at `clientX` / `clientY`) and an `onContextMenu` on `RowMenu` that calls `preventDefault` and `stopPropagation` (design D-4); verify by the tests of 2.2
- [ ] 2.2 `Right-click target matrix` (git-operations: Row context menu) → Playwright UI tests in `test/ui/actions.spec.ts`, one test per row R1–R8: right-click with `click({ button: 'right' })` and assert the open menu (`getByRole('menu', { name: 'Actions for <repo>' })`, count 0 or 1), the focused row, and that the default menu did not open (the `contextmenu` event's `defaultPrevented`, recorded by a capture listener in the frame: `true` for R1–R5, `false` for R6–R8); R2–R5 also assert the menu's top-left is within 1 px of the pointer when it fits
- [ ] 2.3 Add the scenarios *Copy path from the right-click menu* (clipboard holds the `billing-api` root, menu closed, focus on `billing-api`, `billing-api` and `ledger` still selected), *Menu near the right edge* (resize the page so the dashboard is about 1000 px wide, right-click at 900 px, assert the menu's bounding box is inside the frame viewport) and *Disabled items as from the `⋯` button* (`aria-disabled="true"` on the four items) to `test/ui/actions.spec.ts`; verify they pass

## 3. Docs and release notes

- [ ] 3.1 Mention the right-click next to the `⋯` menu in the README's dashboard section; run `npm run typecheck`, `npm test`, `npm run test:ui` and `openspec validate add-row-context-menu --strict`; all pass
- [ ] 3.2 Add an `Added` entry under `## Unreleased` in `CHANGELOG.md` (docs/versioning.md R6): a right-click on a dashboard row opens its `⋯` menu at the pointer instead of Cut / Copy / Paste; verify it starts with `- **Added`
