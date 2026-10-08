# Spec writing

> **Applies to:** every capability spec in `openspec/specs/` and every spec delta in `openspec/changes/`
> **Enforced by:** `openspec validate --strict` and review (§11)
> **Project rules:** [`openspec/config.yaml`](../openspec/config.yaml) `rules.specs` and `rules.tasks`

This standard governs how a requirement and its scenarios are written. A spec has two readers: a person reviewing a
proposal, and an agent turning the spec into tests and code. Both need every outcome stated exactly and every
combination of conditions visible.

The central rule is: **when an outcome depends on two or more conditions, write a decision table, not a list of
WHEN/THEN scenarios** (§4). Typical conditions in RepoHangar are:

- the repository state: clean or dirty, upstream or none, ahead and behind counts, detached HEAD, an operation in
  progress (merge, rebase, cherry-pick, revert), conflicts;
- the hosting provider (`gitlab`, `github`, `unknown`), whether a token or session exists for the host, the GitLab
  version (17.10 or 17.11 and later) and tier (Free or Premium), and the project's policies (squash option,
  auto-merge allowed, `delete_branch_on_merge`);
- whether a merge request already exists for the branch;
- a setting value (`repohangar.mr.quickCreate`, `repohangar.gitGraph.whenMissing`, `repohangar.explorer.contextMenu.showOn`);
- whether the Git Graph extension or the old Git Graph Opener extension is installed;
- VS Code's `scm.repositories.selectionMode`, the Workspace Trust state, and whether the window is focused;
- whether the action runs on a selection of rows or on the focused row, and the kind of Explorer item (repo root,
  subfolder, file, multi-selection).

Existing specs conform the next time a change edits them. §9 explains what a delta can and cannot change once a
capability has been archived.

## 1. Anatomy of a capability spec

```markdown
## Purpose
One or two sentences: what this capability is for.

**Non-goals:**
- Behaviour X, owned by `<other-capability>`.

## ADDED Requirements

### Requirement: <observable behaviour, stated as a sentence>
The system SHALL …

**Constraints:**
- …

#### Scenario: <unique name>
…
```

| Part | Rule |
|---|---|
| `## Purpose` | Written only in the delta that **creates** the capability. A later delta cannot change it; edit `openspec/specs/<capability>/spec.md` directly instead |
| `**Non-goals:**` | Goes inside `## Purpose`. Never add a separate `## Non-Goals` section: archive copies only the Purpose from a creating delta and drops any other section. Each bullet names the capability that owns the excluded behaviour, or says that no capability does (merging MRs, reviewing diffs) |
| Requirement | One observable behaviour: what a user sees in the dashboard, the status bar, a menu, a quick input or a notification; which Git operation runs and what it changes in the repository; which request reaches GitLab or GitHub; which setting is written, at which scope. Never a class, function, library or internal module |
| Scenario | At least one per requirement. Every failure path and every skip reason has its own scenario or table row |

## 2. RFC 2119 keywords

Normative keywords are uppercase, including their negation: **MUST**, **MUST NOT**, **SHALL**, **SHALL NOT**,
**SHOULD**, **SHOULD NOT**, **MAY**. Never write `SHALL not`.

- The requirement body contains SHALL or MUST (`openspec validate --strict` fails otherwise).
- A `SHOULD` names its permitted exception in the same sentence. If it has none, it is a `MUST`.
- Scenarios and table cells describe outcomes, not obligations, so they contain no RFC keywords.

## 3. Choosing the form

Decide the form before writing the scenarios. Prefer a table wherever one is possible.

