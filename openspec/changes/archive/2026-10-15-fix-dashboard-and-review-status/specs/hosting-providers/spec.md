## MODIFIED Requirements

### Requirement: Batched review status
The system SHALL load the open review of the current branch of every listed repository whose provider is `gitlab` or
`github`, whose HEAD is on a branch, whose host has a credential (`provider-auth`) and whose host is not skipped, with
one GraphQL request per host for each chunk of at most 10 repositories on a GitLab host and at most 50 on a GitHub host:
for GitLab one aliased
`project(fullPath: <project path>) { mergeRequests(sourceBranches: [<branch>], state: opened, first: 1) }` per
repository sent to `https://<host>/api/graphql`, for GitHub one aliased
`repository(owner: <owner>, name: <name>) { pullRequests(headRefName: <branch>, states: [OPEN], first: 1) }` per
repository sent to `https://api.github.com/graphql` (github.com) or `https://<host>/api/graphql` (GitHub Enterprise).
When GitLab rejects a chunk for its size (`Query too large`) or its complexity (`Query has complexity of …, which
exceeds max complexity of …`), the system SHALL split the chunk into two halves and send each half again, one after
another; a chunk of one repository that GitLab still rejects SHALL fail the request (Review request failures). The
system MUST NOT send a review request for any other repository. A failed request SHALL be logged as
`Review request to <host> failed: <message>`, where `<message>` is the first GraphQL error message of the answer, else
the `message` of a REST error, else `HTTP <status>`.

**Constraints:**
- At most 10 aliases per GitLab request and 50 per GitHub request; the chunks of one host are sent one after another,
  different hosts in parallel
- A rejected GitLab chunk is split down to 1 alias, never further
- Request timeout: 15 s
- Two repositories on the same project and different branches (worktrees) get one alias each

#### Scenario: Repository inclusion matrix

| # | Provider | HEAD | Credential for the host | Host skipped (`provider-auth`) | In the request | MR / PR cell |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | None (no remote, or not hosted) | *Any* | *N/A* | *N/A* | **No** | **`—`** |
| R2 | `unknown` | *Any* | *N/A* | *N/A* | **No** | **`?`** |
| R3 | `gitlab` | Detached, or an operation in progress on a detached HEAD | *Any* | *Any* | **No** | **`—`** |
| R4 | `gitlab` | Branch | None | No | **No** | **`Sign in`** |
| R5 | `gitlab` | Branch | *Any* | Yes | **No** | **`—`** |
| R6 | `gitlab` | Branch | Yes | No | **Yes** | **The review cell** |
| R7 | `github` | Branch | None | No | **No** | **`Sign in`** |
| R8 | `github` | Branch | Yes | No | **Yes** | **The review cell** |

#### Scenario: Forty repositories on two hosts
- **GIVEN** 25 listed repositories on `git.acme.com` (`gitlab`) and 15 on `github.com` (`github`), all on branches, with
  a credential for both hosts
- **WHEN** the review status of every repository loads
- **THEN** exactly 4 HTTP requests are sent: 3 `POST https://git.acme.com/api/graphql` with 10, 10 and 5 aliases, one
  after another, and 1 `POST https://api.github.com/graphql` with 15 aliases

#### Scenario: Chunks of 50 aliases
- **GIVEN** 120 listed repositories on `github.com`, all on branches, with a credential for the host
- **WHEN** the review status of every repository loads
- **THEN** 3 requests are sent to `https://api.github.com/graphql`, with 50, 50 and 20 aliases, the second sent after
  the first answered

#### Scenario: GitLab chunk limit matrix

| # | Aliases in the request to `git.acme.com` | GitLab answer | Requests that follow for these repositories | Their MR / PR cells | Log line |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | 10 | `200` with `data` for every alias | **None** | **Refreshed from the answer** | **None** |
| R2 | 10 | `422` with `{"errors":[{"message":"Query too large"}]}` | **2 requests of 5 aliases, the second sent after the first answered** | **Refreshed from the two answers** | **None** |
| R3 | 10 | `200` without `data`, with the error `Query has complexity of 260, which exceeds max complexity of 250` | **2 requests of 5 aliases, the second sent after the first answered** | **Refreshed from the two answers** | **None** |
| R4 | 1 | `422` with `{"errors":[{"message":"Query too large"}]}` | **None** | **Cached values, not refreshed** | **`Review request to git.acme.com failed: Query too large`** |
| R5 | 10 | `502` | **None** | **Cached values, not refreshed** | **`Review request to git.acme.com failed: HTTP 502`** |
