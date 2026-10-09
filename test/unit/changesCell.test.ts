import { describe, expect, it } from 'vitest';
import { changesCell, isDirty } from '../../src/shared/format';
import { counts, row } from './rows';

// dashboard :: Changes cell matrix
const rows: [string, number, number, number, number, number, string, boolean][] = [
  ['shows a dash when clean', 0, 0, 0, 0, 0, '—', false],
  ['shows stashes without making the repository dirty', 0, 0, 0, 0, 2, '≡2', false],
  ['shows unstaged and staged files', 0, 3, 1, 0, 0, '●3 +1', true],
  ['shows staged files only', 0, 0, 1, 0, 0, '+1', true],
  ['shows untracked files', 0, 0, 0, 2, 0, '?2', true],
  ['shows conflicts', 2, 0, 0, 0, 0, '⚠ 2 confl', true],
  ['shows every segment in order', 2, 1, 1, 2, 1, '⚠ 2 confl ●1 +1 ?2 ≡1', true],
];

describe('changesCell', () => {
  it.each(rows)('%s', (_name, conflicts, unstaged, staged, untracked, stashes, text, dirty) => {
    const r = row({ counts: counts(conflicts, unstaged, staged, untracked), stashes });
    expect(changesCell(r).text).toBe(text);
    expect(isDirty(r)).toBe(dirty);
  });
});
