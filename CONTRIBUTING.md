# Contributing to RepoHangar

Thank you for your interest in contributing to RepoHangar.

## Setup

Requires Node.js 20+ (Node 24 recommended) and npm.

```sh
npm ci
npm run typecheck
npm test
npm run test:integration
npm run test:ui
```

To work on the documentation site (`https://repohangar.enbinario.com`):

```sh
cd site
npm ci
npm start
```

## Example Data Rule

Never use real internal hostnames, private repository paths, real credentials, or people's names from logs or screenshots. Use the synthetic examples documented in [AGENTS.md](AGENTS.md) (`git.acme.com`, `acme/web-shop`, `ana.perez`, `luis.gomez`, `carla.ruiz`, `jdoe`).

## Versioning and Changelog

RepoHangar follows Semantic Versioning driven by [CHANGELOG.md](CHANGELOG.md); see [docs/versioning.md](docs/versioning.md):

- Every user-visible change adds a bullet under `## Unreleased` prefixed with its bold kind: `Breaking`, `Removed`, `Added`, `Changed`, `Deprecated`, `Fixed`, or `Security`.
- Never edit `version` in `package.json` or `package-lock.json` by hand; `npm run version:bump` updates them on release.
- Run `npm run version:check` (also run by `npm test`) before opening a pull request.

## Licensing of Contributions

RepoHangar is licensed under the [MIT License](LICENSE). By submitting a pull request, issue patch, documentation edit,
or other contribution to this repository, you agree that:

1. **Inbound = Outbound:** Your contribution is licensed under the repository's [MIT License](LICENSE) (consistent with
   the GitHub Terms of Service, *Contributions Under Repository License*), without additional restrictions.
2. **Authority to Contribute:** The contribution is your own original work (or properly licensed third-party material
   compatible with MIT), and you have the legal right and any required employer authorization to grant these rights.
3. **Third-Party Code and Assets:** Do not submit proprietary, confidential, or incompatible-license (for example,
   GPL/AGPL) code or assets. If a change adds or updates a bundled runtime dependency or third-party source file,
   document its copyright and license in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and ensure `npm test` passes
   its license compliance checks.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). Keep one logical change per commit.
