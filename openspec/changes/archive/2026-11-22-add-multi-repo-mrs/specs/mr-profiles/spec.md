## ADDED Requirements

### Requirement: Related placeholder
The system SHALL render `{related}` in a description as the related-links section of `mr-creation` `Related links`
when the merge request is created in a selection batch, and as an empty string otherwise. A description of
`template:default` that does not contain `{related}` SHALL get no placeholder added; the section is appended when the
links are written.

#### Scenario: Related placeholder matrix

| # | Created in | `description` | Rendered at creation | After the related links are written |
| :--- | :--- | :--- | :--- | :--- |
| R1 | One repository (`m` with no selection) | `## What` ⏎ `{commits}` ⏎ `{related}` | **`## What` ⏎ `- Add notes field to invoice`** | *N/A* |
| R2 | A selection of 3 | `## What` ⏎ `{commits}` ⏎ `{related}` | **`## What` ⏎ `- Add notes field to invoice` ⏎ the section markers with no lines** | **The section at the place of `{related}`** |
| R3 | A selection of 3 | `template:default`, repository template without `{related}` | **The template and `{commits}`** | **The section appended after an empty line** |
