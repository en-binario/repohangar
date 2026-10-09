import { describe, expect, it } from 'vitest';
import { revealLabel, rowMenu } from '../../src/shared/rowMenu';
import type { Head, RowData } from '../../src/shared/model';
import { counts, row } from './rows';

const onBranch: Head = { kind: 'branch', name: 'main', upstream: 'origin/main', ahead: 0, behind: 0 };
const detached: Head = { kind: 'detached', commit: 'a1b2c3d' };

function enabled(r: RowData): Record<string, boolean> {
  return Object.fromEntries(rowMenu(r, 'win32').flat().map((item) => [item.label, item.enabled]));
}

// git-operations :: Menu item state matrix
const cases: [string, RowData['counts'], number, Head, [boolean, boolean, boolean, boolean]][] = [
  ['R1 dirty, no stash, on a branch', counts(0, 2, 1, 0), 0, onBranch, [true, false, true, true]],
  ['R2 clean, 2 stashes, on a branch', counts(0, 0, 0, 0), 2, onBranch, [false, true, false, true]],
  ['R3 clean, no stash, detached', counts(0, 0, 0, 0), 0, detached, [false, false, false, false]],
];

describe('rowMenu', () => {
  it.each(cases)('%s', (_name, c, stashes, head, [stash, pop, discard, copyBranch]) => {
    const state = enabled(row({ counts: c, stashes, head }));
    expect(state['Stash changes']).toBe(stash);
    expect(state['Pop latest stash']).toBe(pop);
    expect(state['Discard all changes…']).toBe(discard);
    expect(state['Copy branch name']).toBe(copyBranch);
    expect(state['Open terminal']).toBe(true);
    expect(state['Copy path']).toBe(true);
  });

  it('lists the items in three groups, in order', () => {
    expect(rowMenu(row(), 'win32').map((group) => group.map((item) => item.label))).toEqual([
      ['Open terminal'],
      ['Stash changes', 'Pop latest stash', 'Discard all changes…'],
      ['Reveal in File Explorer', 'Copy path', 'Copy branch name'],
    ]);
  });

  it('names Reveal in File Explorer after the platform', () => {
    expect(revealLabel('darwin')).toBe('Reveal in Finder');
    expect(revealLabel('linux')).toBe('Open Containing Folder');
    expect(revealLabel('win32')).toBe('Reveal in File Explorer');
  });
});
