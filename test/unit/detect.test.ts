import { describe, expect, it } from 'vitest';
import { detectProvider } from '../../src/providers/detect';
import { parseRemoteUrl } from '../../src/git/remoteUrl';

// repo-registry :: Provider detection matrix
const rows: [string, string | null, Record<string, string>, string | undefined, string | null][] = [
  ['has no provider without a remote', null, {}, undefined, null],
  ['has no provider for a not-hosted remote', '/srv/git/billing-api.git', {}, 'https://github.acme.com', null],
  ['uses repohangar.hosts', 'https://git.acme.com/a/b.git', { 'git.acme.com': 'gitlab' }, undefined, 'gitlab'],
  ['matches repohangar.hosts case-insensitively', 'https://Git.Acme.com/a/b.git', { 'git.acme.com': 'gitlab' }, undefined, 'gitlab'],
  ['lets repohangar.hosts override a well-known host', 'https://github.com/a/b.git', { 'github.com': 'gitlab' }, undefined, 'gitlab'],
  ['detects github.com', 'https://github.com/a/b.git', {}, undefined, 'github'],
  ['detects gitlab.com', 'https://gitlab.com/a/b.git', {}, undefined, 'gitlab'],
  ['detects the GitHub Enterprise host', 'https://github.acme.com/a/b.git', {}, 'https://github.acme.com', 'github'],
  ['reports unknown when GitHub Enterprise is another host', 'https://git.acme.com/a/b.git', {}, 'https://github.acme.com', 'unknown'],
  ['reports unknown without any match', 'https://git.acme.com/a/b.git', {}, undefined, 'unknown'],
];

describe('detectProvider', () => {
  it.each(rows)('%s', (_name, url, hosts, ghe, expected) => {
    const parsed = url === null ? undefined : parseRemoteUrl(url);
    const host = parsed?.hosted ? parsed.host : undefined;
    expect(detectProvider(host, hosts, ghe)).toBe(expected);
  });
});
