## ADDED Requirements

### Requirement: Grid columns and row order
> **Supersedes:** Grid columns

The system SHALL show the grid with these columns, in this order: a selection checkbox, **Repository**, **Branch**,
**Sync**, **Changes**, **Fetched** and **MR / PR** (`hosting-providers`). It SHALL order groups by name,
case-insensitively, whatever the sort, and SHALL order the rows within a group (or every row with the grouping mode
`none`) by the sort chosen with **Sort by column**. The default sort is **Repository** ascending: repository name,
case-insensitive. The header of the sorted column SHALL end with `▲` (ascending) or `▼` (descending) and carry
`aria-sort` `ascending` or `descending`; every other column header SHALL carry no arrow and no `aria-sort`.

#### Scenario: Column headers and default row order
- **GIVEN** no sort was chosen in this workspace and the group `backend` holds `ledger`, `Billing-api` and
  `auth-service`
- **WHEN** the dashboard shows the grid
- **THEN** the header row reads `Repository ▲`, `Branch`, `Sync`, `Changes`, `Fetched`, `MR / PR` after the checkbox
  column, and the Repository header has `aria-sort="ascending"`
- **AND** the rows of `backend` appear in the order `auth-service`, `Billing-api`, `ledger`

#### Scenario: Groups keep their order under a sort
- **GIVEN** the groups `backend`, `frontend` and `infra`, and the sort is **Sync** descending
- **WHEN** the dashboard shows the grid
- **THEN** the group headers appear in the order `backend`, `frontend`, `infra`
- **AND** each group's rows appear in Sync descending order under its own header

### Requirement: Sort by column
The system SHALL sort the rows when the user clicks the label of a column header (**Repository**, **Branch**, **Sync**,
**Changes**, **Fetched** or **MR / PR**), using the sort key of that column. The first click on a column that is not
the sorted one SHALL sort by it in its first direction; a click on the sorted column in its first direction SHALL
reverse it; a click on the sorted column in its reversed direction SHALL restore the default sort (**Repository**
ascending). Because the default is Repository in its first direction, a click on Repository while the default holds
sorts it descending. Rows whose sort keys are equal SHALL be ordered by repository name
ascending, case-insensitive, in both directions. Sorting MUST NOT change the selection, the filter, the chips, the
collapsed groups or which rows are shown, and a click on the selection column header MUST NOT change the sort.

**Constraints:**
- Sort keys and first directions:
  - **Repository**: the repository name, case-insensitive; first direction ascending (A→Z)
  - **Branch**: the Branch cell text without the `no upstream` badge (`REBASING 3/7`, `detached a1b2c3d`,
    `feature/ABC-12-notes`), case-insensitive; first direction ascending (A→Z)
  - **Sync**: the behind count, then the ahead count, then `⇡ publish` above `—`; a row whose Sync cell is `—` counts 0
    behind and 0 ahead; first direction descending (most behind first)
  - **Changes**: the conflict count, then the number of unstaged, staged and untracked files together, then the stash
    count; first direction descending (most first)
  - **Fetched**: the age of the last fetch, with `never` older than any age; first direction descending (oldest first)
  - **MR / PR**: the cell's rank, from most to least urgent: a review with `✗ failed`; a review with `⟳ running`,
    `◷ pending` or `◷ manual`; a review with `⊘ canceled`; a review with `✓ passed`; a review with no pipeline or
    checks; `Sign in`, `?` or `…`; `—`; first direction descending (most urgent first)
- Rows are sorted by the values they show at the time, also while a value comes from the review cache

#### Scenario: Sort cycle matrix

| # | Sort before | Click on the header | Sort after | Headers after |
| :--- | :--- | :--- | :--- | :--- |
| R1 | Repository ▲ (default) | Sync | **Sync descending** | **`Sync ▼`; `Repository` without arrow** |
| R2 | Sync descending | Sync | **Sync ascending** | **`Sync ▲`** |
| R3 | Sync ascending | Sync | **Repository ascending (default)** | **`Repository ▲`; `Sync` without arrow** |
| R4 | Sync descending | Changes | **Changes descending** | **`Changes ▼`; `Sync` without arrow** |
| R5 | Repository ▲ (default) | Repository | **Repository descending** | **`Repository ▼`** |
| R6 | Repository descending | Repository | **Repository ascending (default)** | **`Repository ▲`** |
| R7 | Repository ▲ (default) | Branch | **Branch ascending** | **`Branch ▲`** |
| R8 | Branch ascending | Branch | **Branch descending** | **`Branch ▼`** |
| R9 | Branch descending | Branch | **Repository ascending (default)** | **`Repository ▲`** |
| R10 | Repository ▲ (default) | Fetched | **Fetched descending** | **`Fetched ▼`** |
| R11 | Repository ▲ (default) | MR / PR | **MR / PR descending** | **`MR / PR ▼`** |
| R12 | Sync descending | The selection column header (its checkbox or around it) | **Sync descending** | **`Sync ▼`** |

