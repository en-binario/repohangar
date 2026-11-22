## Why

A feature that spans `billing-api`, `ledger` and `web-shop` needs three merge requests that point at each other.
Today that is three rounds of the single-repository flow plus editing every description to cross-link them, 30 steps
or more (PROPOSAL.md §3.1). With profiles and one-keystroke creation in place (`add-mr-creation`), the same keystroke
can create them all and link them.

Roadmap phase: **3. Batch and profiles UX** (§13), second slice: multi-repo MRs with related links. It implements §7.8,
the `{related}` placeholder of §7.4, W7 (`⤴ Create MRs (3)`), the merge request variant of W8, §10.1
(`repohangar.mr.create` on a selection) and §10.2 (`m` on a selection).

Acceptance criterion of the phase covered here: **3 linked MRs in 3 repositories in two keystrokes** (select, `m`).

**Depends on: `add-mr-creation`** (create flow, profiles, `{…}` templates) **and `add-multi-repo-branches`** (the batch
result panel and **Retry failed**).

## What Changes

- **`m` on a selection**, the toolbar button `⤴ Create MRs (3)` and `repohangar.mr.create` run from the dashboard with
  rows selected create one merge request or pull request per selected repository, in parallel through the job pool,
  each with the profile its own rules choose and its own guards. A guard that stops one repository records
  `skipped: <reason>` and the others go on. Unless `repohangar.mr.quickCreate` is `"direct"`, one confirmation comes
  first.
- **Related links**: after the batch, every review created or found in it gets a `Related:` section listing the
  others, through one description update per review, placed where `{related}` stands, or at the end. Re-running
  replaces the section instead of adding a second one.
- **Result panel** (W8): `Create MRs — feature/ABC-12-notes` with one line per repository (`!142`, `already existed —
  description updated with related links`, `pushed 3`), **Open ↗** per line, **Copy all links**, **Retry failed** and
  **Close**; a summary notification as for the other batches.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mr-creation`: adds requirements for creating merge requests on a selection, related links, the merge request
  result panel and retry. `add-mr-creation` is not archived yet, so these are ADDED requirements.
- `mr-profiles`: adds the `{related}` placeholder.

## Impact

- **Code**: `src/mr/multi.ts` (batch flow and related-links section, the section builder without `vscode`),
  `updateDescription` in `src/providers/gitlab.ts` and `github.ts`, the job runner's `createMr` kind, webview toolbar
  button and result panel lines.
- **Public surface**: `m` and `repohangar.mr.create` act on a selection; toolbar button `⤴ Create MRs (n)`. CHANGELOG
  `Added` entry.
- **Network**: one description update request per review in the batch (`PUT /projects/:id/merge_requests/:iid` on
  GitLab, `PATCH /repos/{o}/{r}/pulls/{n}` on GitHub).