| The outcome depends on | Form |
|---|---|
| Two or more independent conditions (repo state, provider, token, policy, setting, installed extension, trust) | **Decision table** (§4) |
| Whether an optional input is present (a profile key, a rule's `set`, a placeholder, a command argument) | **Decision table** with that input as a condition column |
| A single condition | GIVEN/WHEN/THEN (§5) |
| A sequence over time (push, then create, then enable auto-merge; create, then Undo within 30 s) | GIVEN/WHEN/THEN with `AND WHEN` / `AND THEN` (§5) |

Reasons for choosing a table:

- **No combinatorial blind spots.** A missing combination shows up as a missing row that a reviewer can see.
  Scattered WHEN/THEN scenarios hide it.
- **Direct test mapping.** Each row becomes one case of a table-driven test (§10).
- **Schema compatible.** OpenSpec parses only the `### Requirement:` and `#### Scenario:` headers. A table under a
  scenario header passes `openspec validate --strict` and survives `openspec archive` unchanged (verified with
  OpenSpec 1.13.0).

## 4. Decision tables

### Rules

1. The table sits directly under a `#### Scenario:` header (exactly four `#`), and the scenario is named `… matrix` or `… table`.
2. **The first column is `#`** and holds a stable row id: `R1`, `R2`, … Ids are never reused or renumbered, so a removed row leaves a gap. Tasks and reviews cite rows by id.
3. **Condition columns come next, then outcome columns**, then an optional `Notes` column last.
4. **One row per distinct combination.** Cover every combination. Collapse rows only with an explicit `*Any*` (the condition does not matter) or `*N/A*` (the condition does not apply). **Leave no blank cells.**
5. **Outcome values are bold** (`**ok**`, `` **`skipped: dirty`** ``, `**Open in Source Control Graph**`) so they stand out from conditions at a glance.
6. **Short-circuit rows come first**, in the order the implementation checks them. For example, an operation in progress comes before any row that depends on ahead and behind counts.
7. The requirement text stays normative and states the rule. The table illustrates it and MUST NOT contradict it. If they disagree, the requirement text is wrong.

### Example: rules applied in order

```markdown
### Requirement: Pull all fast-forward eligibility
The system SHALL fast-forward a repository in Pull all (ff) only when no operation is in progress, HEAD is on a
branch, the working tree is clean, the branch tracks an upstream and is not ahead of it, applying the rules in row
order, and SHALL record every other repository as skipped with its reason.

#### Scenario: Pull all eligibility matrix

| # | Operation in progress | HEAD | Working tree | Upstream | Ahead | Behind | Job result | Git |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Rebase | *Any* | *Any* | *Any* | *Any* | *Any* | **`skipped: rebase in progress`** | **No merge** |
| R2 | None | Detached | *Any* | *Any* | *Any* | *Any* | **`skipped: detached HEAD`** | **No merge** |
| R3 | None | Branch | Dirty | *Any* | *Any* | *Any* | **`skipped: dirty`** | **No merge** |
| R4 | None | Branch | Clean | No | *N/A* | *N/A* | **`skipped: no upstream`** | **No merge** |
| R5 | None | Branch | Clean | Yes | ≥ 1 | ≥ 1 | **`skipped: diverged (↑a ↓b)`** | **No merge** |
| R6 | None | Branch | Clean | Yes | ≥ 1 | 0 | **`skipped: ahead`** | **No merge** |
| R7 | None | Branch | Clean | Yes | 0 | ≥ 1 | **`ok`** | **`git merge --ff-only @{u}`** |
| R8 | None | Branch | Clean | Yes | 0 | 0 | **`ok`** | **No merge** |
```

Prose scenarios for the same behaviour usually cover `dirty` and the happy path. The table forces the detached HEAD,
the ahead-only repository and the up-to-date repository to appear, and that is where a wrong rule order shows up. R6
is an example: the proposal (§5.3) lists no skip reason for a branch that is only ahead, and the empty cell would have
made that visible in review. (R1 stands for every operation in §5.3; a real spec gives merge, rebase, cherry-pick and
revert a row each.)

### Example: an optional input

```markdown
#### Scenario: Graph item matrix

| # | Git Graph installed | `repohangar.gitGraph.whenMissing` | Menu item | `g` key |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Yes | *Any* | **Open in Git Graph** | **Runs `git-graph.view` with the repo root** |
| R2 | No | `sourceControlGraph` | **Open in Source Control Graph** | **Opens the Source Control Graph** |
| R3 | No | `offerInstall` | **Open in Git Graph** | **Notification with `[Install Git Graph]`** |
| R4 | No | `hide` | **Hidden** | **Notification `Git Graph is not installed` with `[Install Git Graph]`** |
```

Because the setting is a column, the table states the default (R2) and both alternatives without a separate scenario
per value.

### When not to use a table

- **One condition:** use GIVEN/WHEN/THEN. A one-column table is noise.
- **A sequence over time:** use GIVEN/WHEN/THEN.

## 5. GIVEN, WHEN, THEN

Every bullet under a `#### Scenario:` header that is not a table starts with `**GIVEN**`, `**WHEN**`, `**THEN**` or
`**AND**`. An event sequence continues with `**AND WHEN**` / `**AND THEN**`. Put the state first, the trigger second and
the outcome last. Never bury a state inside the trigger.

```markdown
#### Scenario: Create with defaults pushes an unpublished branch
- **GIVEN** `billing-api` is on `feature/ABC-12-notes` with 2 commits ahead of `main` and no upstream
- **AND** the host `git.acme.com` has a token and profile `default` lists reviewers `ana.perez` and `luis.gomez`
- **WHEN** the user presses `m` on the row
- **THEN** the branch is pushed with upstream `origin/feature/ABC-12-notes`
- **AND** one `POST /projects/:id/merge_requests` request is sent with `squash: true` and `remove_source_branch: true`
- **AND THEN** the notification reads `Created !142` with the buttons `Open`, `Copy link` and `Undo`
```

## 6. Outcomes and errors

Every outcome names a value a test can check. Examples:

- the text of a dashboard cell (`↑2 ↓3`, `⇡ publish`, `REBASING 3/7`, `!142 Draft ⟳ running`) or of the status bar
  item (`⎇ 14 repos ↓3 ●2 !5`);
- a per-repo job result: `ok`, `skipped: <reason>` with the exact reason, or `failed: <message>`;
- the Git extension API call or the `git` command line that runs, and what it changes (HEAD, upstream, refs, working
  tree);
- the provider request: method and endpoint or GraphQL operation, the fields the scenario asserts, and the number of
  requests per host;
- a setting written, with its key, value and scope (user, workspace, folder), or a `workspaceState` / `globalState` /
  `SecretStorage` entry;
- a context key and its value (`repohangar.gitGraph.installed` is `true`), or a menu item that is shown or hidden.

Failure outcomes name what RepoHangar actually produces:

| Failure | Name in the spec |
|---|---|
| A batch action skips a repository | The job result **`skipped: <reason>`**, with the reason as shown in the row and the summary (`dirty`, `diverged (↑2 ↓3)`, `no upstream`, `detached HEAD`, `rebase in progress`) |
| A Git or provider operation that cannot complete | The job result **`failed: <message>`** and the notification text with its buttons |
| A guard that stops an action (on the target branch, nothing to merge, rebase in progress) | The **exact English notification** and its fix button (`You're on main.` with `[Create branch…]`) |
| A best-effort step that fails silently (Source Control selection sync) | **No notification**, and the state that stays as it was (selection unchanged) |
| An action that must not run (Restricted Mode, untrusted input, destructive action not confirmed) | What stays unchanged: **no `git` process started**, **no request sent**, HEAD, refs and working tree unchanged, settings unchanged |
| A provider rejection that RepoHangar reports (GitLab Free applies one reviewer) | The **exact English notification** (`GitLab Free allows one reviewer: ana.perez added, luis.gomez not added`) and the values that were applied |

These phrases are banned in `THEN` lines and outcome cells, because none of them can fail a test:

| Banned | Write instead |
|---|---|
| "is refused", "is rejected", "fails", "is blocked" | The job result, the notification text, or the unchanged state |
| "an error is shown", "shows a message", "warns the user" | The exact string and its buttons |
| "appropriate", "correct", "properly", "as expected", "smoothly", "successfully", "quickly" | The value, duration or limit |
| "etc.", "and so on", "…" in an enumeration | The full list, or `*Any*` |
| "updates the dashboard" | The cell text after the update and the time limit (`< 250 ms`) |

Specify user-facing copy only when the words are the behaviour, such as a notification, a menu item, a cell, a
tooltip or an empty state. Then quote the English text verbatim. Output channel lines and log levels are not specified:
they are mechanism and belong in `design.md`.

## 7. Constraints

Numeric limits, enumerations, durations and ordering rules that hold across every scenario go in a
`**Constraints:**` list under the requirement text:

```markdown
### Requirement: Batched review status
The system SHALL load the merge request or pull request state of every repository on a host with one GraphQL request
per chunk of aliases.

**Constraints:**
- Chunk size: at most 50 aliases per request
- Concurrency of the REST fallback: at most 4 requests per host
```

Every constraint MUST be exercised by at least one scenario or table row. A constraint that no scenario touches is
prose that nobody tests.

## 8. Settings, commands, menus and providers

- **Settings.** Never write "the configured value". Name the key and its default: ``fetch timeout
  (`repohangar.fetchTimeoutSeconds`, default `60`)``. When a scenario writes a setting, name the scope. When an old
  Git Graph Opener key is involved, name both keys (`gitGraphOpener.repositoryScanDepth` → `repohangar.repositoryScanDepth`).
- **VS Code settings RepoHangar reads.** Name them the same way (`scm.repositories.selectionMode`, `git.autofetch`,
  `github-enterprise.uri`).
- **Commands and keys.** Name the command id (`repohangar.mr.create`) and, when a key is the trigger, the dashboard key
  (`m`) or the default keybinding (`Ctrl+Alt+M`). A scenario that depends on the platform names it (`Cmd+Alt+M` on macOS).
- **Menus and context keys.** Name the menu (`explorer/context`, `scm/sourceControl`, `scm/title`), the item's title as
  shown, and the context keys its `when` clause depends on (`repohangar.repositoryRoots`, `repohangar.hostedRoots`).
- **Git.** Name the Git extension API call (`repository.fetch({ prune: true })`) or, for the local fast paths, the exact
  `git` arguments (`git merge --ff-only @{u}`). Say whether the step uses the network.
- **Providers.** Name the REST endpoint or GraphQL operation and only the fields the scenario asserts. Appendix B of the
  proposal records intent; the spec records what is tested. When the outcome differs by GitLab version or tier, the
  version and tier are condition columns.
- **Timings.** Write durations as numbers with units (`300 ms`), and name the measurement conditions (50 repos,
  cached state, window focused).

## 9. Names, citation and deltas

- **Scenario names are unique within a capability.** They are identifiers, so name the table or the situation (`Pull all eligibility matrix`), never a generic `Works`.
- **Cite a table row by id:** `<capability> :: <scenario> :: R3`.
- **Changes build on each other.** A change that adds requirements to a capability created by an earlier, not yet archived change uses `ADDED` only and states the order in its proposal (`Depends on: <change>`). It never uses `MODIFIED` against a spec that is not in `openspec/specs/` yet.
- **What a delta can and cannot do** (verified with OpenSpec 1.13.0):

| Intent | Delta | Works? |
|---|---|---|
| Change requirement text and keep every scenario | `MODIFIED`, with every scenario copied verbatim | **Yes** |
| Add a scenario or a table | `MODIFIED`, with the old scenarios copied and the new one appended | **Yes** |
| Drop, rename or convert a scenario (for example WHEN/THEN → table) | `MODIFIED` | **No.** Validation fails: "omits scenario(s) the current spec still has" |
| Drop, rename or convert a scenario, keeping the requirement name | `REMOVED` in one change, archive, then `ADDED` in a second change | **Yes** |
| Drop, rename or convert a scenario under a new requirement name | `REMOVED` + `ADDED` in one change, with `> **Supersedes:** <old name>` in the new block | **Yes** |
| `REMOVED` + `ADDED` of the same name in one change | — | **No.** Validation fails: "Requirement present in both ADDED and REMOVED" |
| Add or change `## Purpose` after creation | Any delta | **No.** The Purpose is copied only when the capability is created |

When a change removes or renames behaviour, search `openspec/specs/` for other requirements that mention it and give
each one a `MODIFIED` delta in the same change. Otherwise the synced specs contradict each other. Settings, command ids
and menu titles are the usual cross-references.

## 10. Tables → tasks → tests

For every decision table in a delta, `tasks.md` carries one task that names the table and the test that implements it,
with one case per row:

```markdown
- [ ] 2.3 `Pull all eligibility matrix` (batch-operations) → `test/unit/ffEligibility.test.ts`, one case per R1–R8
```

The test layout follows the proposal's testing strategy (§14) and extension layout (Appendix C):

- **Pure logic** (remote URL parsing, provider detection, profile resolution, templates, ticket and type mapping,
  ff-only eligibility, repo-root scan): a Vitest table-driven test in `test/unit` with `it.each`, one entry per row. The
  row's conditions are the inputs and its outcomes the expected values. These modules import nothing from `vscode`.
- **Provider behaviour** (GraphQL batching and chunking, schema-error fallback, create payloads, user ID resolution,
  ETags, GitLab version and tier differences): a contract test in `test/contract` with Vitest and recorded HTTP
  fixtures (msw), one case per row, asserting the requests sent and the result.
- **Git behaviour and VS Code wiring** (batch operations on real repositories, context keys, menus, Git Graph present
  or missing, settings migration): an integration test in `test/integration` with `@vscode/test-electron`, on
  repositories created in a temp folder with a bare remote, one case per row.
- **Dashboard webview** (keyboard flows, cells, drawer, filter chips): a Playwright test in `test/ui` driving VS Code,
  one case per row.
- **GitLab server compatibility** (push options, Free-tier limits, `merge_when_pipeline_succeeds` vs `auto_merge`): a
  case in the nightly GitLab CE 17.10.0 job.
- **Only verifiable by hand** (Explorer menu visibility across platforms, Source Control selection sync on Windows,
  macOS and Linux): a manual checklist in `tasks.md`, one line per row id.

Test names describe the row in plain words (`skips a repository that is ahead of its upstream`). Do not put the row id
in the test name: the row → test mapping lives in `tasks.md`.

## 11. Review checklist

No lint enforces this standard yet. Before approving a proposal, check each delta against this list.

| Check | What to look for |
|---|---|
| Form | An outcome that depends on two or more conditions is a table, not several WHEN/THEN scenarios (§3) |
| RFC casing | No `SHALL not`, `MUST not`, `Shall`, or normative lowercase `must`/`should`; no keywords in scenarios or cells (§2) |
| Scenario bullets | Every non-table bullet starts with `**GIVEN**`/`**WHEN**`/`**THEN**`/`**AND**` (§5) |
| Scenario names | Unique within the capability; no generic names (§9) |
| Table shape | Header and separator; first column `#`; `R<n>` ids unique and never reused; no blank cells; outcome cells bold (§4) |
| Coverage | Every combination has a row or an explicit `*Any*`/`*N/A*`; short-circuit rows come first (§4) |
| Vague outcomes | No banned phrase in `THEN` lines or outcome cells (§6) |
| Failures | A failure names its job result, the exact notification and buttons, or the unchanged state (§6) |
| Safety | Restricted Mode, destructive actions and token handling state what does not happen (§6) |
| Constraints | Every constraint is exercised by a row or a scenario (§7) |
| Keys | No "the configured …" without the setting key and its default (§8) |
| Change order | A delta against a capability from an unarchived change uses `ADDED` only and names the dependency (§9) |
| Cross-references | Removed or renamed behaviour, settings or commands are not still mentioned by other specs (§9) |
| Non-goals | No `## Non-Goals` section (§1) |
| Tasks | Every table has a task naming its test, with one case per row (§10) |

## Decision log

- 2026-10-08: Adopted from the ReqAnchor spec-writing standard. Kept decision tables, RFC 2119 casing, GIVEN/WHEN/THEN
  bullets, banned vague outcomes, the change-ordering rule and the delta limits, re-verified with OpenSpec 1.13.0.
  Changed for RepoHangar: RepoHangar has no CLI, diagnostic codes or MCP tools, so failures name per-repo job results,
  exact notification text with its buttons, and the state that stays unchanged (no `git` process, no request, refs and
  settings untouched); the condition list and the test mapping follow the proposal's §5–§9 and §14.