#### Scenario: Sort order matrix

Rows of the group `backend` under test:

| Repository | Branch cell | Sync | Changes | Fetched | MR / PR |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `auth-service` | `main` | `—` | `—` | `2 h ⚠` | `—` |
| `billing-api` | `feature/ABC-12-notes` | `↑2` | `●3 +1` | `now` | `!142  Draft  ⟳ running` |
| `ledger` | `REBASING 3/7` | `—` | `⚠ 2 confl` | `never` | `Sign in` |
| `notifications` | `fix/login-timeout` with the badge `no upstream` | `⇡ publish` | `?2 ≡1` | `4 min` | `—` |
| `payments-api` | `main` | `↓4` | `≡2` | `1 d ⚠` | `#311  ✗ failed  changes requested` |

| # | Sort | Rows of `backend`, top to bottom |
| :--- | :--- | :--- |
| R1 | Repository ascending | **`auth-service`, `billing-api`, `ledger`, `notifications`, `payments-api`** |
| R2 | Repository descending | **`payments-api`, `notifications`, `ledger`, `billing-api`, `auth-service`** |
| R3 | Branch ascending | **`billing-api`, `notifications`, `auth-service`, `payments-api`, `ledger`** |
| R4 | Branch descending | **`ledger`, `auth-service`, `payments-api`, `notifications`, `billing-api`** |
| R5 | Sync descending | **`payments-api`, `billing-api`, `notifications`, `auth-service`, `ledger`** |
| R6 | Sync ascending | **`auth-service`, `ledger`, `notifications`, `billing-api`, `payments-api`** |
| R7 | Changes descending | **`ledger`, `billing-api`, `notifications`, `payments-api`, `auth-service`** |
| R8 | Changes ascending | **`auth-service`, `payments-api`, `notifications`, `billing-api`, `ledger`** |
| R9 | Fetched descending | **`ledger`, `payments-api`, `auth-service`, `notifications`, `billing-api`** |
| R10 | Fetched ascending | **`billing-api`, `notifications`, `auth-service`, `payments-api`, `ledger`** |
| R11 | MR / PR descending | **`payments-api`, `billing-api`, `ledger`, `auth-service`, `notifications`** |
| R12 | MR / PR ascending | **`auth-service`, `notifications`, `ledger`, `billing-api`, `payments-api`** |

#### Scenario: Sorting keeps selection, filter and focus
- **GIVEN** the filter text `a`, the Dirty chip active, `billing-api` and `ledger` selected, and the focus on
  `billing-api`
- **WHEN** the user clicks the **Changes** header
- **THEN** the filter box still reads `a`, the Dirty chip is still active and the footer still reads `2 selected`
- **AND** the focus is still on `billing-api`

#### Scenario: A row moves when its sort key changes
- **GIVEN** the sort is **Sync** descending, `payments-api` (`↓4`) is the first row of `backend`, `ledger` shows `—`,
  and the focus is on `payments-api`
- **WHEN** a fetch in `ledger` makes its Sync cell read `↓6`
- **THEN** within 1 s `ledger` is the first row of `backend` and `payments-api` the second
- **AND** the focus is still on `payments-api` and the selection is unchanged

### Requirement: Sort from the keyboard
The system SHALL move keyboard focus to the header of the sorted column when the user presses `S` while the grid has
focus. While a column header has focus, `←` and `→` SHALL move focus to the previous or next sortable column header,
`Enter` or `Space` SHALL act as a click on the focused header (**Sort by column**), and `↓` or `Esc` SHALL move focus
back to the row or group header that had it before `S`, leaving the filter text, the chips and the selection unchanged.
The key help overlay SHALL list `S` with the text `Sort by a column (then ← → and Enter)`.

#### Scenario: Header key matrix

