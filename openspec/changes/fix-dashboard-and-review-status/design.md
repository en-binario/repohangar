## Context

Four fixes found on a 53-repository workspace (see proposal.md):

- `DashboardController.openPanel` (`src/ui/dashboard.ts`) creates a panel whenever `this.panel` is undefined. After a
  window reload VS Code keeps the dashboard tab but calls `deserializeWebviewPanel` only when the tab is first shown,
  so until then `repohangar.open` creates a second tab. `exists` already looks at `tabGroups` for such a tab (it is used
  by Open on startup), `openPanel` does not. `deserializeWebviewPanel` also replaces `this.panel` without looking at
  it, so two saved dashboard tabs stay two tabs, and the first one's `onDidDispose` would later clear the second.
- `webview/styles.css`: `body { padding: 0 12px 12px }` and `.dashboard { min-height: 100vh }`, so the page is always
  `100vh + 12px` high.
- `src/shared/graph.ts` `nameClickAction(nameClick)` maps the setting to a `RowAction`; the webview gets the setting
  and the graph variant (`gitGraph` when Git Graph is installed) in every snapshot, and the snapshot is posted again
  when Git Graph is installed or removed (`graph.onDidChange`).
- `GitLabProvider.reviewStates` (`src/providers/gitlab.ts`) sends chunks of `CHUNK_SIZE` = 50 aliases. Measured on
  gitlab.com with the full selection: 285 characters and 19 complexity points per alias; GitLab answers a query over
  10,000 characters with `422 {"errors":[{"message":"Query too large"}]}` and a query over its complexity limit (250
  with a token, 200 without) with `200 {"errors":[{"message":"Query has complexity of 380, which exceeds max
  complexity of 200"}]}` and no `data`. `Http.statusMessage` reads only `message` and `error`, so the 422 becomes
  `HTTP 422` in the log.

## Goals / Non-Goals

**Goals:**
- One dashboard tab per window in every path, without losing the restored view (filter, chips, selection).
- No scrollbar the content does not need; the footer stays at the bottom.
- `"auto"` follows Git Graph being installed or removed without a reload.
- GitLab review status works for any number of repositories on any GitLab version, without a setting.

**Non-Goals:**
- A setting for the chunk size, or remembering a smaller chunk size per host (10 already fits every measured limit;
  splitting covers a host with lower limits at the cost of one extra request per chunk).
- Refreshing review states after a fetch (Provider refresh triggers are unchanged).
- Removing the horizontal scrollbar on a narrow panel: the grid has minimum column widths and scrolls sideways by
  design (it no longer adds a vertical scrollbar, D-3).

## Decisions

### D-1. Reveal an unrestored dashboard tab instead of creating a panel

When `this.panel` is undefined, `openPanel` looks for a tab whose input is a `TabInputWebview` with the dashboard view
type (the same test as `exists`). If it finds one, it focuses that tab's editor group
(`workbench.action.focus{First…Eighth}EditorGroup`, by the group's position in `tabGroups.all`) and runs
`workbench.action.openEditorAtIndex` with the tab's index. Showing the tab makes VS Code call
`deserializeWebviewPanel`, which sets up the panel as after a reload, so the webview's saved state (filter, chips,
selection, expanded rows) comes back; `reveal()` and `showBatchResult(…, true)` keep working because their messages
wait for `ready`. When no such tab exists, the group is past the eighth, or VS Code has not restored the shown tab
within 2 s, `openPanel` creates a panel.

The lookup is skipped while a tab of a panel RepoHangar set up is still listed: `panel.dispose()` fires `onDidDispose`
before `tabGroups` drops the closing tab, so closing and reopening the dashboard at once would otherwise "reveal" a tab
that is going away. The flag clears on `tabGroups.onDidChangeTabs` once no dashboard tab is listed.

Alternative considered: close the old tab and create a new panel. Rejected: the closed tab's webview state is lost, so
the restored filter and selection would disappear.

### D-2. A second restored panel is closed

`deserializeWebviewPanel` disposes the panel it receives when `this.panel` is already set, and reveals the existing
one. This covers two dashboard tabs saved by an earlier version, and the D-1 fallback racing a late restore.

### D-3. Page height from the layout viewport, not `100vh`

`100vh` includes the scrollbars, so any `100vh`-based height overflows by the horizontal scrollbar's 15 px on a panel
narrower than the grid (measured in VS Code: `innerHeight` 903, `clientHeight` 888). Instead, `html` is `height: 100%`
(the panel without its scrollbars), and while the page shows the dashboard (`body:has(> #root > .dashboard)`) `body` is
a `border-box` flex column with `min-height: 100%`, so its 12 px bottom padding is inside that height; `#root` and
`.dashboard` take `flex: 1`. `.grid` keeps `flex: 1`, which pushes the footer to the bottom. Scoping by `:has` leaves
the empty states, the first-run panel and the profile editor (which shares `styles.css`) as they were.

Alternative considered: `.dashboard { min-height: calc(100vh - 12px) }`. Rejected: correct only without a horizontal
scrollbar; the Playwright test at a narrow window caught it.

### D-4. `"auto"` is resolved in the webview from the graph variant

`NameClick` adds `'auto'`; `nameClickAction(nameClick, graph)` returns `'graph'` for `'auto'` when `graph` is
`'gitGraph'`, else `'revealInExplorer'`. The host's `nameClickSetting()` maps an unknown value to `'auto'` (the new
default). `package.json` declares the enum value with the description "Open the repository in Git Graph when it is
installed, else reveal it in the Explorer." and the default `"auto"`. No new message is needed: the snapshot already
carries `graph` and is reposted when Git Graph is installed or removed.

### D-5. GitLab chunks of 10, split on size or complexity rejections

`GITLAB_CHUNK_SIZE = 10` in `src/providers/provider.ts` (190 points with the full selection, 200 with `description`;
2,850 characters). `reviewStates` works through a queue of chunks: a chunk rejected for its size (an `HttpError` with
status `422` whose message matches `Query too large`) or its complexity (an answer without `data` whose first error
matches `exceeds max complexity` or `Query too large`) is replaced at the front of the queue by its two halves; a
rejected chunk of one alias throws, so the queue backs off as for any failed request. The schema-error reduction of
the selection is unchanged and still applies per chunk. GitHub keeps `CHUNK_SIZE = 50`.

### D-6. Error messages in the log

`statusMessage` in `src/providers/http.ts` reads, in this order, the first `errors[].message` (GraphQL), `message`,
`error`, then falls back to `HTTP <status>`. The loader already logs `Review request to <host> failed: <message>`.

## Risks / Trade-offs

- [More requests per host: 53 GitLab repositories now cost 6 sequential requests instead of 2 failing ones] → Each is
  small; the performance target (§11.2) becomes "one request per host and chunk"; the integration test keeps the
  1.5 s bound with 100 ms answers.
- [`workbench.action.openEditorAtIndex` and the focus-group commands are workbench commands, not API] → They are
  stable keybinding targets; if they throw, `openPanel` falls back to creating a panel and D-2 closes the old tab when
  VS Code restores it, so the window still ends with one dashboard tab.
- [A user who relied on the click revealing the Explorer] → `"explorer"` keeps that; the CHANGELOG entry names the
  setting.
