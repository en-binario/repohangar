import { describe, expect, it } from 'vitest';
import { parseRemoteUrl } from '../../src/git/remoteUrl';

// repo-registry :: Remote URL parsing matrix
const rows: [string, string, string | null, string | null, string | null][] = [
  ['parses an https URL with .git', 'https://gitlab.com/payments/billing-api.git', 'gitlab.com', 'payments/billing-api', 'https://gitlab.com/payments/billing-api'],
  ['keeps subgroups and a URL without .git', 'https://gitlab.com/payments/core/ledger', 'gitlab.com', 'payments/core/ledger', 'https://gitlab.com/payments/core/ledger'],
  ['drops credentials of an https URL', 'https://ci-bot:glpat-x1y2z3@git.acme.com/payments/billing-api.git', 'git.acme.com', 'payments/billing-api', 'https://git.acme.com/payments/billing-api'],
  ['keeps the port of an https URL in the web URL', 'https://git.acme.com:8443/payments/billing-api.git', 'git.acme.com', 'payments/billing-api', 'https://git.acme.com:8443/payments/billing-api'],
  ['drops the port of an ssh URL', 'ssh://git@git.acme.com:2222/payments/ledger.git', 'git.acme.com', 'payments/ledger', 'https://git.acme.com/payments/ledger'],
  ['parses an scp-style URL', 'git@github.com:acme/web-shop.git', 'github.com', 'acme/web-shop', 'https://github.com/acme/web-shop'],
  ['lower-cases the host of an scp-style URL without .git', 'git@GitHub.com:acme/web-shop', 'github.com', 'acme/web-shop', 'https://github.com/acme/web-shop'],
  ['drops a trailing slash', 'https://github.com/acme/web-shop/', 'github.com', 'acme/web-shop', 'https://github.com/acme/web-shop'],
  ['parses a git:// URL', 'git://git.acme.com/payments/ledger.git', 'git.acme.com', 'payments/ledger', 'https://git.acme.com/payments/ledger'],
  ['treats a local path as not hosted', '/srv/git/billing-api.git', null, null, null],
  ['treats a file URL as not hosted', 'file:///srv/git/billing-api.git', null, null, null],
  ['treats a Windows drive path as not hosted', 'C:/remotes/billing-api.git', null, null, null],
];

describe('parseRemoteUrl', () => {
  it.each(rows)('%s', (_name, url, host, projectPath, webUrl) => {
    const parsed = parseRemoteUrl(url);
    if (host === null) {
      expect(parsed.hosted).toBe(false);
      return;
    }
    expect(parsed).toMatchObject({ hosted: true, host, projectPath, webUrl });
    expect(JSON.stringify(parsed)).not.toContain('glpat-x1y2z3');
    expect(JSON.stringify(parsed)).not.toContain('ci-bot');
  });

  it('keeps the SSH user in the display URL', () => {
    expect(parseRemoteUrl('git@github.com:acme/web-shop.git').displayUrl).toBe('git@github.com:acme/web-shop.git');
  });
});