| # | Key | State before | Result |
| :--- | :--- | :--- | :--- |
| R1 | `S` | Focus on the row `ledger`, sort Repository ascending | **Focus on the `Repository ▲` header** |
| R2 | `S` | Focus on the row `ledger`, sort Changes descending | **Focus on the `Changes ▼` header** |
| R3 | `→` | Focus on the Repository header | **Focus on the Branch header** |
| R4 | `→` | Focus on the MR / PR header | **Focus unchanged** |
| R5 | `←` | Focus on the Repository header | **Focus unchanged** |
| R6 | `Enter` | Focus on the Sync header, sort Repository ascending | **Sort Sync descending; focus stays on `Sync ▼`** |
| R7 | `Space` | Focus on the `Sync ▼` header | **Sort Sync ascending; focus stays on `Sync ▲`** |
| R8 | `↓` | Focus on a header, reached with `S` from the row `ledger` | **Focus on the row `ledger`** |
| R9 | `Esc` | Focus on a header, reached with `S` from the row `ledger`, filter text `bill`, 2 selected | **Focus on the row `ledger`; filter text `bill`, 2 still selected** |
| R10 | `S` | Focus in the filter box with text `bil` | **Filter text `bilS`, focus unchanged** |
| R11 | `↓` | Focus on a header, reached with `S` from a row that is no longer shown (its group was collapsed with the mouse) | **Focus on the first shown row or group header** |

### Requirement: Sort remembered per workspace
The system SHALL remember the chosen sort column and direction for the workspace in workspace state, restore it when
the dashboard opens and after a window reload, and keep it when the grouping mode changes. Choosing a sort MUST NOT
write any setting.

#### Scenario: Sort kept across a reload and a reopen
- **GIVEN** the user sorted by **Fetched** descending
- **WHEN** the user reloads the window
- **THEN** the header reads `Fetched ▼` and the rows are in Fetched descending order
- **AND WHEN** the user closes the dashboard and runs `repohangar.open`
- **THEN** the header still reads `Fetched ▼`

#### Scenario: Sort kept when the grouping changes
- **GIVEN** the sort is **Changes** descending and the Group menu reads `Folder`
- **WHEN** the user picks `None` in the Group menu
- **THEN** the grid has no group headers and every row is in Changes descending order
- **AND** no setting is written

### Requirement: Group selection
The system SHALL show, in the selection column of every group header, a checkbox over the rows that header counts (the
rows of the group that match the filter text and every active chip, also while the group is collapsed). The checkbox
SHALL be checked when every one of those rows is selected, mixed (`aria-checked="mixed"`, drawn as `−`) when some are,
and unchecked when none are. A click on it, or `Space` on the focused group header, SHALL select every one of those
rows when the checkbox is unchecked or mixed, and SHALL clear every one of them when it is checked. It MUST NOT change
the selection of rows in other groups or of rows the filters hide, MUST NOT collapse or expand the group, and MUST NOT
move the focus. A click on the group name still collapses or expands the group. The checkbox's accessible name SHALL be
`Select group <group>`. The key help overlay SHALL list `Space` with the text `Select or clear the focused row, or every
row of the focused group`.

#### Scenario: Group checkbox matrix

Group under test: `backend` holds `auth-service`, `billing-api`, `ledger`, `notifications` and `payments-api`. Rows in
other groups are not selected.

| # | Filter text | Group collapsed | Rows `backend` counts | Of them selected before | Selected rows of `backend` the filter hides | Checkbox before | After a click or `Space` on the header | Checkbox after | Footer after |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Empty | No | 5 | 0 | 0 | **Unchecked** | **All 5 selected** | **Checked** | **`5 selected`** |
| R2 | Empty | No | 5 | 2 | 0 | **Mixed `−`** | **All 5 selected** | **Checked** | **`5 selected`** |
| R3 | Empty | No | 5 | 5 | 0 | **Checked** | **None of the 5 selected** | **Unchecked** | **Hidden** |
| R4 | Empty | Yes | 5 | 0 | 0 | **Unchecked** | **All 5 selected; header still `▸ backend (5)`** | **Checked** | **`5 selected`** |
| R5 | `api` | No | 2 (`billing-api`, `payments-api`) | 0 | 1 (`ledger`) | **Unchecked** | **`billing-api` and `payments-api` selected; `ledger` still selected** | **Checked** | **`3 selected`** |
| R6 | `api` | No | 2 (`billing-api`, `payments-api`) | 2 | 1 (`ledger`) | **Checked** | **`billing-api` and `payments-api` not selected; `ledger` still selected** | **Unchecked** | **`1 selected`** |

#### Scenario: Group checkbox leaves other groups alone
- **GIVEN** the group `frontend` counts `checkout-ui` and `web-shop`, `web-shop` is selected, and no row of `backend` is
  selected
- **WHEN** the user clicks the checkbox of the `backend` header
- **THEN** every row `backend` counts is selected, `web-shop` is still selected and `checkout-ui` is not
- **AND** the `frontend` header checkbox is still mixed `−`

