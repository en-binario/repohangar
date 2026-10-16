// mr-creation :: User search request matrix (R1–R3).

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { GitHubProvider } from '../../src/providers/github';
import { GitLabProvider } from '../../src/providers/gitlab';
import { Http } from '../../src/providers/http';
import { contractServer } from './helpers';

const { server, requests } = contractServer();
const GL = { token: 'glpat-x1y2', apiHost: 'git.acme.com' };
const GH = { token: 'gho_x1y2', apiHost: 'api.github.com' };
const MEMBERS = 'https://git.acme.com/api/v4/projects/payments%2Fbilling-api/members/all';

const member = (username: string, name: string, state = 'active') => ({ id: username.length, username, name, state, access_level: 30 });

describe('User search request matrix', () => {
  it('R1 asks GitLab for the project members matching the text and leaves out inactive users', async () => {
    server.use(
      http.get(MEMBERS, () =>
        HttpResponse.json([member('jtapiap', 'Jhon Wilber Tapia Pinto'), member('jhon.old', 'Jhon Old', 'blocked'), member('jruiz', 'Jhon Ruiz')]),
      ),
    );
    const users = await new GitLabProvider(new Http(), 'git.acme.com', 'https://git.acme.com').searchUsers('payments/billing-api', 'jhon', GL);
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([`GET ${MEMBERS}?query=jhon&per_page=20`]);
    expect(users).toEqual([
      { username: 'jtapiap', name: 'Jhon Wilber Tapia Pinto' },
      { username: 'jruiz', name: 'Jhon Ruiz' },
    ]);
  });

  it('R2 keeps the first 10 active GitLab users in answer order', async () => {
    const fourteen = Array.from({ length: 14 }, (_, i) => member(`user${i + 1}`, `User ${i + 1}`));
    server.use(http.get(MEMBERS, () => HttpResponse.json(fourteen)));
    const users = await new GitLabProvider(new Http(), 'git.acme.com', 'https://git.acme.com').searchUsers('payments/billing-api', 'a', GL);
    expect(requests[0]?.url).toBe(`${MEMBERS}?query=a&per_page=20`);
    expect(users.map((u) => u.username)).toEqual(['user1', 'user2', 'user3', 'user4', 'user5', 'user6', 'user7', 'user8', 'user9', 'user10']);
  });

  it('R3 asks GitHub for the assignable users matching the text with one GraphQL request', async () => {
    server.use(
      http.post('https://api.github.com/graphql', () =>
        HttpResponse.json({
          data: { repository: { assignableUsers: { nodes: [{ login: 'jtapiap', name: 'Jhon Tapia' }, { login: 'jruiz', name: null }] } } },
        }),
      ),
    );
    const users = await new GitHubProvider(new Http(), 'github.com', 'https://github.com').searchUsers('acme/web-shop', 'jhon', GH);
    expect(requests).toHaveLength(1);
    const body = requests[0]?.body as { query: string; variables: Record<string, string> };
    expect(requests[0]?.url).toBe('https://api.github.com/graphql');
    expect(body.query).toContain('assignableUsers(query: $q, first: 10)');
    expect(body.variables).toEqual({ owner: 'acme', name: 'web-shop', q: 'jhon' });
    expect(users).toEqual([
      { username: 'jtapiap', name: 'Jhon Tapia' },
      { username: 'jruiz', name: '' },
    ]);
  });
});
