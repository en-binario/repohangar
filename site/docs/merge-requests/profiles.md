---
title: MR profiles
description: Named defaults for new merge requests and pull requests, rules that pick a profile per repository and branch, and the title and description placeholders.
---

# MR profiles

A profile is a named set of defaults for new merge requests and pull requests, in
[`repohangar.mr.profiles`](../reference/settings.md#repohangar-mr-profiles). Profiles live at user scope (yours, in
every workspace) or workspace scope (shared with the team); a workspace profile overrides the user profile of the
same name key by key. [Rules](#rules) choose a profile per repository and branch.

You rarely need to write them by hand: use the [profile editor](#the-profile-editor) or
[Save as defaults](#save-as-defaults).

## Example

```json5
"repohangar.mr.profiles": {
  "default": {
    "target": "{defaultBranch}",
    "reviewers": ["ana.perez", "luis.gomez"],
    "assignees": ["@me"],
    "labels": ["needs-review"],
    "squash": true,
    "deleteSourceBranch": true,
    "draft": false,
    "title": "{type}: {ticket} {branchTitle}",
    "description": "template:default",   // the repository's template, else the commit list
    "pushIfNeeded": true,
    "openAfterCreate": "notify"           // "notify" | "browser" | "none"
  },
  "hotfix": {
    "extends": "default",
    "target": "release/{latestRelease}",
    "reviewers": ["team:sre", "ana.perez"],
    "labels": ["hotfix"]
  }
},
// Matched against "<host>/<project path>" and the branch; the first match wins.
"repohangar.mr.rules": [
  { "branch": "hotfix/**", "profile": "hotfix" },
  { "repo": "git.acme.com/payments/**", "profile": "default", "set": { "reviewers": ["carla.ruiz"] } },
  { "repo": "github.com/acme/web-*", "profile": "default", "set": { "labels": ["frontend"] } }
]
```

Every key of a profile is described in the [settings reference](../reference/settings.md#repohangar-mr-profiles).
A profile without `extends` takes the keys it leaves out from `default`, then from the built-in defaults.

## Reviewers and assignees

Reviewers and assignees are usernames on the host:

- `@me` is you on that host. You're never your own reviewer.
- `team:<slug>` is a GitHub team; it's left out on GitLab, with a note.
- A GitLab project that turns squash off or requires it wins over the profile, and the drawer says so.
- GitLab Free keeps one reviewer; RepoHangar reports the ones it couldn't add.

## Rules

[`repohangar.mr.rules`](../reference/settings.md#repohangar-mr-rules) chooses a profile per repository and branch.
Each rule matches `repo` (a glob on `<host>/<project path>`) and `branch` (a glob on the branch name); the first rule
whose globs match wins, and its `set` overrides values of that profile for those repositories. A repository no rule
matches uses `default`.

## Placeholders

Titles, descriptions and targets take these placeholders, shown for the branch `feature/ABC-123-add-billing-notes`:

| Placeholder | Value |
|---|---|
| `{branch}` | `feature/ABC-123-add-billing-notes` |
| `{type}` | `feat`, from the branch prefix through [`repohangar.mr.typeMap`](../reference/settings.md#repohangar-mr-typemap) |
| `{ticket}` | `ABC-123`, the first match of [`repohangar.mr.ticketPattern`](../reference/settings.md#repohangar-mr-ticketpattern); empty without one |
| `{branchTitle}` | `Add billing notes` |
| `{firstCommit}` | The subject of the first commit ahead of the target |
| `{commits}` | The subjects of the commits ahead of the target, one bullet each (at most 30) |
| `{repo}` | `billing-api` |
| `{defaultBranch}` | `main` |
| `{latestRelease}` | The highest `release/*` branch of the remote, by version |
| `{me}` | Your username on the host |
| `{related}` | The links to the other merge requests created with it (see [several repositories](several-repositories.md)); empty for one repository |

With exactly one commit ahead and the default title, the commit subject is the title.

## Description templates

`"description": "template:default"` uses the repository's own template, read from the working tree:
`.gitlab/merge_request_templates/Default.md` on GitLab, `.github/pull_request_template.md` on GitHub. Without one, the
description is the commit list. `template:<name>` uses another template from `.gitlab/merge_request_templates/` or
`.github/PULL_REQUEST_TEMPLATE/`.

## The profile editor

**RepoHangar: Edit MR Profiles**, the `⚙` button of the dashboard toolbar, or **Set up a default profile** in the
first-run panel open a form with a **User** / **Workspace** switch:

- It lists the profiles of that scope (`★ default` first), the rules in order (**New rule**, move, delete) and every
  field of the selected profile, with a live preview of the title for the focused dashboard row.
- A field the profile doesn't set shows the inherited value, dimmed, with *Inherited from …* as its tooltip.
- **Reviewers** and **Assignees** search users like the drawer, in the repository chosen in **Search users in** (the
  focused dashboard row's repository when it's on GitLab or GitHub, else the first one by name).
- **Save** writes that scope only, through VS Code's own settings editing, so the rest of `settings.json` and its
  comments stay as they are. Comments *inside* the `repohangar.mr.profiles` value aren't kept; use **Open
  settings.json** for those.
- If the settings change elsewhere while you have unsaved edits, the editor asks before reloading.

## Save as defaults

**Save as defaults ▾** in the [Create MR drawer](creating.md#the-create-mr-drawer) keeps the reviewers, assignees,
labels, squash, delete source branch and draft values that differ from the profile, without the title, description
or target:

| Item | Saved to |
|---|---|
| **For me (all workspaces)** | The profile at user scope |
| **For this workspace (shared)** | The profile at workspace scope (`.vscode/settings.json` or the `.code-workspace` file) |
| **For this repo only** | This repository, on this machine and in this workspace only |

What a repository remembers is applied after the rule's `set` and before your edits in the drawer. The profile editor
lists it (`billing-api → reviewers +carla.ruiz`) with **Forget**.
