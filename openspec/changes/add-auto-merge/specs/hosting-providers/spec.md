## ADDED Requirements

### Requirement: GitHub delete after merge
When RepoHangar creates a GitHub pull request whose `deleteSourceBranch` is `true` because a profile, rule, repository
memory or drawer edit sets it (not the built-in default), and the repository's `delete_branch_on_merge` is `false`, the
system SHALL remember the pull request in `workspaceState` with its branch and head SHA. Each review request to that
host SHALL also ask for the state of every remembered pull request of the host, in the same request. The system SHALL
then act as the matrix states, SHALL forget the pull request once it is merged or closed, and SHALL forget it after 30
days.

**Constraints:**
- No request is added for remembered pull requests: they are aliases in the host's review request
- The remote branch is deleted only when its head on the server equals the pull request's head SHA at merge time

#### Scenario: Delete after merge matrix

| # | Remembered pull request state | Remote branch head | Request | Notification | Remembered after |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Open | *Any* | **None** | **None** | **Yes** |
| R2 | Merged, head `c3d4e5f` | `c3d4e5f` | **`DELETE /repos/acme/web-shop/git/refs/heads/feature/ABC-12-notes`** | **`Deleted the merged branch feature/ABC-12-notes of web-shop on github.com.`** | **No** |
| R3 | Merged, head `c3d4e5f` | `e6f7a8b` (a newer commit) | **None** | **`feature/ABC-12-notes of web-shop has commits after #311 was merged, so it was kept.`** | **No** |
| R4 | Merged | Already deleted (`404`) | **None after the `404`** | **None** | **No** |
| R5 | Closed without merge | *Any* | **None** | **None** | **No** |
| R6 | Open, remembered 31 days ago | *Any* | **None** | **None** | **No** |

#### Scenario: Repository deletes branches itself
- **GIVEN** the profile sets `deleteSourceBranch` `true` and `acme/web-shop` has `delete_branch_on_merge` `true`
- **WHEN** RepoHangar creates `#311`
- **THEN** `#311` is not remembered and RepoHangar sends no `DELETE` request for its branch

### Requirement: Auto-merge and after-merge lines in row details
The row details of a repository with an open review SHALL show the line `Auto-merge  <squash|merge|rebase>` (GitHub,
from `autoMergeRequest.mergeMethod`) or `Auto-merge  on` (GitLab, from `autoMergeEnabled`) when auto-merge is enabled,
and the line `After merge  RepoHangar deletes <branch>` when the review is a remembered GitHub pull request.

#### Scenario: Row details line matrix

| # | Provider | Auto-merge in the answer | Remembered for deletion | Lines |
| :--- | :--- | :--- | :--- | :--- |
| R1 | GitHub | `autoMergeRequest.mergeMethod` `SQUASH` | Yes | **`Auto-merge  squash` ⏎ `After merge  RepoHangar deletes feature/ABC-12-notes`** |
| R2 | GitHub | `null` | Yes | **`After merge  RepoHangar deletes feature/ABC-12-notes`** |
| R3 | GitLab | `autoMergeEnabled` `true` | *N/A* | **`Auto-merge  on`** |
| R4 | GitLab | `autoMergeEnabled` `false` | *N/A* | **None** |
