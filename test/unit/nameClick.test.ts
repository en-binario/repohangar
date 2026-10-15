// explorer-reveal :: Name click matrix (R1–R5): the action a click on the repository name runs.

import { describe, expect, it } from 'vitest';
import { nameClickAction, type GraphVariant } from '../../src/shared/graph';
import type { RowAction } from '../../src/shared/model';

const INSTALLED: GraphVariant[] = ['gitGraph'];
const MISSING: GraphVariant[] = ['sourceControlGraph', 'offerInstall', 'hidden'];

describe('Name click matrix', () => {
  it.each<[string, GraphVariant[], RowAction]>([
    ['explorer', [...INSTALLED, ...MISSING], 'revealInExplorer'],
    ['gitGraph', [...INSTALLED, ...MISSING], 'graph'],
    ['sourceControl', [...INSTALLED, ...MISSING], 'showInSourceControl'],
    ['auto', INSTALLED, 'graph'],
    ['auto', MISSING, 'revealInExplorer'],
  ])('nameClick %s with the graph variants %j runs %s', (nameClick, variants, action) => {
    for (const variant of variants) expect(nameClickAction(nameClick, variant)).toBe(action);
  });

  it('treats an unknown value as auto', () => {
    expect(nameClickAction('somethingElse', 'gitGraph')).toBe('graph');
    expect(nameClickAction('somethingElse', 'sourceControlGraph')).toBe('revealInExplorer');
  });
});
