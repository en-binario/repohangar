## MODIFIED Requirements

### Requirement: Row action keys
The system SHALL run on the focused row: `f` Fetch, `p` Pull, `P` Push or Publish, `b` Switch Branch…, `t` Open
Terminal and `.` the more-actions menu. With rows selected, `P`, `t` and `.` still act on the focused row only, and `b` switches
the selected repositories (`batch-operations`).
The footer SHALL show the hints `f fetch · p pull · P push · b switch · t terminal · . more` before the navigation
hints, and the key help overlay SHALL list these keys.

**Constraints:**
- `f`, `p` and `b` on a selection belong to `batch-operations`

#### Scenario: Push key with rows selected
- **GIVEN** `billing-api` and `ledger` are selected and the focus is on `web-shop`, 1 commit ahead
- **WHEN** the user presses `P`
- **THEN** `repository.push()` runs for `web-shop` only

#### Scenario: Switch key with no row selected
- **GIVEN** no row is selected and the focus is on `ledger`
- **WHEN** the user presses `b`
- **THEN** `git.checkout` runs with the repository `ledger`
