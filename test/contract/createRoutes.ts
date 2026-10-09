// msw handlers for merge request creation, shaped like GitLab CE 17.10.0 and GitHub answers.

import { http, HttpResponse } from 'msw';
import { statusAnswer } from './graphql';

const GL = 'https://git.acme.com/api/v4';
const GH = 'https://api.github.com';

export const USERS: Record<string, number> = { 'ana.perez': 11, 'luis.gomez': 12, 'carla.ruiz': 13 };

/** No open review for any branch, on both hosts. */
export function noOpenReviews() {
  return [
    http.post('https://git.acme.com/api/graphql', async ({ request }) => statusAnswer('gitlab', ((await request.json()) as { query: string }).query, () => [])),
    http.post(`${GH}/graphql`, async ({ request }) => statusAnswer('github', ((await request.json()) as { query: string }).query, () => [])),
  ];
}

/** `GET /users?username=` for the known users; others are unknown. */
export function gitlabUsers() {
  return http.get(`${GL}/users`, ({ request }) => {
    const name = new URL(request.url).searchParams.get('username') ?? '';
    const id = USERS[name];
    return HttpResponse.json(id ? [{ id, username: name }] : []);
  });
}

export function gitlabProject(squashOption = 'default_off') {
  return http.get(`${GL}/projects/:id`, () => HttpResponse.json({ id: 31, default_branch: 'main', squash_option: squashOption }));
}

/**
 * `POST /projects/:id/merge_requests`, answering like CE: only the first reviewer and assignee are kept unless
 * `premium` is set.
 */
export function gitlabCreate(options: { premium?: boolean; iid?: number } = {}) {
  const byId = Object.fromEntries(Object.entries(USERS).map(([name, id]) => [id, name]));
  return http.post(`${GL}/projects/:id/merge_requests`, async ({ request }) => {
    const body = (await request.json()) as { reviewer_ids?: number[]; assignee_ids?: number[]; labels?: string; title: string };
    const keep = (ids: number[] | undefined) => (options.premium ? (ids ?? []) : (ids ?? []).slice(0, 1));
    const iid = options.iid ?? 142;
    return HttpResponse.json(
      {
        iid,
        web_url: `https://git.acme.com/payments/billing-api/-/merge_requests/${iid}`,
        title: body.title,
        reviewers: keep(body.reviewer_ids).map((id) => ({ id, username: byId[id] })),
        assignees: keep(body.assignee_ids).map((id) => ({ id, username: byId[id] })),
        labels: body.labels ? body.labels.split(',') : [],
      },
      { status: 201 },
    );
  });
}

export function githubCreate(number = 311) {
  return http.post(`${GH}/repos/acme/web-shop/pulls`, () =>
    HttpResponse.json({ number, html_url: `https://github.com/acme/web-shop/pull/${number}`, node_id: 'PR_kwDO' }, { status: 201 }),
  );
}

export function githubFollowUps(answers: { reviewers?: number; assignees?: number; labels?: number } = {}) {
  const answer = (status = 201) =>
    status >= 400
      ? HttpResponse.json({ message: 'Validation Failed', errors: [{ message: 'Could not resolve to a node' }] }, { status })
      : HttpResponse.json({}, { status });
  return [
    http.post(`${GH}/repos/acme/web-shop/pulls/:n/requested_reviewers`, () => answer(answers.reviewers)),
    http.post(`${GH}/repos/acme/web-shop/issues/:n/assignees`, () => answer(answers.assignees)),
    http.post(`${GH}/repos/acme/web-shop/issues/:n/labels`, () => answer(answers.labels ?? 200)),
    http.get(`${GH}/repos/acme/web-shop`, () => HttpResponse.json({ default_branch: 'main', allow_squash_merge: true, allow_auto_merge: true, delete_branch_on_merge: false })),
  ];
}
