## ADDED Requirements

### Requirement: Create merge requests on a selection
The system SHALL create one merge request or pull request per selected repository from `m` with rows selected, the
toolbar button `⤴ Create MRs (<n>)`, and `repohangar.mr.create` run while the dashboard is the active editor and rows
are selected. Each repository SHALL resolve its own profile through its own rules, go through the review check, the
guards, the push and the create request of the single-repository flow, and record one result, running as jobs of the
job pool. Unless `repohangar.mr.quickCreate` (default `"drawer"`) is `"direct"`, a quick pick titled
`Create merge requests in <n> repositories` with the item **Create <n>** (detail: `<repository> <target> ← <branch>`
per repository, joined with ` · `) SHALL come first, and `Esc` SHALL send no request; a selection has no drawer, so
`"drawer"` asks as `"confirm"` does.

**Constraints:**
- At most `repohangar.concurrency` (default `6`) repositories are created at a time
- The toolbar button is disabled with the tooltip `Select the repositories first` when no row is selected
- `M` with rows selected still opens the drawer for the focused row only

#### Scenario: Three linked merge requests in two keystrokes
- **GIVEN** `billing-api` (`git.acme.com`), `ledger` (`git.acme.com`) and `web-shop` (`github.com`) are on
  `feature/ABC-12-notes`, each with commits ahead of `main`, no open review, a credential for both hosts and
  `repohangar.mr.quickCreate` `"direct"`
- **WHEN** the user selects the 3 rows with `Ctrl+A` after filtering by `abc-12`
- **AND WHEN** the user presses `m`
- **THEN** 3 create requests are sent, two to `git.acme.com` and one to `github.com`, with no dialog
- **AND THEN** each of the 3 descriptions is updated once with a `Related:` section that lists the other two

#### Scenario: Selection result matrix

| # | Repository state | Result | Result panel line |
| :--- | :--- | :--- | :--- |
| R1 | 2 commits ahead, no upstream, no open review | **`ok: created !142, pushed 2`** | **`✓ billing-api  !142  git.acme.com/payments/billing-api  (pushed 2)`** |
| R2 | Open review `!88` exists | **`ok: already existed`** | **`✓ notifications  !88  already existed — description updated with related links`** |
| R3 | GitHub, 3 commits ahead, upstream behind by 0 and ahead by 3 | **`ok: created #311, pushed 3`** | **`✓ web-shop  #311  github.com/acme/web-shop  (pushed 3)`** |
| R4 | On the target `main` | **`skipped: on main`** | **`↷ ledger  on main`** |
| R5 | 0 commits ahead of the target | **`skipped: nothing to merge into main`** | **`↷ ledger  nothing to merge into main`** |
| R6 | Rebase in progress | **`skipped: rebase in progress`** | **`↷ admin-portal  rebase in progress`** with **`Open SCM`** |
| R7 | GitHub host without a credential | **`skipped: not signed in to github.com`** | **`↷ web-shop  not signed in to github.com`** with **`Sign In…`** |
| R8 | The push fails with `Permission denied (publickey)` | **`failed: push failed: Permission denied (publickey)`** | **`✗ infra-charts  push failed: Permission denied (publickey)`** with **`Show Git Output`** |
| R9 | GitLab without a token, push-options path | **`ok: created !143, pushed 1, no related links`** | **`✓ auth-service  !143  git.acme.com/payments/auth-service  (pushed 1, no related links: not signed in)`** |
| R10 | 3 uncommitted files, 1 commit ahead | **`ok: created !144`** | **`✓ ledger  !144  git.acme.com/payments/ledger  (3 uncommitted files not included)`** |

#### Scenario: Confirmation before a selection
- **GIVEN** `repohangar.mr.quickCreate` is `"confirm"`, or not set (`"drawer"`), and `billing-api`, `ledger` and
  `web-shop` are selected
- **WHEN** the user presses `m`
- **THEN** a quick pick titled `Create merge requests in 3 repositories` shows the item `Create 3`
- **AND WHEN** the user presses `Esc`
- **THEN** no request is sent and no push runs

### Requirement: Related links
After every repository of a selection has a result, the system SHALL update the description of each review whose
result is `ok` and whose host has a credential, when the batch has at least two such reviews, so that it contains one
section that lists the other reviews of the batch, ordered by repository name, as `Related:` followed by one line
`- <repository> <!iid|#number> <URL>` per review. The section SHALL replace the `{related}` placeholder where the
template placed it, else be appended after an empty line, and SHALL be enclosed in `<!-- repohangar:related -->` and
`<!-- /repohangar:related -->` so that a later batch replaces it instead of adding a second one. The update SHALL be one
`PUT /api/v4/projects/<id>/merge_requests/<iid>` with `description` on GitLab or one
`PATCH /repos/<owner>/<repo>/pulls/<number>` with `body` on GitHub per review.

