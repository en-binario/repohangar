---
title: Legal and trademarks
description: License terms, third-party attributions, trademark and non-affiliation notices, warranty disclaimer, and contributor licensing for RepoHangar.
---

# Legal and trademarks

## License

RepoHangar (source code and documentation) is free and open-source software licensed under the
[MIT License](https://github.com/en-binario/repohangar/blob/main/LICENSE), © 2026 Jhon Tapia - enbinario.com.

## Third-party software and attributions

The packaged RepoHangar VSIX bundles the following third-party components, documented with full notices in
[THIRD_PARTY_NOTICES.md](https://github.com/en-binario/repohangar/blob/main/THIRD_PARTY_NOTICES.md) (included in every
VSIX):

| Component | License | Attribution and modification status |
|---|---|---|
| [Preact](https://github.com/preactjs/preact) | MIT | Copyright (c) 2015-present Jason Miller. Bundled unmodified into the webview scripts. |
| [@vscode/codicons](https://github.com/microsoft/vscode-codicons) | MIT (code/CSS) and [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/legalcode) (icons) | Copyright (c) Microsoft Corporation. `codicon.css` and `codicon.ttf` are distributed unmodified; icons are offered "as-is" under CC-BY-4.0 (Section 5 disclaimer of warranties). |

Source-only third-party files retained in the GitHub repository (such as `src/git/git.d.ts` from
[microsoft/vscode](https://github.com/microsoft/vscode) under MIT) are excluded from the VSIX and documented in
[THIRD_PARTY_NOTICES.md](https://github.com/en-binario/repohangar/blob/main/THIRD_PARTY_NOTICES.md).

## Trademarks and non-affiliation

All third-party product names, logos, and brands mentioned in RepoHangar, its Marketplace listings, and this
documentation are trademarks or registered trademarks of their respective owners:

- **Git** is a trademark of Software Freedom Conservancy. "Git" appears in RepoHangar's descriptions strictly to
  indicate compatibility with Git repositories and is not part of the product name.
- **GitLab** is a registered trademark of GitLab Inc.
- **GitHub** and **GitHub Enterprise** are registered trademarks of GitHub, Inc.
- **Visual Studio Code**, **VS Code**, and **Microsoft** are trademarks or registered trademarks of Microsoft
  Corporation.
- **Git Graph** (`mhutchie.git-graph`) is an independent third-party VS Code extension by its respective author.
- **Open VSX** is a project of the Eclipse Foundation. **VSCodium**, **Cursor**, **Windsurf**, **Windows**,
  **macOS**, and **Linux** belong to their respective owners.

RepoHangar is an independent open-source project by **EnBinario** (Jhon Tapia) and is **not affiliated with, endorsed
by, or sponsored by** any of the organizations or authors above.

## Disclaimer of warranty and user responsibilities

As stated in the [MIT License](https://github.com/en-binario/repohangar/blob/main/LICENSE), RepoHangar is provided
**"AS IS"**, without warranty of any kind, express or implied, including but not limited to the warranties of
merchantability, fitness for a particular purpose, and non-infringement.

By using RepoHangar, you acknowledge that:

- **Git and hosting actions:** You are solely responsible for reviewing local Git operations, branch pushes, merge
  requests, pull requests (including when `repohangar.mr.quickCreate` is set to `"direct"`), and repository settings
  changes. RepoHangar includes built-in safeguards (it never merges merge requests, never force-pushes, restricts batch
  pulls to `--ff-only`, and asks confirmation before destructive actions), but cannot guarantee against data loss or
  misconfiguration.
- **Hosting provider terms:** You are responsible for ensuring your use of personal access tokens, CLI credentials, and
  API queries complies with your organization's policies and with GitLab's or GitHub's applicable terms of service.
- **Third-party integrations:** Integrations with GitLab, GitHub, Git Graph (`mhutchie.git-graph`), and best-effort VS
  Code Source Control selection (which uses internal VS Code commands) depend on third-party software and APIs that may
  change or become unavailable without notice.

## Contributions

Contributions submitted to `en-binario/repohangar` are accepted under an **Inbound = Outbound** model under the
repository's MIT License. See
[CONTRIBUTING.md](https://github.com/en-binario/repohangar/blob/main/CONTRIBUTING.md#licensing-of-contributions) for
details.

## Contact and notices

- **Bug reports and feature requests:** [GitHub Issues](https://github.com/en-binario/repohangar/issues)
- **Security disclosures:** [GitHub Private Vulnerability Reporting](https://github.com/en-binario/repohangar/security)
  or `admin@enbinario.com`
- **Legal, licensing, or trademark notices:** `admin@enbinario.com`
