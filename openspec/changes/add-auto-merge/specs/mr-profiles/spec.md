## ADDED Requirements

### Requirement: Auto-merge profile key
The system SHALL accept the profile key `autoMerge` (built-in default `false`) in `repohangar.mr.profiles`, rule `set`
objects, the per-repository memory and **Save as defaults**, resolved in the same order as the other keys, and the
profile editor SHALL show it as the box **Auto-merge** after **Draft**.

#### Scenario: Auto-merge from a hotfix profile
- **GIVEN** the rule `{ "branch": "hotfix/**", "profile": "hotfix" }` and the profile `hotfix` with `autoMerge` `true`
- **WHEN** the values for `billing-api` on `hotfix/ABC-99-timeout` are resolved
- **THEN** the effective `autoMerge` is `true`

### Requirement: Auto-merge and merge method policy
The system SHALL check the effective `autoMerge` and, on GitHub, choose the auto-merge method from the project
information (`GET /repos/<owner>/<repo>`: `allow_auto_merge`, `allow_squash_merge`, `allow_merge_commit`,
`allow_rebase_merge`), as the matrix states, and SHALL show the note of the matrix in the drawer. On GitLab, auto-merge
SHALL stay as resolved. A draft SHALL never get auto-merge.

#### Scenario: Auto-merge policy matrix

| # | Provider | `draft` | `autoMerge` resolved | `allow_auto_merge` | `squash` | Allowed methods | Effective auto-merge | Drawer |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | *Any* | *Any* | `false` | *Any* | *Any* | *Any* | **Off** | **Box unchecked** |
| R2 | *Any* | `true` | `true` | *Any* | *Any* | *Any* | **Off** | **Box unchecked and disabled, note `Drafts cannot be merged automatically.`** |
| R3 | GitLab | `false` | `true` | *N/A* | *Any* | *N/A* | **On** | **Box checked, labeled `Auto-merge when pipeline succeeds`** |
| R4 | GitHub | `false` | `true` | `false` | *Any* | *Any* | **Off** | **Box hidden, note `Auto-merge is turned off for acme/web-shop.`** |
| R5 | GitHub | `false` | `true` | `true` | `true` | Squash, merge | **On, method `SQUASH`** | **Box checked, labeled `Auto-merge (squash) when checks pass`** |
| R6 | GitHub | `false` | `true` | `true` | `true` | Merge, rebase | **On, method `MERGE`** | **Note `Squash is not allowed in acme/web-shop; auto-merge will use a merge commit.`** |
| R7 | GitHub | `false` | `true` | `true` | `false` | Squash, merge | **On, method `MERGE`** | **Box checked, labeled `Auto-merge (merge) when checks pass`** |
| R8 | GitHub | `false` | `true` | `true` | `false` | Squash, rebase | **On, method `REBASE`** | **Box checked, labeled `Auto-merge (rebase) when checks pass`** |
| R9 | GitHub | `false` | `true` | `true` | `false` | Squash only | **On, method `SQUASH`** | **Box checked, labeled `Auto-merge (squash) when checks pass`** |
