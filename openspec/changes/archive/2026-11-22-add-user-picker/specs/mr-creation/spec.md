## ADDED Requirements

### Requirement: Find users in the Reviewers and Assignees fields
Typing in the add field of **Reviewers** or **Assignees** in the Create MR drawer SHALL search the users of the
repository's project on its host and SHALL show the answer in a list under that field. Each entry SHALL read
`<name> @<username>`, or `@<username>` when the provider gives no name. Users already in that field SHALL be left out,
and the first entry SHALL be highlighted. Enter or a click on an entry SHALL add its username as a chip and clear the
field. Enter with no entry highlighted SHALL add the typed text without its leading `@`. `Esc` SHALL close an open list
and keep the drawer open. The list SHALL show `Searching…` while the request runs,
`No users on <host> match "<text>".` for an empty answer, `Sign in to <host> to search users.` when the host has no
credential, and `User search failed: <message>.` with the provider's error message when the request fails. Each field
SHALL have its own list. An answer SHALL be shown only while the field still holds the text it was requested for.
**Labels** SHALL NOT search users.

**Constraints:**
- Search text: the field text trimmed, with one leading `@` dropped; no request when it is empty or starts with `team:`
- One request per field after 300 ms without typing
- At most 10 entries, in the provider's answer order
- GitLab: `GET /api/v4/projects/<id>/members/all?query=<text>&per_page=20`, reading `username`, `name` and `state`;
  users whose `state` is not `active` are left out
- GitHub: one GraphQL `repository(owner:, name:) { assignableUsers(query: <text>, first: 10) { nodes { login name } } }`,
  which matches the login and the name

#### Scenario: User search list matrix
The drawer is open for `billing-api` (`payments/billing-api` on `git.acme.com`). The host's users matching `jhon` are
Jhon Wilber Tapia Pinto (`jtapiap`) and Jhon Ruiz (`jruiz`).

| # | Field | Chips in the field | Text typed | Credential for `git.acme.com` | Answer | Requests | List |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Labels | None | `jhon` | Yes | *N/A* | **None** | **None** |
| R2 | Reviewers | None | `@` | Yes | *N/A* | **None** | **None** |
| R3 | Reviewers | None | `team:sre` | Yes | *N/A* | **None** | **None** |
| R4 | Reviewers | None | `jhon` | No | *N/A* | **None** | **`Sign in to git.acme.com to search users.`** |
| R5 | Reviewers | None | `jhon` | Yes | Not received yet | **One, 300 ms after the last key** | **`Searching…`** |
| R6 | Reviewers | None | `@jhon` | Yes | `jtapiap`, `jruiz` | **One, with `query=jhon`** | **`Jhon Wilber Tapia Pinto @jtapiap` (highlighted), `Jhon Ruiz @jruiz`** |
| R7 | Reviewers | `jtapiap` | `jhon` | Yes | `jtapiap`, `jruiz` | **One** | **`Jhon Ruiz @jruiz` (highlighted)** |
| R8 | Assignees | None | `jhon` | Yes | `jtapiap`, `jruiz` | **One** | **Under Assignees: `Jhon Wilber Tapia Pinto @jtapiap` (highlighted), `Jhon Ruiz @jruiz`; Reviewers shows none** |
| R9 | Reviewers | None | `zz` | Yes | No users | **One** | **`No users on git.acme.com match "zz".`** |
| R10 | Reviewers | None | `jhon` | Yes | `403 Forbidden` | **One** | **`User search failed: 403 Forbidden.`** |

#### Scenario: User selection matrix
The **Reviewers** list shows `Jhon Wilber Tapia Pinto @jtapiap` and `Jhon Ruiz @jruiz` for the text `jhon`, unless
the row says otherwise.

| # | List | Key or pointer | Reviewers chips after | Field text after | List after | Drawer after |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Entries, first highlighted | Enter | **`jtapiap`** | **Empty** | **Closed** | **Open** |
| R2 | Entries, first highlighted | `↓`, then Enter | **`jruiz`** | **Empty** | **Closed** | **Open** |
| R3 | Entries, first highlighted | `↑`, then Enter | **`jruiz`** | **Empty** | **Closed** | **Open** |
| R4 | Entries, first highlighted | Click on `Jhon Ruiz @jruiz` | **`jruiz`** | **Empty** | **Closed** | **Open** |
| R5 | `Searching…`, text `@jdoe` | Enter | **`jdoe`** | **Empty** | **Closed** | **Open** |
| R6 | `No users on git.acme.com match "jdoe".`, text `jdoe` | Enter | **`jdoe`** | **Empty** | **Closed** | **Open** |
| R7 | Entries, first highlighted | `Esc` | **None** | **`jhon`** | **Closed** | **Open** |
| R8 | Closed, text `jhon` | `Esc` | **None** | *N/A* | **Closed** | **Closed; no request** |
| R9 | Entries, first highlighted | `Ctrl+Enter` | **None (the typed text is not added)** | *N/A* | *N/A* | **Closed; created with the values shown** |
| R10 | Entries, first highlighted | Focus moves to **Assignees** | **None** | **`jhon`** | **Closed** | **Open** |

#### Scenario: Answer for older text
- **GIVEN** the user typed `jho` in **Reviewers** and its search request is still running
- **WHEN** the user types `n`, so the field reads `jhon`
- **AND** the answer for `jho` arrives before the answer for `jhon`
- **THEN** the list keeps showing `Searching…` and no entry from the answer for `jho`
- **AND WHEN** the answer for `jhon` arrives
- **THEN** the list shows the entries of the answer for `jhon`

#### Scenario: User search request matrix

| # | Provider | Search text | Answer | Request sent | Entries |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | GitLab | `jhon` | `jtapiap` (`active`), `jhon.old` (`blocked`), `jruiz` (`active`) | **`GET https://git.acme.com/api/v4/projects/payments%2Fbilling-api/members/all?query=jhon&per_page=20`** | **`Jhon Wilber Tapia Pinto @jtapiap`, `Jhon Ruiz @jruiz`** |
| R2 | GitLab | `a` | 14 `active` users | **`GET …/members/all?query=a&per_page=20`** | **The first 10, in answer order** |
| R3 | GitHub | `jhon` | `jtapiap` with name `Jhon Tapia`, `jruiz` with no name | **One GraphQL request to `https://api.github.com/graphql` with `assignableUsers(query: "jhon", first: 10)` for `acme/web-shop`** | **`Jhon Tapia @jtapiap`, `@jruiz`** |
