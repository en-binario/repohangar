## MODIFIED Requirements

### Requirement: Grid columns
The system SHALL show the grid with these columns, in this order: a selection checkbox, **Repository**, **Branch**,
**Sync**, **Changes**, **Fetched** and **MR / PR** (`hosting-providers`), and SHALL order groups by name and the rows within a group by repository name,
both case-insensitively.

#### Scenario: Column headers and row order
- **GIVEN** the group `backend` holds `ledger`, `Billing-api` and `auth-service`
- **WHEN** the dashboard shows the grid
- **THEN** the header row reads `Repository`, `Branch`, `Sync`, `Changes`, `Fetched`, `MR / PR` after the checkbox column
- **AND** the rows of `backend` appear in the order `auth-service`, `Billing-api`, `ledger`

### Requirement: Filters
The system SHALL show only the rows that match the filter text and every active chip. The filter text matches a row
when it is a case-insensitive substring of the repository name, the branch name or the group name. The chips are,
in this order, **All**, **Dirty** (the repository is dirty), **Behind** (behind its upstream by at least 1), **Ahead**
(ahead of its upstream by at least 1), **Has MR** (the MR / PR cell shows an open review, loaded or cached),
**Pipeline ✗** (that review's pipeline or checks show `✗ failed`) and **No upstream** (HEAD on a branch with no
upstream). Each chip label SHALL end with the number of rows that match that chip alone (`Dirty 3`, `Has MR 5`). **All** is active when no other chip is; activating **All**
SHALL clear the other chips. Filtering MUST NOT change the selection.

#### Scenario: Chip membership matrix

| # | Row state | Dirty | Behind | Ahead | No upstream |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Branch with upstream, `—` in Sync, `—` in Changes | **No** | **No** | **No** | **No** |
| R2 | Branch with upstream, `↑2`, `●3 +1` | **Yes** | **No** | **Yes** | **No** |
| R3 | Branch with upstream, `↓4`, `—` in Changes | **No** | **Yes** | **No** | **No** |
| R4 | Branch with upstream, `↑1 ↓1`, `—` in Changes | **No** | **Yes** | **Yes** | **No** |
| R5 | Branch without upstream, `⇡ publish`, `?2` | **Yes** | **No** | **No** | **Yes** |
| R6 | Detached HEAD, `—` in Changes | **No** | **No** | **No** | **No** |
| R7 | `REBASING 3/7`, `⚠ 2 confl` | **Yes** | **No** | **No** | **No** |
| R8 | Branch with upstream, `—` in Changes, `≡2` | **No** | **No** | **No** | **No** |

#### Scenario: Filter combination matrix

Row under test: `billing-api` in group `backend`, branch `feature/ABC-12-notes`, `↑2`, `●3 +1`.

| # | Filter text | Active chips | `billing-api` |
| :--- | :--- | :--- | :--- |
| R1 | Empty | All | **Shown** |
| R2 | `bill` | All | **Shown** |
| R3 | `abc-12` | All | **Shown** |
| R4 | `BACKEND` | All | **Shown** |
| R5 | `ledger` | All | **Hidden** |
| R6 | Empty | Dirty | **Shown** |
| R7 | Empty | Dirty, Ahead | **Shown** |
| R8 | Empty | Dirty, Behind | **Hidden** |
| R9 | `bill` | Behind | **Hidden** |

#### Scenario: Selection kept while filtering
- **GIVEN** `billing-api` and `ledger` are selected and the footer reads `2 selected`
- **WHEN** the user types `bill` in the filter box
- **THEN** only `billing-api` is shown and the footer still reads `2 selected`

#### Scenario: Review chip membership matrix

| # | MR / PR cell | Has MR | Pipeline ✗ |
| :--- | :--- | :--- | :--- |
| R1 | `!142  Draft  ⟳ running` | **Yes** | **No** |
| R2 | `#311  ✗ failed  changes requested` | **Yes** | **Yes** |
| R3 | `!88  ✓ passed  2/2`, not refreshed | **Yes** | **No** |
| R4 | `!57  ✗ failed`, not refreshed | **Yes** | **Yes** |
| R5 | `—` | **No** | **No** |
| R6 | `Sign in`, `?` or `…` | **No** | **No** |

