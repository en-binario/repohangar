import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import { darkCodeTheme, lightCodeTheme } from './src/prism-themes';
import rehypeTableRegion from './src/rehype-table-region.mjs';

// The site is served by GitHub Pages at its own custom domain. SITE_URL and BASE_URL let a workflow build it for
// another location (for example https://en-binario.github.io/repohangar/ before the domain is set up).
const url = process.env.SITE_URL ?? 'https://repohangar.enbinario.com';
const baseUrl = process.env.BASE_URL ?? '/';
const repo = 'https://github.com/en-binario/repohangar';

/** Generated pages are edited at their source, not in site/docs/. */
const GENERATED_SOURCES: Record<string, string> = {
  'reference/settings.md': `${repo}/edit/main/package.json`,
  'reference/commands.md': `${repo}/edit/main/package.json`,
  'changelog.md': `${repo}/edit/main/CHANGELOG.md`,
};

const config: Config = {
  title: 'RepoHangar',
  tagline: 'Every Git repository in your workspace on one dashboard, with merge requests in one keystroke.',
  favicon: 'img/favicon.svg',
  url,
  baseUrl,
  organizationName: 'en-binario',
  projectName: 'repohangar',
  trailingSlash: true,

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  markdown: {
    // .md files are CommonMark, .mdx files are MDX: README prose such as <branch> stays text.
    format: 'detect',
    hooks: { onBrokenMarkdownLinks: 'throw' },
  },

  i18n: { defaultLocale: 'en', locales: ['en'] },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          editUrl: ({ docPath }) => GENERATED_SOURCES[docPath] ?? `${repo}/edit/main/site/docs/${docPath}`,
          rehypePlugins: [rehypeTableRegion],
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
        sitemap: { changefreq: 'weekly', priority: 0.5, ignorePatterns: ['/search/**'] },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.png',
    metadata: [
      { name: 'keywords', content: 'vscode extension, git, multi-repo, polyrepo, gitlab, github, merge request, pull request' },
    ],
    colorMode: { respectPrefersColorScheme: true },
    docs: { sidebar: { hideable: true } },
    navbar: {
      title: 'RepoHangar',
      logo: { alt: 'RepoHangar', src: 'img/logo.svg' },
      items: [
        { type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs' },
        { to: '/docs/reference/settings/', label: 'Settings', position: 'left' },
        { to: '/docs/changelog/', label: 'Changelog', position: 'left' },
        { href: repo, label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting started', to: '/docs/getting-started/' },
            { label: 'The dashboard', to: '/docs/guide/dashboard/' },
            { label: 'Merge requests', to: '/docs/merge-requests/creating/' },
          ],
        },
        {
          title: 'Reference',
          items: [
            { label: 'Settings', to: '/docs/reference/settings/' },
            { label: 'Commands', to: '/docs/reference/commands/' },
            { label: 'Changelog', to: '/docs/changelog/' },
          ],
        },
        {
          title: 'Project',
          items: [
            { label: 'GitHub', href: repo },
            { label: 'Report an issue', href: `${repo}/issues` },
            { label: 'Part of EnBinario', href: 'https://enbinario.com' },
          ],
        },
      ],
      copyright: `© ${new Date().getFullYear()} Jhon Tapia · MIT License · Part of <a href="https://enbinario.com">EnBinario</a>`,
    },
    prism: {
      theme: lightCodeTheme,
      darkTheme: darkCodeTheme,
      additionalLanguages: ['json', 'json5', 'bash', 'powershell'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
