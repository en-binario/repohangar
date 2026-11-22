## Context

`add-mr-creation` reads `repohangar.mr.profiles` and `repohangar.mr.rules` per scope with `inspect()` and resolves
values in `src/mr/profiles.ts` (pure). Nothing writes them yet. The drawer is a Preact component of the dashboard
webview; the first-run panel comes from `add-hosting-providers`. See proposal.md for the scope.

## Goals / Non-Goals

**Goals:**
- Write settings only through `WorkspaceConfiguration.update`, so VS Code's own JSON editing keeps the rest of the file,
  its comments and its formatting (acceptance criterion of phase 3).
- Never write an inherited value: a profile keeps only the keys the user set, so `extends` and `default` keep working.

**Non-Goals:**
- Folder-scope profiles (`ConfigurationTarget.WorkspaceFolder`): read as workspace scope (`add-mr-creation` D-2),
  never written.
- Keeping comments inside the `repohangar.mr.profiles` value itself: `update` replaces that value as a whole. The
  editor's **Open settings.json** stays available for people who comment inside it.
- Sharing per-repository memory: it lives in `workspaceState` of one machine (§7.3).

## Decisions

### D-1. A second webview panel

The editor is its own `WebviewPanel` (`repohangar.profiles`) with a second Preact entry built by esbuild
(`webview/profiles.tsx`), the same CSP, codicons and message validation as the dashboard. *Alternative:* a drawer in
the dashboard — rejected, W9 needs the full width for the profile list, the rules and the fields side by side.

### D-2. Editing model

The host sends `profilesState { scope, profiles: { name, explicit: {…}, effective: {…}, inheritedFrom: {…} }[], rules,
memory, hasWorkspace }`. The view edits only `explicit` objects and the rule list and sends `profilesSave { scope,
profiles, rules }`. The host builds the new value from the latest `inspect()` value at that scope (so a key the editor
does not know is kept), replaces the edited profiles and the rule list, and calls `update` once per changed setting.
`onDidChangeConfiguration` drives the reload or the banner (spec `Settings changed outside the editor`), comparing with
the last value the host sent.

### D-3. Save as defaults

`saveDefaults.ts` (pure) diffs the drawer values against the profile's effective values for the six saved keys,
leaving out a `squash` the policy forced. User and workspace targets merge the diff into that scope's
`repohangar.mr.profiles.<profile>` explicit keys and call `update`; the repository target merges into
`repohangar.mr.repoMemory[<host>/<path>]` in `workspaceState`.

### D-4. Memory in the resolution

`profiles.resolve()` gains an optional `memory` argument applied after the rule `set` (spec `Per-repository memory`),
so the single- and multi-repository flows pick it up without other changes.

### D-5. Recent values

`globalState` `repohangar.mr.recent.<host>` = `{ reviewers: string[], labels: string[] }`, updated after each successful
create request (single, batch, push options). The drawer receives them in the `drawer` message.

## Risks / Trade-offs

- [A workspace save writes `.vscode/settings.json` and can create it] → only on an explicit **Save** with the
  Workspace scope or **For this workspace (shared)**; the notification names the scope.
- [Settings Sync carries user-scope profiles to other machines] → intended (§7.1); repository memory stays local.
- [Concurrent edit in `settings.json` while the editor is open] → the banner, never a silent overwrite.

## Migration Plan

None. Existing hand-written profiles load as they are; keys the editor does not show are kept on save.