### Requirement: Keyboard navigation
The system SHALL let the user navigate, select, filter, expand and get help in the grid with the keys in the matrix
below, applied to the focused row or group header, and SHALL show a footer with the number of selected rows
(`<n> selected`, hidden when 0), then the key hints of the action keys that other capabilities assign, then the
navigation hints `↑↓ move · Space select · / filter · ⏎ details · ? keys`. The key help overlay SHALL list the keys of
this matrix and every action key.

**Constraints:**
- `1` to `7` toggle **All**, **Dirty**, **Behind**, **Ahead**, **Has MR**, **Pipeline ✗** and **No upstream**
- Action keys are assigned by other capabilities (`git-operations`: `f` `p` `P` `b` `t` `.`; `batch-operations`: `F`;
  `hosting-providers`: `o`)
- Keys that neither this matrix nor another capability assigns do nothing while the grid has focus

#### Scenario: Grid key matrix

| # | Key | State before | Result |
| :--- | :--- | :--- | :--- |
| R1 | `↓` or `j` | Focus on a row or header that is not the last shown | **Focus on the next shown row or group header** |
| R2 | `↓` or `j` | Focus on the last shown row | **Focus unchanged** |
| R3 | `↑` or `k` | Focus on a row or header that is not the first shown | **Focus on the previous shown row or group header** |
| R4 | `↑` or `k` | Focus on the first shown row or header | **Focus unchanged** |
| R5 | `Space` | Focused row not selected, 0 selected | **Row selected, checkbox checked, footer `1 selected`** |
| R6 | `Space` | Focused row selected, 1 selected | **Row not selected, footer hidden** |
| R7 | `Ctrl+A` (`Cmd+A` on macOS) | Filter `bill` shows 2 of 14 rows, 0 selected | **The 2 shown rows selected, footer `2 selected`** |
| R8 | `/` | Focus in the grid | **Keyboard focus in the filter box** |
| R9 | `Enter` | Focus on a row with closed details | **Row details open below the row** |
| R10 | `Enter` | Focus on a row with open details | **Row details closed** |
| R11 | `Enter` | Focus on an expanded group header | **Group collapsed** |
| R12 | `2` | Dirty chip inactive | **Dirty chip active** |
| R13 | `2` | Dirty chip active, no other chip | **All active** |
| R14 | `1` | Dirty and Ahead chips active | **All active, Dirty and Ahead inactive** |
| R16 | `Esc` | Filter text `bill` or a chip other than All active, 2 selected | **Filter text empty, All active, 2 still selected** |
| R17 | `Esc` | No filter text, All active, 3 selected | **0 selected, footer hidden** |
| R18 | `?` | Focus in the grid | **Key help overlay listing every key of this matrix** |
| R19 | `Esc` | Key help overlay open | **Overlay closed, focus back on the row it came from** |
| R20 | `Esc` | Focus in the filter box with text `bill` | **Filter text empty, focus on the first shown row** |
| R21 | `↓` | Focus in the filter box | **Focus on the first shown row** |
| R22 | `j` | Focus in the filter box with text `bil` | **Filter text `bilj`, focus unchanged** |
| R23 | `5` | Has MR chip inactive | **Has MR chip active** |
| R24 | `6` | Pipeline ✗ chip inactive | **Pipeline ✗ chip active** |

#### Scenario: Footer with action keys
- **GIVEN** the dashboard shows the grid, `billing-api` is selected, and `git-operations` and `batch-operations` assign
  their keys
- **WHEN** the footer renders
- **THEN** it reads `1 selected` and `f fetch · p pull · P push · b switch · t terminal · . more · ↑↓ move · Space select · / filter · ⏎ details · ? keys`
