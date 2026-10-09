import { describe, expect, it } from 'vitest';
import type { GraphVariant } from '../../src/shared/graph';
import { detailsButtons, revealLabel, rowMenu } from '../../src/shared/rowMenu';
import type { Head, RowData } from '../../src/shared/model';
import { counts, row } from './rows';

const onBranch: Head = { kind: 'branch', name: 'main', upstream: 'origin/main', ahead: 0, behind: 0 };
const detached: Head = { kind: 'detached', commit: 'a1b2c3d' };

function enabled(r: RowData): Record<string, boolean> {
  return Object.fromEntries(rowMenu(r, 'win32', 'gitGraph').flat().map((item) => [item.label, item.enabled]));
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

  it('lists the items in three groups, in order, with the graph, Explorer and Source Control items first', () => {
    expect(rowMenu(row(), 'win32', 'gitGraph').map((group) => group.map((item) => item.label))).toEqual([
      ['Open in Git Graph', 'Reveal in Explorer', 'Show in Source Control', 'Open terminal'],
      ['Stash changes', 'Pop latest stash', 'Discard all changes…'],
      ['Reveal in File Explorer', 'Copy path', 'Copy branch name'],
    ]);
  });

  it('shows the keys g, e, s and t next to the first group', () => {
    expect(rowMenu(row(), 'win32', 'gitGraph')[0]?.map((item) => item.key)).toEqual(['g', 'e', 's', 't']);
  });

  // explorer-open-in-git-graph :: Graph item matrix, the `⋯` item per variant
  it.each([
    ['R1 Git Graph installed', 'gitGraph', 'Open in Git Graph'],
    ['R2 Source Control Graph', 'sourceControlGraph', 'Open in Source Control Graph'],
    ['R3 offer to install', 'offerInstall', 'Open in Git Graph'],
    ['R4 hidden', 'hidden', undefined],
  ] as [string, GraphVariant, string | undefined][])('names the graph item: %s', (_name, variant, label) => {
    const first = rowMenu(row(), 'win32', variant)[0] ?? [];
    expect(first.find((item) => item.action === 'graph')?.label).toBe(label);
    expect(first.map((item) => item.action).slice(-3)).toEqual(['revealInExplorer', 'showInSourceControl', 'terminal']);
  });

  it('names Reveal in File Explorer after the platform', () => {
    expect(revealLabel('darwin')).toBe('Reveal in Finder');
    expect(revealLabel('linux')).toBe('Open Containing Folder');
    expect(revealLabel('win32')).toBe('Reveal in File Explorer');
  });
});

describe('detailsButtons', () => {
  it('lists the row detail buttons of W3', () => {
    expect(detailsButtons('gitGraph').map((b) => b.label)).toEqual(['Open in Git Graph', 'Reveal in Explorer', 'Show in Source Control', 'Open terminal']);
  });

  it('drops the graph button when the graph items are hidden', () => {
    expect(detailsButtons('hidden').map((b) => b.action)).toEqual(['revealInExplorer', 'showInSourceControl', 'terminal']);
  });
});
