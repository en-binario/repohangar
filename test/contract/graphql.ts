// GraphQL answers for the status query: one alias `r<n>` per repository, each answered from a recorded node.

import { HttpResponse } from 'msw';
import { fixture } from './helpers';

/** The aliases of a RepoHangarStatus query, in order. */
export function aliases(query: string): string[] {
  return [...query.matchAll(/\b(r\d+):\s*(?:project|repository)\(/g)].map((m) => m[1] as string);
}

/** Answers every alias with the recorded merge request (GitLab) or pull request (GitHub), or as `answer` decides. */
export function statusAnswer(
  provider: 'gitlab' | 'github',
  query: string,
  answer: (alias: string, index: number) => unknown = () => [recordedNode(provider)],
) {
  const data: Record<string, unknown> = {};
  aliases(query).forEach((alias, i) => {
    const nodes = answer(alias, i);
    data[alias] = nodes === null ? null : provider === 'gitlab' ? { mergeRequests: { nodes } } : { pullRequests: { nodes } };
  });
  return HttpResponse.json({ data });
}

export function recordedNode(provider: 'gitlab' | 'github'): Record<string, unknown> {
  return provider === 'gitlab' ? fixture('git.acme.com', 'merge-request-node') : fixture('github.com', 'pull-request-node');
}

export function schemaError(field: string, type: string) {
  return HttpResponse.json({
    errors: [{ message: `Field '${field}' doesn't exist on type '${type}'`, locations: [{ line: 1, column: 1 }], path: ['query RepoHangarStatus'] }],
  });
}
