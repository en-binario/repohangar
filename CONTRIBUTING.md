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

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`). Keep one logical change per commit.
