## ADDED Requirements

### Requirement: Find users in the profile editor
The profile editor SHALL show **Search users in** above **Reviewers**: a list of every repository in the dashboard whose
provider is `gitlab` or `github`, each as `<repository> (<host>)`, sorted by repository name. The **Reviewers** and
**Assignees** fields of the selected profile SHALL search the users of the chosen repository with the list, keys and
requests of `mr-creation` **Find users in the Reviewers and Assignees fields**. A user chosen in the list SHALL become an
unsaved edit of the profile, and a setting SHALL be written only on **Save**. **Search users in** SHALL default to the
focused dashboard row's repository when it is hosted, else to the first hosted repository by name. Without a hosted
repository, the editor SHALL show `Add a GitLab or GitHub repository to search users.` in its place, and the fields
SHALL take typed text only, with no request.

**Constraints:**
- The choice in **Search users in** lasts while the editor is open and is never written to a setting

#### Scenario: Search users in default matrix

| # | Focused dashboard row | Hosted repositories in the dashboard | Search users in | Requests |
| :--- | :--- | :--- | :--- | :--- |
| R1 | `web-shop` (`github`) | `billing-api` (`git.acme.com`), `web-shop` (`github.com`) | **`web-shop (github.com)` selected** | **Searches `acme/web-shop`** |
| R2 | `notes` (provider `unknown`) | `billing-api` (`git.acme.com`), `web-shop` (`github.com`) | **`billing-api (git.acme.com)` selected** | **Searches `payments/billing-api`** |
| R3 | None | `web-shop` (`github.com`), `billing-api` (`git.acme.com`) | **`billing-api (git.acme.com)` selected** | **Searches `payments/billing-api`** |
| R4 | `notes` (provider `unknown`) | None | **Not shown; the note `Add a GitLab or GitHub repository to search users.`** | **None; Reviewers and Assignees take typed text** |

#### Scenario: Pick a reviewer for a profile
- **GIVEN** the editor shows profile `default` (user scope) with **Search users in** `billing-api (git.acme.com)`
- **WHEN** the user types `jhon` in **Reviewers** and presses Enter on `Jhon Wilber Tapia Pinto @jtapiap`
- **THEN** **Reviewers** shows the chip `jtapiap` and the profile is marked unsaved
- **AND** `repohangar.mr.profiles` is unchanged until the user clicks **Save**
- **AND WHEN** the user clicks **Save**
- **THEN** `repohangar.mr.profiles.default.reviewers` at user scope contains `jtapiap`

#### Scenario: Change the repository searched
- **GIVEN** **Search users in** shows `billing-api (git.acme.com)`
- **WHEN** the user chooses `web-shop (github.com)` and types `ana` in **Assignees**
- **THEN** the search is one GraphQL `assignableUsers(query: "ana", first: 10)` request for `acme/web-shop` to
  `https://api.github.com/graphql`, and no request goes to `git.acme.com`
