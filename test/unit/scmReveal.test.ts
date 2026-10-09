// source-control-reveal :: Reveal outcome matrix (R1–R6) and Sidebar after sync matrix (R1–R3), plus every case of
// Git Graph Opener's scmReveal.test.ts.

import { describe, expect, it } from 'vitest';
import {
  briefRevealCommands,
  FOCUS_ACTIVE_EDITOR_GROUP_COMMAND,
  revealSourceControl,
  SHOW_EXPLORER_COMMAND,
  SHOW_SOURCE_CONTROL_COMMAND,
  type RevealPort,
} from '../../src/integrations/scmReveal';
import { SourceControlSelection, type SourceControlPort } from '../../src/integrations/scmSelection';

type Sidebar = 'hidden' | 'explorer' | 'scm';

/** Models the sidebar and focus as observed in VS Code 1.138: showing a container focuses it, focusing the editor group leaves the sidebar alone. */
class FakeWorkbench {
  readonly executed: string[] = [];

  constructor(
    public sidebar: Sidebar,
    public focus: 'gitGraph' | 'sidebar' = 'gitGraph',
    private readonly failing: readonly string[] = [],
  ) {}

  async execute(command: string): Promise<void> {
    if (this.failing.includes(command)) throw new Error(`command '${command}' not found`);
    this.executed.push(command);
    if (command === SHOW_SOURCE_CONTROL_COMMAND || command === SHOW_EXPLORER_COMMAND) {
      this.sidebar = command === SHOW_SOURCE_CONTROL_COMMAND ? 'scm' : 'explorer';
      this.focus = 'sidebar';
    } else if (command === FOCUS_ACTIVE_EDITOR_GROUP_COMMAND) {
      this.focus = 'gitGraph';
    }
  }

  revealPort(): RevealPort {
    return {
      showSourceControl: () => this.execute(SHOW_SOURCE_CONTROL_COMMAND),
      focusGitGraph: () => this.execute(FOCUS_ACTIVE_EDITOR_GROUP_COMMAND),
    };
  }
}

const BOTH = [SHOW_SOURCE_CONTROL_COMMAND, FOCUS_ACTIVE_EDITOR_GROUP_COMMAND];

describe('Reveal outcome matrix', () => {
  it.each([
    // # | Git Graph opened | reveal | sidebar before | show succeeds | result | sidebar after | commands | logged
    ['R1 Git Graph not opened', false, true, 'explorer', true, 'gitGraphNotOpened', 'unchanged', [], false],
    ['R2 setting off', true, false, 'explorer', true, 'disabled', 'unchanged', [], false],
    ['R3 sidebar hidden', true, true, 'hidden', true, 'revealed', 'scm', BOTH, false],
    ['R4 another view showing', true, true, 'explorer', true, 'revealed', 'scm', BOTH, false],
    ['R5 Source Control already showing', true, true, 'scm', true, 'revealed', 'scm', BOTH, false],
    ['R6 showing fails', true, true, 'explorer', false, 'failed', 'unchanged', [FOCUS_ACTIVE_EDITOR_GROUP_COMMAND], true],
  ] as [string, boolean, boolean, Sidebar, boolean, string, Sidebar | 'unchanged', string[], boolean][])(
    '%s',
    async (_name, opened, reveal, before, showSucceeds, result, after, executed, logged) => {
      const workbench = new FakeWorkbench(before, 'gitGraph', showSucceeds ? [] : [SHOW_SOURCE_CONTROL_COMMAND]);
      const logs: string[] = [];
      expect(await revealSourceControl(opened, reveal, workbench.revealPort(), (m) => logs.push(m))).toBe(result);
      expect(workbench.sidebar).toBe(after === 'unchanged' ? before : after);
      expect(workbench.executed).toEqual(executed);
      expect(workbench.focus).toBe('gitGraph');
      expect(logs.length > 0).toBe(logged);
    },
  );

  it('logs a failure to return focus instead of throwing', async () => {
    const workbench = new FakeWorkbench('explorer', 'gitGraph', [FOCUS_ACTIVE_EDITOR_GROUP_COMMAND]);
    const logs: string[] = [];
    expect(await revealSourceControl(true, true, workbench.revealPort(), (m) => logs.push(m))).toBe('revealed');
    expect(workbench.sidebar).toBe('scm');
    expect(logs).toHaveLength(1);
  });
});

describe('briefRevealCommands', () => {
  it('restores the Explorer with reveal off', () => {
    expect(briefRevealCommands(false)).toEqual([SHOW_SOURCE_CONTROL_COMMAND, SHOW_EXPLORER_COMMAND]);
  });

  it('keeps Source Control and focuses Git Graph with reveal on', () => {
    expect(briefRevealCommands(true)).toEqual([SHOW_SOURCE_CONTROL_COMMAND, FOCUS_ACTIVE_EDITOR_GROUP_COMMAND]);
  });
});

describe('Sidebar after sync matrix', () => {
  it.each([
    // # | reveal | sync showed Source Control | sidebar after | brief reveals
    ['R1 reveal off, sync did not show Source Control', false, false, 'explorer', 0],
    ['R2 reveal off, sync showed Source Control', false, true, 'explorer', 1],
    ['R3 reveal on, sync did not show Source Control', true, false, 'scm', 0],
    ['R3 reveal on, sync showed Source Control', true, true, 'scm', 1],
  ] as [string, boolean, boolean, Sidebar, number][])('%s', async (_name, reveal, syncShows, sidebar, briefReveals) => {
    // The action starts from the Explorer context menu with Git Graph just opened and focused.
    const workbench = new FakeWorkbench('explorer');
    await revealSourceControl(true, reveal, workbench.revealPort(), () => undefined);

    // Selection commands exist up front unless the sync has to show Source Control to create them.
    let registered = !syncShows;
    let reveals = 0;
    let selected = 'r1';
    const port: SourceControlPort = {
      listToggleHandles: async () => (registered ? [0, 1] : []),
      revealSourceControlBriefly: async () => {
        reveals++;
        for (const command of briefRevealCommands(reveal)) await workbench.execute(command);
        registered = true;
      },
      inputBoxHandles: () => new Map(),
      toggle: async (handle) => {
        selected = ['r1', 'r2'][handle] as string;
        return true;
      },
      selectedRoot: () => selected,
      repositoryRoots: () => ['r1', 'r2'],
    };
    expect(await new SourceControlSelection(() => undefined).select('r2', port)).toBe('selected');

    expect(reveals).toBe(briefReveals);
    expect(workbench.sidebar).toBe(sidebar);
    if (reveal) expect(workbench.focus).toBe('gitGraph');
  });
});
