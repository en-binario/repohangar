## Why

Using the dashboard on a 53-repository workspace showed four problems:

1. **A second RepoHangar tab.** After a window reload, the restored dashboard waits in a background tab, and VS Code
   restores it only once it is shown. Until then `repohangar.open` (`Ctrl+Alt+H`) finds no panel and creates a second
   one. The dashboard spec already says "at most one dashboard panel per window".
2. **A vertical scrollbar with two rows.** `.dashboard` is `min-height: 100vh` and `body` has a 12 px bottom padding, so
   the page is always 12 px taller than the panel and shows a scrollbar it does not need.
3. **The name click.** A click on the repository name reveals the folder in the Explorer (`repohangar.dashboard.nameClick`,
   default `"explorer"`). The graph is what people want from a click on a repository, and Git Graph is the reason many of
   them use RepoHangar (it absorbs Git Graph Opener). Without Git Graph, the Explorer is still the better default (the
   Source Control Graph is a different view).
4. **MR / PR cells never refresh on GitLab.** Every review request to the GitLab host failed with `HTTP 422`, so the cells
   kept the states of the previous day, dimmed with `Not refreshed since 1 d ago`, and showed no `[Create MR]` (the
   button needs a refreshed state). Reproduced against gitlab.com: GitLab rejects a GraphQL query longer than
   10,000 characters with `422 {"errors":[{"message":"Query too large"}]}`, and a query whose complexity exceeds 250
   (200 without a token) with `Query has complexity of N, which exceeds max complexity of 250`. One repository costs 19
   complexity points and about 285 characters, so the planned chunk of 50 aliases (14,206 characters, complexity 950)
   can never succeed, and anything above 13 aliases fails on complexity. The log line said only `HTTP 422` because the
   message is in GraphQL's `errors` array.

Roadmap phase: **1. Dashboard MVP** (§13) for 1–3, follow-ups to `dashboard` (§8, W2) and `explorer-reveal` (§9.3);
**2. Hosting providers** for 4, a fix to `hosting-providers` (§6.4, Batched review status, §11.2).

## What Changes

- `repohangar.open` and every entry point that opens the dashboard (Show in RepoHangar, Show Details of a batch) make an
  existing dashboard tab active even when VS Code has not restored its webview yet, instead of creating a second panel.
  A second dashboard panel that VS Code restores while one exists is closed.
- The dashboard page is exactly as tall as the panel when its rows fit: no vertical scrollbar. The scrollbar appears only
  when the rows, the toolbar and the footer do not fit.
- `repohangar.dashboard.nameClick` gets the value `"auto"`, the new default: **Open in Git Graph** when Git Graph is
  installed, else **Reveal in Explorer**. `"explorer"`, `"gitGraph"` and `"sourceControl"` keep their meaning.
- GitLab review requests carry at most 10 aliases (GitHub keeps 50). When GitLab answers a chunk with `Query too large`
  or a complexity error, the chunk is split in two halves and each half is sent again, down to one alias; a single alias
  that still fails is a request failure (back-off, cached values marked as not refreshed).
- A failed request logs GraphQL's error message (`Review request to <host> failed: Query too large`) instead of
  `HTTP 422`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dashboard`: **Opening the dashboard** gets a matrix for a dashboard tab that VS Code has not restored yet and for a
  second restored panel; adds **Dashboard height** (no scrollbar when the rows fit).
- `hosting-providers`: **Batched review status** limits GitLab requests to 10 aliases and splits a chunk GitLab rejects
  for its size or complexity; its scenarios *Forty repositories on two hosts* and *Chunks of 50 aliases* change their
  numbers (same names).
- `explorer-reveal` (created by `add-git-graph-and-explorer`, not archived): **Repository name click** gets the value
  `"auto"` and its new default. OpenSpec cannot apply `MODIFIED` to a capability that is not in `openspec/specs/` yet,
  so this change revises that requirement in place in `add-git-graph-and-explorer/specs/explorer-reveal/spec.md` (with
  its proposal line and settings task), and implements and tests it here.

Depends on: `add-git-graph-and-explorer` (the `explorer-reveal` revision above). Archive it before this change.

## Impact

- **Extension host**: `src/ui/dashboard.ts` (reveal an unrestored dashboard tab; close a duplicate restored panel;
  `"auto"` name click), `src/shared/graph.ts` (`nameClickAction` takes the graph variant), `src/providers/gitlab.ts`
  (chunk size, splitting), `src/providers/provider.ts` (`GITLAB_CHUNK_SIZE`), `src/providers/http.ts` (GraphQL error
  messages).
- **Webview**: `webview/styles.css` (page height), `webview/App.tsx` (name action from the graph variant).
- **Settings**: `repohangar.dashboard.nameClick` adds `"auto"` and changes its default from `"explorer"` to `"auto"`
  (`package.json`, README settings table).
- **Protocol**: `Snapshot.nameClick` accepts `"auto"`.
- **Tests**: contract tests in `test/contract/batching.test.ts`; unit tests for `nameClickAction` and the HTTP error
  message; integration tests in `test/integration/suite/main/30-dashboard.test.ts`, `00-smoke.test.ts` and the
  performance test `perf/reviewStatus.test.ts` (now 1 request per host and chunk); Playwright tests in
  `test/ui/explorer.spec.ts` and `test/ui/grid.spec.ts`.
- **Docs**: README, and CHANGELOG entries under `## Unreleased` (`Fixed` for the second tab, the scrollbar and the
  GitLab requests; `Changed` for the name click default).
