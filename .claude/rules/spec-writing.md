---
paths:
  - "openspec/**/*.md"
---

# Spec writing

Specs and spec deltas follow `docs/spec-writing.md`; read it before editing a spec, and use the `spec-writing` skill
to write or review a delta. In short:

- An outcome that depends on two or more conditions is a decision table under `#### Scenario: … matrix`: first column
  `#` with ids `R1…` never reused, conditions then bold outcomes, no blank cells (`*Any*`, `*N/A*`), short-circuit
  rows first.
- Requirement text uses uppercase RFC 2119 keywords (SHALL, MUST, MUST NOT); scenarios and cells use none.
- Non-table scenario bullets start with `**GIVEN**`, `**WHEN**`, `**THEN**` or `**AND**`.
- Outcomes are checkable: cell text, `ok` / `skipped: <reason>` / `failed: <message>`, the exact notification and its
  buttons, the Git call, the provider request, the setting and scope written, or the unchanged state. Never "is
  rejected", "shows an error", "properly", "as expected".
- Settings by key and default, commands by id. Non-goals inside `## Purpose`.
- `MODIFIED` copies every existing scenario. Against a capability from an unarchived change, `ADDED` only.
- Every table gets a task in `tasks.md` naming its test, one case per row id.
- Run `openspec validate <change> --strict` after editing.
