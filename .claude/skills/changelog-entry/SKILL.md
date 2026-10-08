---
name: changelog-entry
description: Classify a RepoHangar change by its user impact and add the kind-prefixed entry under ## Unreleased in CHANGELOG.md, following docs/versioning.md; also reports the pending release level. Use when a change is ready to merge or archive, when tasks.md ends with the CHANGELOG task, or when asked what version the next release will be.
---

Add one CHANGELOG entry per user-observable change, with the kind that decides the release level.

**Input**: a change name (`openspec/changes/<change>/`), a branch, or a description of the change. If none is given,
use the diff of the current branch against `main`.

## Steps

1. **Read the standard.** Read `docs/versioning.md` in full. It is the authority; this skill only orders the work.

2. **Find the user-observable effects.** From the change's proposal and deltas, or the diff, list what a user of the
   extension notices: settings and their values or defaults, MR profile and rule keys, template placeholders, command
   ids, context keys, keybindings and dashboard keys, menu items, cells and notifications, stored tokens and per-repo
   MR memory, supported VS Code and GitLab versions. Check each against the public surface (standard §1).

3. **Classify each effect** with the table in standard §2 and name its row (`R1`…`R14`). Apply the notes: a new
   default is `Changed`; a default keybinding change is `Changed`; raising `engines.vscode` is `Changed` but raising
   the minimum GitLab version so older servers stop working is `Breaking`; a rename without automatic migration is
   `Removed` + `Added`; changing the meaning of an existing setting or placeholder is `Breaking`. If every effect is
   R14, say so and add nothing.

4. **Write the entries** under `## Unreleased` in `CHANGELOG.md` (create the heading if it is missing), one top-level
   bullet per entry, in the form of standard §3: `- **<Kind>:** …`, `- **<Kind>.** …` or `- **<Kind> — <title>.** …`.
   Write for users: name the setting, command, key or menu item and what they will notice. Every `Breaking` or
   `Removed` entry ends with `Migrate: …`. Never edit past release sections, and never edit `version` in
   `package.json` or the lockfile.

5. **Report the pending level** (standard §4): the highest level among all Unreleased entries, shifted down one step
   while the version is below `1.0.0`, and the next version number.

## Output

The entries added, each with its §2 row, and one line: `Unreleased: <n> entries → <level> (next <version>)`.
