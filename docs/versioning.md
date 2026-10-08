# Versioning

> **Applies to:** the version of the published RepoHangar extension (`enbinario.repohangar`, one VSIX on the VS Code
> Marketplace, Open VSX and GitHub releases)
> **Enforced by:** review (§6). Once the release script exists, also by `npm run version:check`, which `npm test` runs
> **Tooling (planned):** `scripts/version.mjs` through `npm run version:check` and `npm run version:bump`

RepoHangar follows [Semantic Versioning](https://semver.org/). Users read the version number as a promise. A **major**
release warns that settings, commands, keybindings, MR profiles or saved data they rely on may stop working. A
**minor** release adds or changes things without breaking them. A **patch** release only fixes.

The extension is the only published artifact, so there is **one version** (`version` in `package.json`) and **one
changelog** ([`CHANGELOG.md`](../CHANGELOG.md)). The Marketplace and Open VSX auto-update installed extensions, so a
release reaches every user within hours: the version number is the only warning they get.

The level of a release is not chosen by hand. It follows from the kinds of the entries under `## Unreleased` in
`CHANGELOG.md`.

## 1. The public surface

A change is breaking only if it affects something users or their tools depend on. That is RepoHangar's public surface:

- setting keys (`repohangar.*`) and their accepted values, including the shape of `repohangar.mr.profiles` (profile
  keys, `extends`, `@me`, `team:<slug>`), `repohangar.mr.rules` (`repo` and `branch` globs, `profile`, `set`),
  `repohangar.hosts` and `repohangar.groups`;
- the title and description template placeholders (`{branch}`, `{type}`, `{ticket}`, `{branchTitle}`, `{firstCommit}`,
  `{commits}`, `{repo}`, `{defaultBranch}`, `{latestRelease}`, `{related}`, `{me}`) and `template:<name>`;
- command ids (`repohangar.*`), which users bind keys to and call from tasks and other extensions;
- context keys (`repohangar.*`), which users can use in the `when` clauses of their own keybindings;
- the default keybindings (`Ctrl+Alt+R`, `Ctrl+Alt+M`, `Ctrl+Alt+Shift+M`, `Ctrl+Alt+G`) and the dashboard keys
  (`m`, `M`, `f`, `p`, `g`, `e`, …);
- data RepoHangar stores for the user: GitLab tokens in `SecretStorage` (keyed by host), per-repo MR memory ("For this
  repo only", in `workspaceState`) and the remembered choice for repos outside the workspace;
- the settings migration from Git Graph Opener (`gitGraphOpener.*` keys it reads, Appendix D of the proposal);
- the supported platforms: the minimum VS Code version (`engines.vscode`), the minimum GitLab version (Community
  Edition 17.10.0, D20), GitHub.com and GitHub Enterprise, and `extensionKind` (remote development);
- the extension ID `enbinario.repohangar`, which can never change (a new ID is a new listing).

Anything else is internal: caches in `globalState` and `workspaceState` other than the user data above (provider
status, user IDs, host probes, recent reviewers and labels), the webview message protocol and DOM, output channel
text, command titles and menu order, and the file layout of this repository. A visible change to the internals is
still a `Changed` entry (§2, R9), but it is never breaking.

## 2. Classifying a change

Every change with a user-observable effect adds one entry under `## Unreleased`, with the kind from this table:

| # | Change | Entry kind | Level |
| :--- | :--- | :--- | :--- |
| R1 | Removes or renames a setting key or accepted value, a profile or rule key, a template placeholder, a command id or a context key | **`Removed`** | **major** |
| R2 | Stops reading data the previous release stored (tokens, per-repo MR memory), so users must sign in or save defaults again | **`Breaking`** | **major** |
| R3 | Changes the meaning of an existing setting value, profile key, rule match or placeholder, so the same settings now produce a different merge request, batch result or menu | **`Breaking`** | **major** |
| R4 | Raises the minimum GitLab version, or drops GitHub Enterprise or a remote environment, so that a setup that worked stops working | **`Breaking`** | **major** |
| R5 | Changes or removes a default keybinding or a dashboard key | **`Changed`** | **minor** |
| R6 | Adds a setting, value, profile or rule key, placeholder, command, context key, keybinding, menu item, column, provider or host type | **`Added`** | **minor** |
| R7 | Makes a batch default or a one-keystroke action do more than before (for example, `m` now also enables auto-merge by default) | **`Changed`** | **minor** |
| R8 | Changes a setting's default, without removing anything from the public surface | **`Changed`** | **minor** |
| R9 | Changes visible behaviour without removing anything: a cell, a notification, a skip reason, a menu title or order | **`Changed`** | **minor** |
| R10 | Raises the minimum VS Code version | **`Changed`** | **minor** |
| R11 | Announces that part of the public surface will be removed in a later major release, while it keeps working | **`Deprecated`** | **minor** |
| R12 | Makes behaviour match what the specs and README already describe | **`Fixed`** | **patch** |
| R13 | Fixes a security vulnerability (token handling, webview, process arguments) without changing the public surface | **`Security`** | **patch** |
| R14 | Changes only documentation, tests, build scripts or internal code, with no user-observable effect | **No entry** | **No release** |

Notes on the harder cases:

- **A new default is `Changed`, not `Breaking`.** Users who set the old value keep it, and nothing stops working.
- **A keybinding change is `Changed`** (R5). Users can bind the old key again in one step, so it is not breaking, but
  the entry names the old and new key.
- **Raising `engines.vscode` is `Changed`.** The Marketplace keeps serving the last compatible version to older VS Code
  installs, so nobody loses a working setup. **Raising the minimum GitLab version is `Breaking`** (R4) when older
  servers stop working: the extension updates anyway, and the server cannot be updated by the user. A new warning for
  older servers, with everything still working, is `Changed`.
- **More work from one keystroke is `Changed`** (R7). A user who presses `m` expects what it did yesterday, so the entry
  says what it now does in addition.
- **Prefer deprecating to removing.** Ship a `Deprecated` entry in a minor release while the old key or command still
  works, and read the old setting key as a fallback. Then remove it in the next major release with a `Removed` entry.
- **A rename is `Removed` plus `Added`** unless the release migrates the old setting automatically, as the Git Graph
  Opener migration does. With a migration that copies every scope and never deletes the old key, the rename is
  `Added` (new key) plus `Deprecated` (old key).
- **A fix that changes the public surface is not only a fix.** If a bug fix requires renaming a setting, record it as
  `Removed` (the old key) plus `Added` (the new one), or as above with a migration.

## 3. Writing an entry

Each entry is a top-level bullet (`- ` in column 1) whose first word is its kind in bold. Inside the bold span, the
kind is followed by `:`, `.`, or ` — ` and a short title:

```markdown
## Unreleased

- **Added — multi-repo merge requests.** Select several rows and press `m` to create one MR per repo, linked to each other.
- **Changed:** `repohangar.staleFetchHours` now defaults to `2`.
- **Fixed:** Pull all no longer skips a clean repository whose upstream has a different name than the branch.
- **Removed:** the `repohangar.oldSetting` setting. Migrate: use `repohangar.newSetting` instead.
```

The last line is illustrative; `repohangar.oldSetting` and `repohangar.newSetting` are placeholders.

- The kinds are `Breaking`, `Removed`, `Added`, `Changed`, `Deprecated`, `Fixed` and `Security`. They are
  case-sensitive.
- Indented lines continue the entry above them.
- Write for users, not for reviewers. Name the setting, command, key, menu item or column, and what they will notice.
- A `Breaking` or `Removed` entry tells users what to do instead (`Migrate: …`).
- Past release sections are history and are not rewritten.

## 4. The release level

The release takes the highest level among the Unreleased entries:

| Kinds under `## Unreleased` | Level | From `1.2.3` |
| :--- | :--- | :--- |
| None | No release pending | — |
| Any `Breaking` or `Removed` | major | `2.0.0` |
| Otherwise, any `Added`, `Changed` or `Deprecated` | minor | `1.3.0` |
| Only `Fixed` and `Security` | patch | `1.2.4` |

**Before 1.0.0**, every level shifts down one step, as SemVer allows for initial development: a major-level change
bumps the minor version (`0.4.2` → `0.5.0`), and minor- and patch-level changes bump the patch version (`0.4.2` →
`0.4.3`). Entries keep their real kind, so `Breaking` and `Removed` entries still tell users what to migrate. The first
`1.0.0` is released by hand with `--level major`.

`--level major|minor|patch` raises the level. For example, a maintainer might want a minor release for a set of
fixes large enough to deserve one. The level can never be lowered: the script refuses a level below the one the
entries require.

The VS Code Marketplace accepts only `major.minor.patch` versions, with no pre-release suffix. Pre-release builds, if
they are ever published, use the Marketplace's `--pre-release` flag and are not covered by this standard yet.

## 5. Releasing

1. Run `npm run version:check`. It prints the pending release, for example
   `repohangar 0.4.2; Unreleased: 6 entries → minor (next 0.4.3 before 1.0)`, or lists everything that is wrong. It
   checks that every entry has a known kind, and that `package.json`, `package-lock.json` and the latest release
   heading in the CHANGELOG all have the same version.
2. Run `npm run version:bump`. Add `-- --level <level>` to raise the level, or `-- --date YYYY-MM-DD` to date the
   release other than today. The script writes the new version to `package.json` and `package-lock.json`, turns
   `## Unreleased` into `## <version> — <date>`, and opens a new, empty `## Unreleased`. It changes nothing else, and it
   changes nothing at all when a check fails.
3. Review the diff, then run the two commands it prints:
   `git commit -am "chore(release): <version>" && git tag v<version>`.
4. Push the tag. The release workflow builds the VSIX from the tagged commit, runs `vsce publish` (Marketplace) and
   `ovsx publish` (Open VSX) with the `enbinario` publisher tokens, and attaches the VSIX to the GitHub release.

Until the script exists, a maintainer applies §4 by hand and the reviewer checks it.

## 6. Review checklist

| Check | What to look for |
|---|---|
| Entry present | The change has a user-observable effect, and it adds an entry under `## Unreleased` (R14 is the only exception) |
| Kind | The entry's kind matches its row in §2. In particular, a removal is not filed as `Changed`, and a change of meaning of an existing setting or placeholder is not filed as `Changed` |
| Migration | A `Breaking` or `Removed` entry says what users do instead |
| Settings schema | A new or changed setting is declared in `contributes.configuration` with its type, default and description, and the settings reference on the website is regenerated |
| Saved data | A change to stored tokens or per-repo MR memory reads the old form or migrates it; otherwise it is `Breaking` (R2) |
| No manual bump | The change does not edit `version` in `package.json` or the lockfile; only `npm run version:bump` does |

## Decision log

- 2026-10-08: Adopted from the ReqAnchor versioning standard. CHANGELOG entry kinds drive the level, rather than
  Conventional Commits (which describe code, not user impact) or Changesets (which adds a dependency and a second place
  to describe each change). Changed for RepoHangar: a single published artifact, so no lockstep rule; the public
  surface is settings, MR profiles and rules, template placeholders, command ids, context keys, keybindings, stored
  user data and the supported GitLab, GitHub and VS Code versions; raising the minimum GitLab version is breaking
  because users cannot downgrade their server; a default keybinding change is `Changed`; the pre-1.0 rule shifts levels
  down one step during initial development.
