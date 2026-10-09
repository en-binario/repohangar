// mr-profiles :: Squash policy matrix (R1–R6), with GitLab's `GET /projects/:id` answers.

import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { billing, harness, webShop } from './flowHarness';
import { contractServer } from './helpers';
import { githubFollowUps, gitlabProject, noOpenReviews } from './createRoutes';

const { server } = contractServer();

async function prepared(rowFor: 'gitlab' | 'github', squash: boolean) {
  const h = harness([rowFor === 'gitlab' ? billing() : webShop()], { user: { default: { squash } } });
  const p = await h.flow.prepare(rowFor === 'gitlab' ? 'billing' : 'web');
  if (p.kind !== 'prepared') throw new Error(JSON.stringify(p));
  return [p.values.squash, p.notes.find((n) => /squash/i.test(n))];
}

describe('Squash policy matrix', () => {
  it.each<[string, string, boolean, boolean, string | undefined]>([
    ['R1 turns squash off when the project never squashes', 'never', true, false, 'Squash is turned off for payments/billing-api.'],
    ['R2 turns squash on when the project requires it', 'always', false, true, 'payments/billing-api requires squash.'],
    ['R3 keeps the profile value with default_on', 'default_on', false, false, undefined],
    ['R4 keeps the profile value with default_off', 'default_off', true, true, undefined],
  ])('%s', async (_name, option, squash, effective, note) => {
    server.use(...noOpenReviews(), gitlabProject(option));
    expect(await prepared('gitlab', squash)).toEqual([effective, note]);
  });

  it('R5 keeps the profile value when the project cannot be read (403)', async () => {
    server.use(...noOpenReviews(), http.get('https://git.acme.com/api/v4/projects/:id', () => HttpResponse.json({ message: '403 Forbidden' }, { status: 403 })));
    expect(await prepared('gitlab', true)).toEqual([true, undefined]);
  });

  it('R6 keeps the profile value on GitHub', async () => {
    server.use(...noOpenReviews(), ...githubFollowUps());
    expect(await prepared('github', true)).toEqual([true, undefined]);
  });
});
