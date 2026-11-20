# RepoHangar documentation site

The source of **https://repohangar.enbinario.com**, built with [Docusaurus](https://docusaurus.io) and deployed to
GitHub Pages by [`.github/workflows/site.yml`](../.github/workflows/site.yml).

```bash
cd site
npm ci
npm start          # dev server at http://localhost:3000, with live reload
npm run build      # production build in build/; fails on broken links and anchors
npm run e2e        # Playwright + axe against the build (light and dark, desktop and mobile)
npm run typecheck
```

## What is written and what is generated

| Path | Source |
|---|---|
| `docs/**/*.md` | Written by hand. Update them in the same pull request as the behaviour they describe |
| `docs/reference/settings.md` | **Generated** from `contributes.configuration` in `../package.json` |
| `docs/reference/commands.md` | **Generated** from `contributes.commands`, `keybindings` and `menus` in `../package.json` |
| `docs/changelog.md` | **Generated** from `../CHANGELOG.md` |
| `static/media/*.gif` | **Copied** from `../media/` (the README demos) |
| `static/img/social-card.png` | Rendered by `node scripts/render-social-card.mjs`; committed |

`scripts/generate.mjs` writes the generated files before every `start` and `build`, and they are gitignored. To change
them, change the manifest or the CHANGELOG: a new or changed setting reaches the settings reference on the next
build, as [docs/versioning.md](../docs/versioning.md) §6 requires.

The pages use the same made-up example data as the rest of the repository (`git.acme.com`, `acme/web-shop`, the
fixture users); see [AGENTS.md](../AGENTS.md).

## Deployment

| Event | What happens |
|---|---|
| Pull request touching `site/`, `package.json`, `CHANGELOG.md` or `media/` | Build, type check and e2e; the build is uploaded as the `site-preview` artifact |
| Push of a `v*` tag | Build, tests, deploy to GitHub Pages, so the docs match the released extension |
| **Run workflow** | The same deploy by hand (for example before the first release) |

One-time setup in the repository: **Settings → Pages → Source: GitHub Actions**, **Custom domain**
`repohangar.enbinario.com` (DNS: `CNAME repohangar → en-binario.github.io.`), then **Enforce HTTPS**; and in
**Settings → Environments → github-pages**, allow the `v*` tags as well as the default branch.

`SITE_URL` and `BASE_URL` build the site for another location, for example
`SITE_URL=https://en-binario.github.io BASE_URL=/repohangar/ npm run build`.
