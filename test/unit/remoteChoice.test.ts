import { describe, expect, it } from 'vitest';
import { chooseRemote, type RemoteEntry } from '../../src/git/remoteChoice';

const r = (name: string): RemoteEntry => ({ name, fetchUrl: `https://git.acme.com/${name}.git` });

// repo-registry :: Remote choice matrix
const rows: [string, string | undefined, RemoteEntry[], string | null][] = [
  ['uses the remote of the upstream', 'fork', [r('fork'), r('origin')], 'fork'],
  ['falls back to origin when the upstream remote was removed', 'gone', [r('origin'), r('fork')], 'origin'],
  ['uses origin without an upstream', undefined, [r('origin'), r('fork')], 'origin'],
  ['uses origin with a detached HEAD', undefined, [r('origin')], 'origin'],
  ['uses the first remote without origin', undefined, [r('alpha'), r('beta')], 'alpha'],
  ['records no remote when there is none', undefined, [], null],
];

describe('chooseRemote', () => {
  it.each(rows)('%s', (_name, upstreamRemote, remotes, expected) => {
    expect(chooseRemote(remotes, upstreamRemote)?.name ?? null).toBe(expected);
  });

  it('uses the push URL when the remote has no fetch URL', () => {
    expect(chooseRemote([{ name: 'origin', pushUrl: 'git@github.com:acme/a.git' }], undefined)).toEqual({
      name: 'origin',
      url: 'git@github.com:acme/a.git',
    });
  });
});
