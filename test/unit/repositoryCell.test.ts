import { describe, expect, it } from 'vitest';
import { parseRemoteUrl } from '../../src/git/remoteUrl';
import { repositoryCell } from '../../src/shared/format';
import type { Provider } from '../../src/shared/model';
import { row } from './rows';

// dashboard :: Repository cell matrix
const rows: [string, string, string | null, Provider | null, string, string][] = [
  ['shows the GitLab badge and strips credentials', '/home/dev/code/acme/backend/billing-api', 'https://ci-bot:glpat-x1y2z3@git.acme.com/payments/billing-api.git', 'gitlab', 'billing-api GL', '/home/dev/code/acme/backend/billing-api\nhttps://git.acme.com/payments/billing-api.git'],
  ['shows the GitHub badge', '/home/dev/code/acme/frontend/web-shop', 'git@github.com:acme/web-shop.git', 'github', 'web-shop GH', '/home/dev/code/acme/frontend/web-shop\ngit@github.com:acme/web-shop.git'],
  ['shows the unknown host badge', '/home/dev/code/acme/backend/notifications', 'https://git.other.org/team/notifications.git', 'unknown', 'notifications ?', '/home/dev/code/acme/backend/notifications\nhttps://git.other.org/team/notifications.git'],
  ['shows no badge for a local remote', '/home/dev/code/acme/infra/infra-charts', '/srv/git/infra-charts.git', null, 'infra-charts', '/home/dev/code/acme/infra/infra-charts\n/srv/git/infra-charts.git'],
  ['shows No remote', '/home/dev/code/acme/tools/scratch', null, null, 'scratch', '/home/dev/code/acme/tools/scratch\nNo remote'],
];

describe('repositoryCell', () => {
  it.each(rows)('%s', (_name, path, url, provider, text, tooltip) => {
    const name = path.split('/').pop() as string;
    const remote = url === null ? null : { name: 'origin', displayUrl: parseRemoteUrl(url).displayUrl };
    const cell = repositoryCell(row({ name, path, remote, provider }));
    expect(cell.text).toBe(text);
    expect(cell.tooltip).toBe(tooltip);
  });
});
