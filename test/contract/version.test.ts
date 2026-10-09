// hosting-providers :: GitLab version matrix (R1–R5).

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { GitLabProvider } from '../../src/providers/gitlab';
import { Http } from '../../src/providers/http';
import { VersionCheck } from '../../src/providers/probe';
import { contractServer } from './helpers';

const { server, requests } = contractServer();
const ORIGIN = 'https://git.acme.com';
const TOKEN = { token: 'glpat-x1y2', apiHost: 'git.acme.com' };

function check(warnedBefore: string[] = []) {
  const warned = new Set(warnedBefore);
  const warnings: string[] = [];
  const provider = new GitLabProvider(new Http(), 'git.acme.com', ORIGIN);
  const versions = new VersionCheck({
    read: () => provider.version(TOKEN),
    warned: (host, version) => warned.has(`${host} ${version}`),
    markWarned: async (host, version) => void warned.add(`${host} ${version}`),
    warn: (text) => warnings.push(text),
  });
  return { versions, warnings, warned };
}

const answer = (body: Record<string, string>, status = 200) => server.use(http.get(`${ORIGIN}/api/v4/version`, () => HttpResponse.json(body, { status })));

describe('GitLab version matrix', () => {
  it('R1 shows nothing for 17.10.0', async () => {
    answer({ version: '17.10.0' });
    const { versions, warnings } = check();
    expect(await versions.version('git.acme.com')).toBe('17.10.0');
    expect(warnings).toEqual([]);
    expect(requests[0]?.headers.authorization).toBe('Bearer glpat-x1y2');
  });

  it('R2 shows nothing for 18.2.1-ee', async () => {
    answer({ version: '18.2.1-ee' });
    const { versions, warnings } = check();
    await versions.version('git.acme.com');
    expect(warnings).toEqual([]);
  });

  it('R3 warns once for 16.11.2', async () => {
    answer({ version: '16.11.2' });
    const { versions, warnings } = check();
    await versions.version('git.acme.com');
    await versions.version('git.acme.com');
    expect(warnings).toEqual([
      'git.acme.com runs GitLab 16.11.2. RepoHangar supports GitLab 17.10 or later; some merge request details can be missing.',
    ]);
    expect(requests).toHaveLength(1);
  });

  it('R4 shows nothing for 16.11.2 when the warning was shown before', async () => {
    answer({ version: '16.11.2' });
    const { versions, warnings } = check(['git.acme.com 16.11.2']);
    await versions.version('git.acme.com');
    expect(warnings).toEqual([]);
  });

  it('R5 assumes 17.10.0 with no warning when the version answers 401', async () => {
    answer({ message: '401 Unauthorized' }, 401);
    const { versions, warnings } = check();
    expect(await versions.version('git.acme.com')).toBe('17.10.0');
    expect(warnings).toEqual([]);
  });
});