#### Scenario: Related links matrix

| # | Reviews with result `ok` and a credential | Review | Description before | Update request | Description after |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | `billing-api !142`, `ledger !143`, `web-shop #311` | `!142` | Rendered with `{related}` at the end of the template | **1 `PUT …/merge_requests/142`** | **The template text, then the section `Related:` ⏎ `- ledger !143 https://git.acme.com/payments/ledger/-/merge_requests/143` ⏎ `- web-shop #311 https://github.com/acme/web-shop/pull/311`** |
| R2 | Same 3 | `#311` | `Closes ABC-12` without `{related}` | **1 `PATCH …/pulls/311`** | **`Closes ABC-12`, an empty line, then the section with `billing-api !142` and `ledger !143`** |
| R3 | Same 3 | `!88` already existed with a section from an earlier batch | The earlier section lists `ledger !140` | **1 `PUT …/merge_requests/88`** | **The earlier section replaced by the new one; one section in total** |
| R4 | Only `billing-api !142` | `!142` | *Any* | **None** | **Unchanged** |
| R5 | `billing-api !142`, `ledger !143`; `auth-service !143` created without a token | `!143` of `auth-service` | *Any* | **None** | **Unchanged; its result line says `no related links: not signed in`** |

#### Scenario: Description update fails
- **GIVEN** the batch created `!142` and `#311`
- **WHEN** the `PATCH https://api.github.com/repos/acme/web-shop/pulls/311` request is answered `403`
- **THEN** the line of `web-shop` reads `✓ web-shop  #311  github.com/acme/web-shop  (related links not added: 403)`
- **AND** `!142` is still updated with its section

### Requirement: Merge request result panel
After a selection batch, the system SHALL show the batch result panel (`batch-operations`) titled
`Create MRs — <branch>` when every repository is on the same branch, else `Create MRs`, with one line per repository as
`Selection result matrix` states and the button **Open ↗** on each line that has a review, then the line
`Related links added to all <n> descriptions.` (or `Related links added to <k> of <n> descriptions.`) when links were
added, and the buttons **Copy all links** (when at least one review exists), **Retry failed** (when a result is
`failed`) and **Close**. The summary notification SHALL read
`Create MRs — finished in <seconds> s: ✓ <n> created · = <e> already existed · ↷ <s> skipped · ✗ <f> failed`, leaving out
every count of 0 except the first.

#### Scenario: Copy all links
- **GIVEN** the merge request result panel lists `billing-api !142`, `notifications !88` and `web-shop #311`
- **WHEN** the user clicks `Copy all links`
- **THEN** the clipboard holds
  `billing-api !142 https://git.acme.com/payments/billing-api/-/merge_requests/142` ⏎
  `notifications !88 https://git.acme.com/payments/notifications/-/merge_requests/88` ⏎
  `web-shop #311 https://github.com/acme/web-shop/pull/311`

#### Scenario: Merge request summary matrix

| # | Created | Already existed | Skipped | Failed | Notification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | 3 | 0 | 0 | 0 | **Information: `Create MRs — finished in 4.3 s: ✓ 3 created`** |
| R2 | 2 | 1 | 1 | 0 | **Information: `Create MRs — finished in 5.0 s: ✓ 2 created · = 1 already existed · ↷ 1 skipped`** |
| R3 | 2 | 0 | 0 | 1 | **Warning: `Create MRs — finished in 6.1 s: ✓ 2 created · ✗ 1 failed` with `Show Git Output`** |

### Requirement: Retry failed merge requests
**Retry failed** in the merge request result panel SHALL run the single-repository flow again for the repositories
whose result is `failed`, with the same profiles, and SHALL then update the related links of every review of the batch
that has a credential, so that all of them list the new reviews.

#### Scenario: Retry after a failed push
- **GIVEN** the panel shows `billing-api !142` and `ledger !143` created and `infra-charts`
  `failed: push failed: Permission denied (publickey)`
- **WHEN** the user fixes the SSH key and clicks `Retry failed`
- **THEN** `infra-charts` is pushed and `!20` is created
- **AND** the descriptions of `!142`, `!143` and `!20` are each updated once more, each listing the other two
