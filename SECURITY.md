# Security Policy

## Supported Versions

Security fixes are released for the latest published version of RepoHangar only.

| Version | Supported |
| :--- | :--- |
| Latest published release (`>= 0.1.0`) | Yes |
| Earlier versions | No |

## Reporting a Vulnerability

Please report security vulnerabilities privately using **Report a vulnerability** under this repository's **Security**
tab (GitHub Private Vulnerability Reporting), or email `admin@enbinario.com`.

Please do not open a public GitHub issue, pull request, or discussion for an undisclosed security vulnerability.

Include a clear description of the issue, reproduction steps, affected version, and expected impact. Redact any real
tokens, credentials, internal hostnames, or private repository paths before sending logs or screenshots.

### Response and Coordinated Disclosure

RepoHangar is an independently maintained open-source project provided on a best-effort basis with no guaranteed SLA.
We aim to acknowledge reports promptly, coordinate a fix before public disclosure, and credit reporters if they wish.

Please act in good faith: test only against repositories and Git hosts you own or are authorized to test, and avoid
disrupting third-party services or accessing others' data.

## Scope

### In Scope

- Extension host logic and command handling (`src/`)
- Dashboard and MR profile editor webviews, Content Security Policy, and host/webview message validation (`webview/`,
  `src/shared/protocol.ts`)
- Credential storage and isolation (`SecretStorage`, VS Code authentication sessions, `glab`/`gh` token import, HTTP
  host/redirect enforcement)
- Subprocess invocations (`git`, `glab`, `gh`) and argument validation

### Out of Scope

- Vulnerabilities in Visual Studio Code itself, the built-in `vscode.git` extension, Git, `gh`, `glab`, GitLab, GitHub,
  or independent third-party extensions such as Git Graph (`mhutchie.git-graph`); please report those directly to their
  respective maintainers or vendors.
- Risks arising from intentionally trusting an untrusted workspace in VS Code.

For details on network activity, local storage, and privacy, see
[Privacy and security](https://repohangar.enbinario.com/docs/privacy-and-security/).
