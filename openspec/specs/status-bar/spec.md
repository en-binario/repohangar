# status-bar Specification

## Purpose

The RepoHangar status bar item: a one-line summary of how many repositories are listed, how many are behind and how many
are dirty, with a tooltip that names them and a click that opens the dashboard.

**Non-goals:**
- The open merge request count segment (`!5`), owned by `hosting-providers`.
- What makes a repository dirty or behind, defined by `dashboard` (Changes and Sync cells).

## Requirements

### Requirement: Status bar summary text
The system SHALL show a status bar item on the left with `$(git-branch) <n> repos` (`repo` when there is 1), followed by
`$(arrow-down)<b>` when `<b>` repositories are behind their upstream by at least 1, `$(circle-filled)<d>` when `<d>`
repositories are dirty and `$(git-pull-request)<m>` when the MR / PR cells of `<m>` repositories show an open review,
loaded or cached (`hosting-providers`), each segment separated by two spaces and left out when its count is 0. The item SHALL be hidden
when `repohangar.statusBar.enabled` (default `true`) is `false` or no repository is listed, and SHALL follow a change of
that setting without a window reload.

**Constraints:**
- The item updates within 250 ms of the row change that alters a count

#### Scenario: Status bar text matrix

| # | `repohangar.statusBar.enabled` | Repositories | Behind | Dirty | Status bar item |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `false` | *Any* | *Any* | *Any* | **Hidden** |
| R2 | `true` | 0 | *N/A* | *N/A* | **Hidden** |
| R3 | `true` | 1 | 0 | 0 | **`$(git-branch) 1 repo`** |
| R4 | `true` | 14 | 0 | 0 | **`$(git-branch) 14 repos`** |
| R5 | `true` | 14 | 3 | 0 | **`$(git-branch) 14 repos  $(arrow-down)3`** |
| R6 | `true` | 14 | 0 | 2 | **`$(git-branch) 14 repos  $(circle-filled)2`** |
| R7 | `true` | 14 | 3 | 2 | **`$(git-branch) 14 repos  $(arrow-down)3  $(circle-filled)2`** |

#### Scenario: Counts follow a repository change
- **GIVEN** the item reads `$(git-branch) 14 repos  $(circle-filled)2`
- **WHEN** the user stages and commits every change in one of the 2 dirty repositories, which stays level with nothing
  behind
- **THEN** within 250 ms of its row update the item reads `$(git-branch) 14 repos  $(circle-filled)1`

#### Scenario: Setting turned off while the window is open
- **GIVEN** the item is shown
- **WHEN** the user sets `repohangar.statusBar.enabled` to `false` at user scope
- **THEN** the item is hidden without a window reload

#### Scenario: Open review segment matrix

| # | Repositories | Behind | Dirty | Repositories with an open review | Status bar item |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | 14 | 3 | 2 | 5 | **`$(git-branch) 14 repos  $(arrow-down)3  $(circle-filled)2  $(git-pull-request)5`** |
| R2 | 14 | 0 | 0 | 1 | **`$(git-branch) 14 repos  $(git-pull-request)1`** |
| R3 | 14 | 0 | 2 | 0, and 3 cells read `Sign in` | **`$(git-branch) 14 repos  $(circle-filled)2`** |

### Requirement: Status bar tooltip
The system SHALL show as the item's tooltip the line `RepoHangar: <n> repositories` (`repository` when there is 1),
then a line `Behind: ` with the behind repositories and their `↓<b>` count, then a line `Dirty: ` with the dirty
repositories, then a line `Open MR/PR: ` with the repositories whose MR / PR cell shows an open review and its
reference (`billing-api !142`), each list ordered by repository name and separated by `, `, leaving out a line whose list is empty. When
no repository is behind or dirty, the second line SHALL read `All repositories are clean and up to date.` The item's
accessible label SHALL read `RepoHangar: <n> repositories, <b> behind, <d> with changes`, followed by
`, <m> with an open MR or PR` when `<m>` is at least 1.

**Constraints:**
- At most 10 names per line, then `and <k> more`

#### Scenario: Status bar tooltip matrix

| # | Behind | Dirty | Tooltip |
| :--- | :--- | :--- | :--- |
| R1 | None | None | **`RepoHangar: 14 repositories` ⏎ `All repositories are clean and up to date.`** |
| R2 | `notifications` ↓1, `ledger` ↓4 | None | **`RepoHangar: 14 repositories` ⏎ `Behind: ledger ↓4, notifications ↓1`** |
| R3 | None | `web-shop`, `billing-api` | **`RepoHangar: 14 repositories` ⏎ `Dirty: billing-api, web-shop`** |
| R4 | `ledger` ↓4 | `billing-api` | **`RepoHangar: 14 repositories` ⏎ `Behind: ledger ↓4` ⏎ `Dirty: billing-api`** |
| R5 | 12 repositories `svc-01` … `svc-12`, each ↓1 | None | **`RepoHangar: 14 repositories` ⏎ `Behind: svc-01 ↓1, svc-02 ↓1, svc-03 ↓1, svc-04 ↓1, svc-05 ↓1, svc-06 ↓1, svc-07 ↓1, svc-08 ↓1, svc-09 ↓1, svc-10 ↓1 and 2 more`** |

#### Scenario: Accessible label
- **GIVEN** 14 repositories are listed, 3 are behind and 2 are dirty
- **WHEN** a screen reader reads the status bar item
- **THEN** it reads `RepoHangar: 14 repositories, 3 behind, 2 with changes`

#### Scenario: Tooltip and label with open reviews
- **GIVEN** 14 repositories are listed, `ledger` is ↓4 behind, `billing-api` is dirty, and the MR / PR cells of
  `web-shop` and `billing-api` show `#311` and `!142`
- **WHEN** the user hovers over the status bar item
- **THEN** the tooltip reads `RepoHangar: 14 repositories` ⏎ `Behind: ledger ↓4` ⏎ `Dirty: billing-api` ⏎
  `Open MR/PR: billing-api !142, web-shop #311`
- **AND** the accessible label reads `RepoHangar: 14 repositories, 1 behind, 1 with changes, 2 with an open MR or PR`

### Requirement: Status bar click
The system SHALL run `repohangar.open` when the user clicks the status bar item.

#### Scenario: Click opens the dashboard
- **GIVEN** the item is shown and no dashboard panel is open
- **WHEN** the user clicks the item
- **THEN** the dashboard panel titled `RepoHangar` opens and is the active tab
