---
paths:
  - "CHANGELOG.md"
  - "package.json"
  - "package-lock.json"
---

# Versioning

Versions and the changelog follow `docs/versioning.md`; use the `changelog-entry` skill to add an entry.

- Every user-observable change adds one entry under `## Unreleased` in `CHANGELOG.md`: a top-level bullet whose first
  word is its kind in bold (`Breaking`, `Removed`, `Added`, `Changed`, `Deprecated`, `Fixed`, `Security`), chosen
  from the table in §2.
- `Breaking` and `Removed` entries end with `Migrate: …`. Past release sections are never rewritten.
- Never edit `version` in `package.json` or `package-lock.json` by hand; only the release script (§5) does.
- The release level follows from the entries (§4), one step lower while the version is below `1.0.0`.
