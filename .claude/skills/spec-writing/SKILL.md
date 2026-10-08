---
name: spec-writing
description: Write or review OpenSpec capability specs and spec deltas for RepoHangar against docs/spec-writing.md (decision tables, RFC 2119 casing, GIVEN/WHEN/THEN, checkable outcomes, delta limits, table-to-test tasks). Use when drafting or revising openspec/changes/*/specs/**/spec.md or openspec/specs/**/spec.md, or when asked to review a proposal's specs.
---

Write or review RepoHangar specs so that every outcome is exact and every combination of conditions is visible.

**Input**: a change name (`openspec/changes/<change>/`), a spec path, or "review" plus one of those. If none is given,
run `openspec list --json` and ask which change.

## Steps

1. **Read the standard.** Read `docs/spec-writing.md` in full before writing or reviewing. It is the authority; this
   skill only orders the work.

2. **Read the context.** Read the change's `proposal.md`, and for every capability it touches, the current
   `openspec/specs/<capability>/spec.md` if it exists. Note whether each capability is archived (in `openspec/specs/`)
   or created by an unarchived change (only `ADDED` is allowed then, with `Depends on:` in the proposal).

3. **Choose the form per requirement** (standard §3). List the conditions the outcome depends on: repo state,
   upstream, operation in progress, provider, token, GitLab version or tier, project policy, setting value, Git Graph
   installed, `scm.repositories.selectionMode`, Workspace Trust, selection or focused row. Two or more → a decision
   table under `#### Scenario: … matrix`. One condition or a sequence over time → GIVEN/WHEN/THEN.

4. **Write or check each table** (standard §4): first column `#` with `R1…` ids never reused; conditions, then bold
   outcomes, then optional `Notes`; no blank cells (`*Any*`, `*N/A*`); short-circuit rows first in the order the code
   checks them; the requirement text states the rule and the table does not contradict it. Enumerate the combinations
   and point out any that has no row.

5. **Check outcomes** (standard §6): each names the cell text, the job result (`ok`, `skipped: <reason>`,
   `failed: <message>`), the exact notification and its buttons, the Git call or `git` arguments, the provider request
   and fields, the setting and scope written, or the state left unchanged. Replace every banned phrase ("is
   rejected", "shows an error", "properly", "as expected", "etc.", "updates the dashboard").

6. **Check names and keys** (standard §8): settings by key and default, commands by id, menus by id and title,
   context keys by name. Every `**Constraints:**` item is exercised by a row or scenario.

7. **Check the delta mechanics** (standard §9): a `MODIFIED` block copies every existing scenario verbatim; dropping,
   renaming or converting a scenario needs `REMOVED` + `ADDED` under a new name with `> **Supersedes:** <old name>`;
   never `ADDED` and `REMOVED` of the same name; no `## Non-Goals` section; removed or renamed behaviour, settings or
   commands are updated in every other spec that mentions them (search `openspec/specs/`).

8. **Check the tasks** (standard §10): every table has one task in `tasks.md` naming the table, its capability and
   its test file, with one case per row id (`test/unit`, `test/contract`, `test/integration`, `test/ui`, the nightly
   GitLab job, or a manual checklist).

9. **Validate.** Run `openspec validate <change> --strict` and fix every error.

## Output

- **Writing:** edit the delta specs and `tasks.md` in place, then summarize what changed per requirement.
- **Reviewing:** do not edit unless asked. Report findings as a list grouped by the checklist rows of standard §11
  (Form, RFC casing, Scenario bullets, Scenario names, Table shape, Coverage, Vague outcomes, Failures, Safety,
  Constraints, Keys, Change order, Cross-references, Non-goals, Tasks), each with the file, the requirement or row id,
  and the fix. End with the result of `openspec validate --strict`.
