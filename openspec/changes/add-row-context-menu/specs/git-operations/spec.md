## ADDED Requirements

### Requirement: Row context menu
The system SHALL open, on a right-click anywhere on a repository row (its cells, badges, buttons, links and checkbox),
the more-actions menu of that row (**Row more-actions menu**: the same groups, items, enabled state and keys as the
`⋯` button and the `.` key) in place of the webview's default **Cut / Copy / Paste** menu, with its top-left corner at
the pointer and moved left or up so that it stays inside the dashboard. The right-click SHALL focus the row and SHALL
leave the selection unchanged, and the chosen item SHALL act on that row only. A right-click on another repository row
while a menu is open SHALL close it and open the menu of that row; a right-click inside an open menu SHALL do nothing.
The filter box, the row details, group header rows, the MR drawer and the profile editor SHALL keep the default menu.

**Constraints:**
- The menu that a right-click opens is operable with `↑`, `↓`, `Enter` and `Esc`, like the one the `⋯` button opens
- No keyboard trigger is added; `.` stays the key for the menu

#### Scenario: Right-click target matrix

| # | Right-click on | Menu open before | Menu shown | Focused row | Default menu |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Inside the open menu of `billing-api` | `billing-api` | **The menu of `billing-api`, unchanged** | **`billing-api`** | **Not shown** |
| R2 | The Branch cell of `billing-api` | None | **The menu of `billing-api` at the pointer** | **`billing-api`** | **Not shown** |
| R3 | The repository name of `billing-api` | None | **The menu of `billing-api` at the pointer** | **`billing-api`** | **Not shown** |
| R4 | The MR link `!2` of `ledger` | None | **The menu of `ledger` at the pointer** | **`ledger`** | **Not shown** |
| R5 | The Changes cell of `ledger` | `billing-api` | **The menu of `ledger` at the pointer; the menu of `billing-api` closed** | **`ledger`** | **Not shown** |
| R6 | The group header `FIRMA-ELECTRONICA (5)` | None | **None** | **Unchanged** | **Shown** |
| R7 | A line of the row details of `billing-api` | None | **None** | **Unchanged** | **Shown** |
| R8 | The filter box | None | **None** | **Unchanged** | **Shown** |

#### Scenario: Copy path from the right-click menu
- **GIVEN** `billing-api` and `ledger` are selected and the focus is on `web-shop`
- **WHEN** the user right-clicks the Fetched cell of `billing-api`
- **AND WHEN** the user clicks **Copy path**
- **THEN** the clipboard holds the root path of `billing-api`, the menu is closed, the focus is on `billing-api`
- **AND** `billing-api` and `ledger` are still selected

#### Scenario: Menu near the right edge
- **GIVEN** the dashboard is 1000 px wide and the menu is 240 px wide
- **WHEN** the user right-clicks a row at 900 px from the left edge
- **THEN** the right edge of the menu is at or left of the right edge of the dashboard and the whole menu is visible

#### Scenario: Disabled items as from the `⋯` button
- **GIVEN** `infra-charts` is clean with 0 stashes on a detached HEAD
- **WHEN** the user right-clicks its row
- **THEN** **Stash changes**, **Pop latest stash**, **Discard all changes…** and **Copy branch name** are disabled
