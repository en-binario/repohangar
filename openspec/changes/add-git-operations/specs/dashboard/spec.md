## MODIFIED Requirements

### Requirement: Keyboard navigation
The system SHALL let the user navigate, select, filter, expand and get help in the grid with the keys in the matrix
below, applied to the focused row or group header, and SHALL show a footer with the number of selected rows
(`<n> selected`, hidden when 0), then the key hints of the action keys that other capabilities assign, then the
navigation hints `↑↓ move · Space select · / filter · ⏎ details · ? keys`. The key help overlay SHALL list the keys of
this matrix and every action key.

**Constraints:**
- `1`, `2`, `3`, `4` and `7` toggle **All**, **Dirty**, **Behind**, **Ahead** and **No upstream**; `5` and `6` are kept
  for the Has MR and Pipeline failed chips and do nothing in this version
- Action keys are assigned by other capabilities (`git-operations`: `f` `p` `P` `b` `t` `.`; `batch-operations`: `F`)
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
| R15 | `5` or `6` | *Any* | **No change** |
| R16 | `Esc` | Filter text `bill` or a chip other than All active, 2 selected | **Filter text empty, All active, 2 still selected** |
| R17 | `Esc` | No filter text, All active, 3 selected | **0 selected, footer hidden** |
| R18 | `?` | Focus in the grid | **Key help overlay listing every key of this matrix** |
| R19 | `Esc` | Key help overlay open | **Overlay closed, focus back on the row it came from** |
| R20 | `Esc` | Focus in the filter box with text `bill` | **Filter text empty, focus on the first shown row** |
| R21 | `↓` | Focus in the filter box | **Focus on the first shown row** |
| R22 | `j` | Focus in the filter box with text `bil` | **Filter text `bilj`, focus unchanged** |

#### Scenario: Footer with action keys
- **GIVEN** the dashboard shows the grid, `billing-api` is selected, and `git-operations` and `batch-operations` assign
  their keys
- **WHEN** the footer renders
- **THEN** it reads `1 selected` and `f fetch · p pull · P push · b switch · t terminal · . more · ↑↓ move · Space select · / filter · ⏎ details · ? keys`

