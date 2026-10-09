## ADDED Requirements

### Requirement: Enable auto-merge after creation
When the effective auto-merge is on, the system SHALL enable it right after the create request: on GitLab with
`PUT /api/v4/projects/<id>/merge_requests/<iid>/merge` carrying `sha` (the head SHA in the create answer) and
`merge_when_pipeline_succeeds: true` when the host's version (`hosting-providers` `GitLab version warning`) is lower
than 17.11.0, or `auto_merge: true` from 17.11.0; on GitHub with the GraphQL mutation
`enablePullRequestAutoMerge(input: { pullRequestId: <node_id of the created pull request>, mergeMethod: <method> })`.
A refused request SHALL keep the merge request and add `auto-merge not enabled: <message>` to the result. The result
text SHALL list `auto-merge` (GitLab) or `auto-merge <method in lower case>` (GitHub) among the applied values.

#### Scenario: Auto-merge request matrix

| # | Provider | Host version | Method | Request | Answer | Result text |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | GitLab | 17.10.0, or unreadable | *N/A* | **`PUT …/merge_requests/142/merge` with `merge_when_pipeline_succeeds: true` and `sha`** | `200` | **`Created !142 in billing-api: … · auto-merge`** |
| R2 | GitLab | 18.2.1 | *N/A* | **`PUT …/merge_requests/142/merge` with `auto_merge: true` and `sha`** | `200` | **`Created !142 in billing-api: … · auto-merge`** |
| R3 | GitLab | 18.2.1 | *N/A* | **`PUT …/merge_requests/142/merge` with `auto_merge: true` and `sha`** | `405` `{"message":"Method Not Allowed"}` | **`Created !142 in billing-api: … · auto-merge not enabled: Method Not Allowed`** |
| R4 | GitHub | *N/A* | `SQUASH` | **`enablePullRequestAutoMerge` with `mergeMethod: SQUASH`** | Success | **`Created #311 in web-shop: … · auto-merge squash`** |
| R5 | GitHub | *N/A* | `SQUASH` | **`enablePullRequestAutoMerge` with `mergeMethod: SQUASH`** | Error `Pull request is in clean status` | **`Created #311 in web-shop: … · auto-merge not enabled: Pull request is in clean status`** |
| R6 | *Any* | *Any* | Auto-merge off | **None** | *N/A* | **No auto-merge value** |

#### Scenario: Undo after auto-merge
- **GIVEN** `!142` was created with auto-merge 10 s ago and has not merged
- **WHEN** the user clicks `Undo`
- **THEN** the close request of `mr-creation` `Undo` is sent and the notification reads
  `Closed !142. The branch feature/ABC-12-notes was kept.`

### Requirement: Auto-merge push option
On the push-options path with auto-merge on, the system SHALL add `-o merge_request.merge_when_pipeline_succeeds` when
the version read from `GET /api/v4/version` without a token is lower than 17.11.0 or cannot be read, and
`-o merge_request.auto_merge` from 17.11.0.

#### Scenario: Auto-merge push option matrix

| # | `GET /api/v4/version` without a token | Push option |
| :--- | :--- | :--- |
| R1 | `{"version":"17.10.0"}` | **`-o merge_request.merge_when_pipeline_succeeds`** |
| R2 | `{"version":"17.11.2"}` | **`-o merge_request.auto_merge`** |
| R3 | `401` | **`-o merge_request.merge_when_pipeline_succeeds`** |

### Requirement: Auto-merge in the drawer and quick input
The Create MR drawer SHALL show the auto-merge box after **Draft** as `Auto-merge and merge method policy` (mr-profiles)
labels it, and the quick create input's first item SHALL add ` · auto-merge` (GitLab) or ` · auto-merge <method>`
(GitHub) to its detail when auto-merge is on. Checking **Draft** in the drawer SHALL uncheck and disable the auto-merge
box.

#### Scenario: Draft turns off auto-merge in the drawer
- **GIVEN** the drawer for `billing-api` shows `Auto-merge when pipeline succeeds` checked
- **WHEN** the user checks **Draft**
- **THEN** the auto-merge box is unchecked and disabled with the note `Drafts cannot be merged automatically.`
