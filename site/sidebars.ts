import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    'getting-started',
    {
      type: 'category',
      label: 'Working with repositories',
      collapsed: false,
      items: ['guide/dashboard', 'guide/batch-operations', 'guide/branches'],
    },
    {
      type: 'category',
      label: 'Merge requests and pull requests',
      collapsed: false,
      items: [
        'merge-requests/status-and-sign-in',
        'merge-requests/creating',
        'merge-requests/several-repositories',
        'merge-requests/profiles',
        'merge-requests/gitlab-without-token',
      ],
    },
    {
      type: 'category',
      label: 'Integrations',
      items: ['integrations/git-graph', 'integrations/explorer-and-source-control', 'migrating-from-git-graph-opener'],
    },
    {
      type: 'category',
      label: 'Reference',
      items: ['reference/settings', 'reference/commands', 'privacy-and-security', 'troubleshooting'],
    },
    'changelog',
  ],
};

export default sidebars;
