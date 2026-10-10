// mr-profiles :: Recent reviewers matrix (R1–R3), and how each creation is recorded.

import { describe, expect, it } from 'vitest';
import { EMPTY_RECENT, readRecent, recentLine, recordRecent, type Recent } from '../../src/mr/recent';

function after(creations: Recent[]): Recent {
  return creations.reduce(recordRecent, { ...EMPTY_RECENT });
}

describe('Recent reviewers matrix', () => {
  it('R1 shows no line without recent reviewers', () => {
    expect(recentLine(after([]).reviewers, ['ana.perez'])).toBeUndefined();
  });

  it('R2 offers the recent reviewers the field does not hold yet', () => {
    // Most recent first: luis.gomez was sent last.
    const recent = after([
      { reviewers: ['ana.perez'], labels: [] },
      { reviewers: ['team:backend'], labels: [] },
      { reviewers: ['luis.gomez'], labels: [] },
    ]);
    expect(recent.reviewers).toEqual(['luis.gomez', 'team:backend', 'ana.perez']);
    expect(recentLine(recent.reviewers, ['ana.perez'])).toBe('recent: luis.gomez · team:backend');
  });

  it('R3 keeps the 10 most recent of 12 created merge requests with 12 different reviewers', () => {
    const recent = after(Array.from({ length: 12 }, (_, i) => ({ reviewers: [`reviewer.${i + 1}`], labels: [] })));
    const ten = Array.from({ length: 10 }, (_, i) => `reviewer.${12 - i}`);
    expect(recent.reviewers).toEqual(ten);
    expect(recentLine(recent.reviewers, [])).toBe(`recent: ${ten.join(' · ')}`);
  });
});

describe('Recording a creation', () => {
  it('moves a value sent again to the front without a duplicate, for reviewers and labels alike', () => {
    const recent = after([
      { reviewers: ['ana.perez', 'luis.gomez'], labels: ['backend'] },
      { reviewers: ['luis.gomez'], labels: ['hotfix', 'backend'] },
    ]);
    expect(recent).toEqual({ reviewers: ['luis.gomez', 'ana.perez'], labels: ['hotfix', 'backend'] });
  });

  it('reads only lists of strings from the stored value', () => {
    expect(readRecent({ reviewers: ['ana.perez', 3], labels: 'x' })).toEqual({ reviewers: ['ana.perez'], labels: [] });
    expect(readRecent(undefined)).toEqual({ reviewers: [], labels: [] });
  });
});
