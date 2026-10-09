// explorer-reveal :: Outside workspace matrix (R1–R6).

import { describe, expect, it } from 'vitest';
import { outsidePickItems, revealRepository, type OutsideChoice } from '../../src/integrations/reveal';
import { fakeExplorer } from './revealPort';

const ROOT = '/srv/legacy/ledger';
const ADD = ['workspace.updateWorkspaceFolders(' + ROOT + ')', `revealInExplorer(${ROOT})`];
const NEW_WINDOW = [`vscode.openFolder(${ROOT})`];

describe('Outside workspace matrix', () => {
  it.each([
    // # | setting | user choice | outcome | calls (setting writes as setting(...)) | quick pick shown
    ['R1 addToWorkspace', 'addToWorkspace', undefined, 'addToWorkspace', ADD, false],
    ['R2 newWindow', 'newWindow', undefined, 'newWindow', NEW_WINDOW, false],
    ['R3 revealInOS', 'revealInOS', undefined, 'revealInOS', [`revealFileInOS(${ROOT})`], false],
    ['R4 ask, Add to Workspace', 'ask', { choice: 'addToWorkspace', always: false }, 'addToWorkspace', ADD, true],
    ['R5 ask, Open in New Window with Always do this', 'ask', { choice: 'newWindow', always: true }, 'newWindow', ['setting(newWindow)', ...NEW_WINDOW], true],
    ['R6 ask, quick pick dismissed', 'ask', undefined, 'dismissed', [], true],
  ] as [string, string, { choice: OutsideChoice; always: boolean } | undefined, string, string[], boolean][])(
    '%s',
    async (_name, outsideWorkspace, answer, outcome, calls, asked) => {
      const fake = fakeExplorer({ inside: false, outsideWorkspace, ...(answer ? { answer } : {}) });
      expect(await revealRepository(ROOT, 'ledger', fake.port, 'win32')).toBe(outcome);
      expect(fake.calls).toEqual(calls);
      expect(fake.offered !== undefined).toBe(asked);
    },
  );

  it('offers the three choices with Reveal in File Explorer named after the platform', () => {
    expect(outsidePickItems('win32').map((i) => i.label)).toEqual(['Add to Workspace', 'Open in New Window', 'Reveal in File Explorer']);
    expect(outsidePickItems('darwin').map((i) => i.label)).toEqual(['Add to Workspace', 'Open in New Window', 'Reveal in Finder']);
  });
});
