import { describe, expect, it } from 'vitest';
import { statusBarModel } from '../../src/shared/format';
import type { RowData } from '../../src/shared/model';
import { counts, gitlabReview, loaded, row } from './rows';

/** n rows, the first `behind` of them behind by 1 and the last `dirty` of them dirty. */
function repos(n: number, behind: number, dirty: number): RowData[] {
  return Array.from({ length: n }, (_, i) =>
    row({
      id: `repo-${i}`,
      name: `svc-${String(i + 1).padStart(2, '0')}`,
      head: { kind: 'branch', name: 'main', upstream: 'origin/main', ahead: 0, behind: i < behind ? 1 : 0 },
      counts: i >= n - dirty ? counts(0, 1, 0, 0) : counts(0, 0, 0, 0),
    }),
  );
}

// status-bar :: Status bar text matrix
const rows: [string, boolean, number, number, number, string | null][] = [
  ['is hidden when the setting is off', false, 14, 3, 2, null],
  ['is hidden without repositories', true, 0, 0, 0, null],
  ['shows one repo', true, 1, 0, 0, '$(git-branch) 1 repo'],
  ['shows the repository count', true, 14, 0, 0, '$(git-branch) 14 repos'],
  ['adds the behind count', true, 14, 3, 0, '$(git-branch) 14 repos  $(arrow-down)3'],
  ['adds the dirty count', true, 14, 0, 2, '$(git-branch) 14 repos  $(circle-filled)2'],
  ['adds both counts', true, 14, 3, 2, '$(git-branch) 14 repos  $(arrow-down)3  $(circle-filled)2'],
];

describe('statusBarModel text', () => {
  it.each(rows)('%s', (_name, enabled, n, behind, dirty, text) => {
    const model = statusBarModel(repos(n, behind, dirty), enabled);
    expect(model.visible).toBe(text !== null);
    if (text !== null) expect(model.text).toBe(text);
  });
});

// status-bar :: Open review segment matrix
describe('statusBarModel open review segment', () => {
  /** n rows; the first `reviews` have an open merge request, the next `signIn` read Sign in. */
  function withReviews(n: number, behind: number, dirty: number, reviews: number, signIn = 0): RowData[] {
    return repos(n, behind, dirty).map((r, i) => {
      if (i < reviews) return { ...r, review: loaded(gitlabReview({ number: 100 + i })) };
      if (i < reviews + signIn) return { ...r, review: { kind: 'signIn', host: 'git.acme.com' } };
      return r;
    });
  }

  it.each<[string, number, number, number, number, number, string]>([
    ['R1 adds the open review count after the other counts', 14, 3, 2, 5, 0, '$(git-branch) 14 repos  $(arrow-down)3  $(circle-filled)2  $(git-pull-request)5'],
    ['R2 shows the open review count alone', 14, 0, 0, 1, 0, '$(git-branch) 14 repos  $(git-pull-request)1'],
    ['R3 leaves the segment out when only Sign in cells exist', 14, 0, 2, 0, 3, '$(git-branch) 14 repos  $(circle-filled)2'],
  ])('%s', (_name, n, behind, dirty, reviews, signIn, text) => {
    expect(statusBarModel(withReviews(n, behind, dirty, reviews, signIn), true).text).toBe(text);
  });
});
