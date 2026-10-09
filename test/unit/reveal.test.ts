// explorer-reveal :: Reveal matrix (R1–R2).

import { describe, expect, it } from 'vitest';
import { revealRepository } from '../../src/integrations/reveal';
import { fakeExplorer } from './revealPort';

const ROOT = '/ws/acme/backend/ledger';

describe('Reveal matrix', () => {
  it.each([
    ['R1 reveals the root without collapsing', false, [`revealInExplorer(${ROOT})`]],
    ['R2 collapses the Explorer folders first', true, ['workbench.files.action.collapseExplorerFolders', `revealInExplorer(${ROOT})`]],
  ] as [string, boolean, string[]][])('%s', async (_name, collapse, calls) => {
    const fake = fakeExplorer({ inside: true, collapse });
    expect(await revealRepository(ROOT, 'ledger', fake.port, 'win32')).toBe('revealed');
    expect(fake.calls).toEqual(calls);
    expect(fake.offered).toBeUndefined();
  });
});
