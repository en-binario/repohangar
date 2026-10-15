## MODIFIED Requirements

### Requirement: Opening the dashboard
The system SHALL open the dashboard as a webview panel titled `RepoHangar` in the active editor group, with its tab
pinned, from the command `repohangar.open` (*RepoHangar: Open Dashboard*), the default keybinding `Ctrl+Alt+H`
(`Ctrl+Cmd+H` on macOS), and the **Open RepoHangar** button (`$(layout)`) in the Source Control view title bar
(`scm/title`). The system MUST keep at most one dashboard panel per window: when one exists, these entry points SHALL
reveal it instead of creating another, including a dashboard tab restored after a window reload whose webview VS Code
has not restored yet, and a second dashboard panel that VS Code restores while one exists SHALL be closed.

#### Scenario: Open the dashboard when none is open
- **GIVEN** no dashboard panel exists in the window
- **WHEN** the user runs `repohangar.open` from the command palette
- **THEN** a panel titled `RepoHangar` opens in the active editor group
- **AND** its tab is pinned

#### Scenario: Open the dashboard when it is already open
- **GIVEN** the dashboard panel exists in a background tab
- **WHEN** the user presses `Ctrl+Alt+H`
- **THEN** the existing panel becomes the active tab
- **AND** the window has one dashboard panel

#### Scenario: Open from the Source Control title bar
- **GIVEN** the Source Control view is visible
- **WHEN** the user clicks **Open RepoHangar** in its title bar
- **THEN** `repohangar.open` runs and the dashboard panel is the active tab

#### Scenario: Dashboard tab matrix

| # | Dashboard tabs before | Webview restored by VS Code | Event | Dashboard tabs after | Active tab |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | None | *N/A* | The user runs `repohangar.open` | **1, new, in the active editor group** | **The new dashboard tab** |
| R2 | 1, in a background tab of the active editor group | Yes | The user presses `Ctrl+Alt+H` | **1** | **That tab** |
| R3 | 1, in a background tab of the active editor group, after a window reload | No | The user presses `Ctrl+Alt+H` | **1** | **That tab** |
| R4 | 1, in a background tab of another editor group, after a window reload | No | The user runs `repohangar.open` | **1, in that editor group** | **That tab** |
| R5 | 1, with its webview shown | Yes | VS Code restores a second dashboard panel | **1; the second panel is closed** | **The first dashboard tab** |

## ADDED Requirements

### Requirement: Dashboard height
The dashboard SHALL fill the height of its panel and SHALL show a vertical scrollbar only when the toolbar, the batch
result panel, the grid and the footer together are taller than the panel, also when the grid is wider than the panel
and the panel shows a horizontal scrollbar. The footer SHALL stay at the bottom of the panel when the rows fit.

#### Scenario: Rows that fit the panel
- **GIVEN** the filter `stashed` leaves 2 rows in a window 1000 px high
- **WHEN** the grid is rendered
- **THEN** the page's `scrollHeight` equals its `clientHeight` and the panel shows no vertical scrollbar
- **AND** the bottom edge of the footer is 12 px above the bottom edge of the panel's visible area

#### Scenario: Rows that fit a panel narrower than the grid
- **GIVEN** the filter `stashed` leaves 2 rows in a window 1000 px high whose panel is narrower than the grid's minimum
  width
- **WHEN** the grid is rendered
- **THEN** the panel shows a horizontal scrollbar
- **AND** the page's `scrollHeight` equals its `clientHeight` and the panel shows no vertical scrollbar

#### Scenario: Rows taller than the panel
- **GIVEN** the dashboard shows every row of the 14 repositories in a window 400 px high
- **WHEN** the grid is rendered
- **THEN** the page's `scrollHeight` is greater than its `clientHeight` and the panel shows a vertical scrollbar
- **AND** the footer is visible at the bottom edge of the panel