#### Scenario: Group name click still collapses
- **GIVEN** the group `infra` is expanded and none of its rows is selected
- **WHEN** the user clicks the text `▾ infra (7)` of its header
- **THEN** the header reads `▸ infra (7)` and its checkbox is still unchecked
- **AND** the footer is hidden

#### Scenario: Selection changes update the group checkbox
- **GIVEN** the group `backend` counts 5 rows and its checkbox is checked
- **WHEN** the user presses `Space` on the row `ledger`
- **THEN** `ledger` is not selected and the `backend` checkbox is mixed `−`

### Requirement: Select all matching rows from the column header
The system SHALL show a checkbox in the header of the selection column over every row that matches the filter text and
every active chip, also in collapsed groups. It SHALL be checked when every one of those rows is selected, mixed
(`aria-checked="mixed"`, drawn as `−`) when some are, unchecked when none are, and disabled when no row matches. A click
SHALL select every one of those rows when it is unchecked or mixed, and SHALL clear every one of them when it is
checked, leaving the selection of rows the filters hide unchanged. Its accessible name SHALL be
`Select all matching repositories`.

#### Scenario: Select-all checkbox matrix

Workspace under test: 14 repositories.

| # | Filter text | Rows that match | Of them selected before | Selected rows the filter hides | Checkbox before | After a click | Footer after |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Empty | 14 | 0 | 0 | **Unchecked** | **All 14 selected** | **`14 selected`** |
| R2 | Empty | 14 | 5 | 0 | **Mixed `−`** | **All 14 selected** | **`14 selected`** |
| R3 | Empty | 14 | 14 | 0 | **Checked** | **None selected** | **Hidden** |
| R4 | `bill` | 2 | 0 | 1 | **Unchecked** | **The 2 matching rows selected; the hidden one still selected** | **`3 selected`** |
| R5 | `bill` | 2 | 2 | 1 | **Checked** | **The 2 matching rows not selected; the hidden one still selected** | **`1 selected`** |
| R6 | `zzz` | 0 | 0 | 3 | **Disabled** | **Selection unchanged** | **`3 selected`** |
| R7 | Empty, the group `infra` (7 rows) collapsed | 14 | 0 | 0 | **Unchecked** | **All 14 selected, the 7 of `infra` included** | **`14 selected`** |

### Requirement: Range selection with Shift+click
The system SHALL keep a selection anchor: the last row whose checkbox the user clicked without Shift or whose
selection the user toggled with `Space`. A Shift+click on a row's checkbox SHALL select every row shown in the grid
from the anchor through the clicked row, in the grid's current order, skipping group headers and the rows of collapsed
groups, and leaving the anchor where it was. Shift+click MUST NOT clear any selected row. When there is no anchor, or
the anchor row is not shown in the grid, a Shift+click SHALL toggle only the clicked row and make it the anchor.

#### Scenario: Range selection matrix

Grid under test, top to bottom: header `backend` with `auth-service`, `billing-api`, `ledger`, `notifications`; header
`infra`, collapsed, with 7 rows; header `tools` with `scratch`. No other row is selected unless stated.

| # | Anchor | Shift+click on the checkbox of | Selected before | Selected after | Anchor after |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | None | `ledger` | None | **`ledger`** | **`ledger`** |
| R2 | `billing-api` | `notifications` | `billing-api` | **`billing-api`, `ledger`, `notifications`** | **`billing-api`** |
| R3 | `notifications` | `auth-service` | `notifications` | **`auth-service`, `billing-api`, `ledger`, `notifications`** | **`notifications`** |
| R4 | `billing-api` | `scratch` | `billing-api` | **`billing-api`, `ledger`, `notifications`, `scratch`; no row of `infra`** | **`billing-api`** |
| R5 | `billing-api` | `notifications` | `billing-api`, `notifications` | **`billing-api`, `ledger`, `notifications`** | **`billing-api`** |
| R6 | `billing-api`, set by `Space` and then deselected | `ledger` | None | **`billing-api`, `ledger`** | **`billing-api`** |
| R7 | `ledger`, now hidden by the filter text `api` | `billing-api` | `ledger` | **`billing-api`, `ledger`** | **`billing-api`** |

## REMOVED Requirements

### Requirement: Grid columns
**Reason**: The row order within a group is no longer fixed to the repository name, and the header of the sorted
column now ends with `▲` or `▼`, so the scenario `Column headers and row order` no longer holds as written.
**Migration**: Replaced by **Grid columns and row order** (same columns in the same order, groups still by name, the
default row order still by repository name) and **Sort by column**.
