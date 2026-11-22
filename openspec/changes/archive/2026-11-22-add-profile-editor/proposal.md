## Why

After `add-mr-creation`, MR profiles exist only as JSON in `settings.json`. Most people will not write
`repohangar.mr.profiles` by hand, and the moment they want to keep a value is in the middle of creating a merge
request, not in a settings file (PROPOSAL.md §7.3, design principle 1). The second merge request on a project should
also need almost no typing.

Roadmap phase: **3. Batch and profiles UX** (§13), third slice: the profile editor (W9), "Save as defaults" with its
three scopes, the per-repository memory, and recent reviewers. It implements §7.2 (per-repo memory step), §7.3, W4
(**Save as defaults ▾** and the `recent:` line), W9, the defaults line of W10, §10.1 (`repohangar.profiles.edit`) and
decision D6.

Acceptance criterion of the phase covered here: **the profile editor round-trips settings without losing comments in
`settings.json` (edits go through `WorkspaceConfiguration.update`).**

**Depends on: `add-mr-creation`** (profiles, rules, resolution order, the drawer) **and `add-hosting-providers`** (the
first-run hosts panel that gets the defaults line).

## What Changes

- **MR profile editor** (W9): `repohangar.profiles.edit` (*RepoHangar: Edit MR Profiles*), the `⚙` button of the
  dashboard toolbar and **Set up a default profile** open a form over `repohangar.mr.profiles` and `repohangar.mr.rules`
  with a **User** / **Workspace** scope switch: the profile list (`★` on `default`), **New profile**, every profile key
  with a live title preview, the ordered rules with **New rule**, move and delete, the per-repository memory with
  **Forget**, and **Open settings.json** / **Save**. Saving writes through `WorkspaceConfiguration.update` at the chosen
  scope, so the rest of `settings.json`, comments included, is kept.
- **Save as defaults ▾** in the Create MR drawer (§7.3): **For me (all workspaces)** (user scope), **For this workspace
  (shared)** (workspace scope) and **For this repo only** (per-repository memory in `workspaceState`, keyed by
  `<host>/<project path>`), each writing only the values that differ from the profile.
- **Per-repository memory** joins the resolution order between the rule's `set` and the drawer edits (§7.2).
- **Recent reviewers and labels**: the last 10 of each per host, offered first in the drawer (`recent: luis.gomez ·
  team:backend`).
- The first-run hosts panel gains `Merge request defaults: none yet.` with **Set up a default profile** when no profile
  is defined.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mr-profiles`: adds the profile editor, saving defaults at three scopes, the per-repository memory and its place in
  the resolution order, recent reviewers and labels, and the defaults line of the first-run panel.
  `add-mr-creation` is not archived yet, so these are ADDED requirements.

## Impact

- **Code**: `src/mr/profileEditor.ts` (webview panel), `src/mr/saveDefaults.ts` and `src/mr/memory.ts` (pure parts
  without `vscode`), the drawer's split button, the dashboard toolbar `⚙`; a second Preact entry in `webview/` for the
  editor.
- **Settings written**: `repohangar.mr.profiles` and `repohangar.mr.rules`, at user or workspace scope, only on an
  explicit **Save** or **Save as defaults**.
- **State**: `workspaceState` `repohangar.mr.repoMemory`; `globalState` `repohangar.mr.recent.<host>`.
- **Public surface**: command `repohangar.profiles.edit`; the `⚙` toolbar button. CHANGELOG `Added` entries.
