## MODIFIED Requirements

### Requirement: Refresh command
The system SHALL provide the command `repohangar.refresh` (*RepoHangar: Refresh*) that calls `repository.status()` once
for every listed repository, reads `FETCH_HEAD`, the stash count and the operation markers again, and rescans the
repository roots of the Explorer context menu (`explorer-open-in-git-graph`), and SHALL leave every row unchanged when
nothing changed on disk.

#### Scenario: Refresh all rows
- **GIVEN** the workspace is trusted and the dashboard lists 14 repositories
- **WHEN** the user runs `repohangar.refresh`
- **THEN** `repository.status()` is called once for each of the 14 repositories
- **AND** no network operation runs

#### Scenario: Refresh rescans the repository roots
- **GIVEN** a repository was cloned into `acme/backend/payments` after the last scan
- **WHEN** the user runs `repohangar.refresh`
- **THEN** the context key `repohangar.repositoryRoots` contains the path of `acme/backend/payments`

