# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities privately using **Report a vulnerability** under this repository's **Security** tab (GitHub Private Vulnerability Reporting), or email `hello@enbinario.com`.

Please do not open a public GitHub issue for a security vulnerability before a fix is released.

## Scope

RepoHangar runs locally inside VS Code and talks directly to the Git hosting providers (GitLab, GitHub) configured by the user. Credentials are stored only in VS Code `SecretStorage` or retrieved from VS Code's built-in GitHub authentication provider.
