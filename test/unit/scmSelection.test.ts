// source-control-selection-sync :: Sync outcome matrix (R1–R8), Selection commands availability matrix (R1–R4), the
// scenarios Second sync to the same repository, Repository closed and reopened and Internal command removed in a
// future VS Code release, and every case of Git Graph Opener's scmSelection.test.ts.

import { describe, expect, it } from 'vitest';
import {
  orderCandidates,
  parseInputBoxUri,
  parseToggleHandles,
  SourceControlSelection,
  syncSourceControlSelection,
  TOGGLE_COMMAND_PREFIX,
  type SourceControlPort,
  type SyncEnvironment,
} from '../../src/integrations/scmSelection';

/**
 * Models VS Code 1.137 single selection mode as observed in Git Graph Opener's spike:
 * toggling a hidden repository makes it the only visible one and moves focus to it only when a
 * repository had focus; toggling the visible repository hides it and clears focus without an event.
 * `selected` mirrors the extension host's view, which only changes on focus events.
 */
class FakeSourceControl implements SourceControlPort {
  visible: string | undefined;
  focused: string | undefined;
  selected: string | undefined;
  registered: boolean;
  readonly registerOnReveal: boolean;
  readonly exposeInputBoxes: boolean;
  reveals = 0;
  readonly toggled: number[] = [];
  readonly visibleHistory: (string | undefined)[] = [];
  private readonly byHandle: Map<number, string>;

  constructor(
    readonly roots: string[],
    options: { handles?: number[]; selected?: string; registered?: boolean; registerOnReveal?: boolean; exposeInputBoxes?: boolean } = {},
  ) {
    const handles = options.handles ?? roots.map((_, index) => index);
    this.byHandle = new Map(handles.map((handle, index) => [handle, roots[index] as string]));
    this.visible = options.selected;
    this.focused = options.selected;
    this.selected = options.selected;
    this.registered = options.registered ?? true;
    this.registerOnReveal = options.registerOnReveal ?? true;
    this.exposeInputBoxes = options.exposeInputBoxes ?? false;
  }

  inputBoxHandles(): Map<number, string> {
    return this.exposeInputBoxes ? new Map(this.byHandle) : new Map();
  }

  async listToggleHandles(): Promise<number[]> {
    return this.registered ? parseToggleHandles([...this.byHandle.keys()].map((handle) => TOGGLE_COMMAND_PREFIX + handle)) : [];
  }

  async revealSourceControlBriefly(): Promise<void> {
    this.reveals++;
    if (this.registerOnReveal) this.registered = true;
  }

  async toggle(handle: number): Promise<boolean> {
    const repository = this.byHandle.get(handle);
    if (!this.registered || repository === undefined) throw new Error(`command '${TOGGLE_COMMAND_PREFIX}${handle}' not found`);
    this.toggled.push(handle);
    let changed = false;
    if (this.visible === repository) {
      this.visible = undefined;
      this.focused = undefined;
    } else {
      this.visible = repository;
      if (this.focused !== undefined) {
        this.focused = repository;
        this.selected = repository;
        changed = true;
      }
    }
    this.visibleHistory.push(this.visible);
    return changed;
  }

  selectedRoot(): string | undefined {
    return this.selected;
  }

  repositoryRoots(): string[] {
    return this.roots;
  }

  /** Simulates the user clicking a repository in the Repositories view. */
  click(repository: string): void {
    this.visible = repository;
    this.focused = repository;
    this.selected = repository;
  }
}

function bind(scm: FakeSourceControl): SourceControlPort {
  return {
    listToggleHandles: () => scm.listToggleHandles(),
    revealSourceControlBriefly: () => scm.revealSourceControlBriefly(),
    inputBoxHandles: () => scm.inputBoxHandles(),
    toggle: (handle) => scm.toggle(handle),
    selectedRoot: () => scm.selectedRoot(),
    repositoryRoots: () => scm.repositoryRoots(),
  };
}

const ROOTS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'];

describe('parseToggleHandles', () => {
  it.each([
    ['matching ids', [`${TOGGLE_COMMAND_PREFIX}0`, `${TOGGLE_COMMAND_PREFIX}12`], [0, 12]],
    ['unrelated ids', ['git.commit', 'workbench.scm.action.collapseAll'], []],
    ['non-numeric suffixes', [`${TOGGLE_COMMAND_PREFIX}abc`, `${TOGGLE_COMMAND_PREFIX}`, `${TOGGLE_COMMAND_PREFIX}1x`], []],
    ['ascending ordering', [`${TOGGLE_COMMAND_PREFIX}10`, `${TOGGLE_COMMAND_PREFIX}2`, `${TOGGLE_COMMAND_PREFIX}7`], [2, 7, 10]],
  ] as [string, string[], number[]][])('%s', (_name, ids, expected) => {
    expect(parseToggleHandles(ids)).toEqual(expected);
  });
});

describe('parseInputBoxUri', () => {
  it.each([
    [
      'git input box (query as observed in VS Code 1.138)',
      'vscode-scm',
      'git/scm12/input',
      'rootUri=file%3A%2F%2F%2Fc%253A%2Frepos%2Falpha',
      { handle: 12, rootUri: 'file:///c%3A/repos/alpha' },
    ],
    ['malformed encoding', 'vscode-scm', 'git/scm12/input', 'rootUri=file%E0%A4%A', undefined],
    ['other scheme', 'file', 'git/scm12/input', 'rootUri=file:///c%3A/repos/alpha', undefined],
    ['non-numeric handle', 'vscode-scm', 'git/scmx/input', 'rootUri=file:///c%3A/repos/alpha', undefined],
    ['missing rootUri', 'vscode-scm', 'git/scm3/input', '', undefined],
  ] as [string, string, string, string, { handle: number; rootUri: string } | undefined][])('%s', (_name, scheme, path, query, expected) => {
    expect(parseInputBoxUri(scheme, path, query)).toEqual(expected);
  });
});

describe('orderCandidates', () => {
  it.each([
    ['likely handle of the selected repository is probed last', [0, 1, 2, 3], ['a', 'b', 'c'], [], 'c', 'a', [1, 2, 3, 0]],
    ['likely handle of the selected repository comes after the heuristic', [0, 1, 2], ['a', 'b', 'c'], [], 'c', 'a', [2, 1, 0]],
    ['rank heuristic first when counts match', [0, 1, 2], ['a', 'b', 'c'], [], 'c', undefined, [2, 0, 1]],
    ['remembered handle before the heuristic', [0, 1, 2], ['a', 'b', 'c'], [[0, 'c']], 'c', undefined, [0, 2, 1]],
    ['heuristic skipped when counts differ', [0, 1, 2, 3], ['a', 'b', 'c'], [], 'c', undefined, [0, 1, 2, 3]],
    ['handles mapped to other repositories are excluded', [0, 1, 2], ['a', 'b', 'c'], [[1, 'b']], 'a', undefined, [0, 2]],
    ['heuristic handle mapped to another repository is not used', [0, 1, 2], ['a', 'b', 'c'], [[2, 'a']], 'c', undefined, [0, 1]],
  ] as [string, number[], string[], [number, string][], string, string | undefined, number[]][])(
    '%s',
    (_name, handles, roots, mappings, target, selected, expected) => {
      expect(orderCandidates({ handles, repositoryRoots: roots, mappings: new Map(mappings), target, selected })).toEqual(expected);
    },
  );
});

describe('select learns mappings and handles focus loss', () => {
  it('selects with a single toggle when the heuristic hits', async () => {
    const scm = new FakeSourceControl(ROOTS, { selected: 'r1' });
    const logs: string[] = [];
    expect(await new SourceControlSelection((m) => logs.push(m)).select('r4', scm)).toBe('selected');
    expect(scm.toggled).toEqual([3]);
    expect(scm.visible).toBe('r4');
    expect(logs).toEqual([]);
  });

  it('learns every confirmed mapping while probing until the target is selected', async () => {
    // Counts differ (an extra repository without a command), so the heuristic is skipped and handles are probed.
    const scm = new FakeSourceControl(['r1', 'r2', 'r3'], { handles: [3, 5, 9], selected: 'r1' });
    const selection = new SourceControlSelection(() => undefined);
    expect(await selection.select('r3', { ...bind(scm), repositoryRoots: () => ['r1', 'r2', 'r3', 'extra'] })).toBe('selected');
    expect(scm.toggled).toEqual([5, 9]);
    expect(scm.visible).toBe('r3');
  });

  it('aborts without a focus change, restores a selection and records the handle', async () => {
    // Heuristic is wrong: handle 0 actually belongs to the selected repository.
    const scm = new FakeSourceControl(['r1', 'r2'], { handles: [0, 1], selected: 'r1' });
    const logs: string[] = [];
    const selection = new SourceControlSelection((m) => logs.push(m));
    const port = { ...bind(scm), repositoryRoots: () => ['r2', 'r1'] };
    expect(await selection.select('r2', port)).toBe('notConfirmed');
    expect(scm.toggled).toEqual([0, 0]);
    expect(scm.visible).toBe('r1');
    expect(logs).toHaveLength(1);

    // The learned mapping excludes handle 0 next time, once focus is back.
    scm.click('r1');
    expect(await selection.select('r2', port)).toBe('selected');
    expect(scm.toggled).toEqual([0, 0, 1]);
  });

  it('replaces a remembered mapping that selects another repository', async () => {
    const selection = new SourceControlSelection(() => undefined);
    const first = new FakeSourceControl(['r1', 'r2', 'r3'], { selected: 'r1' });
    expect(await selection.select('r2', first)).toBe('selected');
    expect(first.toggled).toEqual([1]);

    // Handle 1 now belongs to r1 (simulated reassignment): the remembered 1→r2 is tried, then replaced.
    const reassigned = new FakeSourceControl(['r2', 'r1', 'r3'], { selected: 'r3' });
    expect(await selection.select('r2', reassigned)).toBe('selected');
    expect(reassigned.toggled).toEqual([1, 0]);
    reassigned.click('r3');
    expect(await selection.select('r1', reassigned)).toBe('selected');
    expect(reassigned.toggled).toEqual([1, 0, 1]);
  });
});

describe('Sync outcome matrix', () => {
  it.each([
    // # | graph opened | sync on | mode | Git available | repo opens | already selected | command resolves | result | visible after | logged
    ['R1 graph not opened', false, true, 'single', true, true, false, true, 'gitGraphNotOpened', 'r1', false],
    ['R2 setting off', true, false, 'single', true, true, false, true, 'disabled', 'r1', false],
    ['R3 multiple mode', true, true, 'multiple', true, true, false, true, 'notSingleMode', 'r1', false],
    ['R4 Git extension unavailable', true, true, 'single', false, true, false, true, 'gitUnavailable', 'r1', true],
    ['R5 repository cannot be opened', true, true, 'single', true, false, false, true, 'repositoryNotOpened', 'r1', true],
    ['R6 already selected', true, true, 'single', true, true, true, true, 'alreadySelected', 'r4', false],
    ['R7 resolved', true, true, 'single', true, true, false, true, 'selected', 'r4', false],
    ['R8 not resolved', true, true, 'single', true, true, false, false, 'commandsUnavailable', 'r1', true],
  ] as [string, boolean, boolean, string, boolean, boolean, boolean, boolean, string, string, boolean][])(
    '%s',
    async (_name, opened, syncEnabled, selectionMode, gitAvailable, repoOpens, alreadySelected, resolves, result, visible, logged) => {
      const scm = new FakeSourceControl(ROOTS, { selected: alreadySelected ? 'r4' : 'r1', registered: resolves, registerOnReveal: false });
      const logs: string[] = [];
      const env: SyncEnvironment = {
        syncEnabled,
        selectionMode,
        gitAvailable,
        openRepository: async (root) => (repoOpens ? root : undefined),
        port: scm,
        log: (m) => logs.push(m),
      };
      expect(await syncSourceControlSelection(opened, 'r4', env, new SourceControlSelection(env.log))).toBe(result);
      expect(scm.visible).toBe(visible);
      expect(logs.length > 0).toBe(logged);
    },
  );

  it('logs an exception from the Git extension instead of throwing', async () => {
    const logs: string[] = [];
    const env: SyncEnvironment = {
      syncEnabled: true,
      selectionMode: 'single',
      gitAvailable: true,
      openRepository: async () => {
        throw new Error('boom');
      },
      port: new FakeSourceControl(ROOTS),
      log: (m) => logs.push(m),
    };
    expect(await syncSourceControlSelection(true, 'r4', env, new SourceControlSelection(env.log))).toBe('failed');
    expect(logs[0]).toMatch(/boom/);
  });

  it('syncs with the setting off when forced, as Show in Source Control does', async () => {
    const scm = new FakeSourceControl(ROOTS, { selected: 'r1' });
    const env: SyncEnvironment = {
      syncEnabled: false,
      selectionMode: 'single',
      gitAvailable: true,
      openRepository: async (root) => root,
      port: scm,
      log: () => undefined,
    };
    expect(await syncSourceControlSelection(true, 'r4', env, new SourceControlSelection(env.log), true)).toBe('selected');
    expect(scm.visible).toBe('r4');
  });

  it('leaves multiple selection mode alone when forced', async () => {
    const scm = new FakeSourceControl(ROOTS, { selected: 'r1' });
    const env: SyncEnvironment = {
      syncEnabled: false,
      selectionMode: 'multiple',
      gitAvailable: true,
      openRepository: async (root) => root,
      port: scm,
      log: () => undefined,
    };
    expect(await syncSourceControlSelection(true, 'r4', env, new SourceControlSelection(env.log), true)).toBe('notSingleMode');
    expect(scm.toggled).toEqual([]);
  });
});

describe('Selection commands availability matrix', () => {
  it.each([
    // # | registered at start | already revealed | registered after reveal | reveals | continues | logged
    ['R1 registered', true, false, true, 0, true, false],
    ['R2 missing, reveal registers them', false, false, true, 1, true, false],
    ['R3 missing, still missing after reveal', false, false, false, 1, false, true],
    ['R4 missing, already revealed in this window', false, true, true, 1, false, true],
  ] as [string, boolean, boolean, boolean, number, boolean, boolean][])(
    '%s',
    async (_name, registeredAtStart, alreadyRevealed, registeredAfterReveal, reveals, continues, logged) => {
      const logs: string[] = [];
      const selection = new SourceControlSelection((m) => logs.push(m));
      const scm = new FakeSourceControl(ROOTS, { selected: 'r1', registered: registeredAtStart, registerOnReveal: registeredAfterReveal });
      if (alreadyRevealed) {
        const earlier = new FakeSourceControl(ROOTS, { selected: 'r1', registered: false, registerOnReveal: false });
        await selection.select('r2', {
          ...bind(earlier),
          revealSourceControlBriefly: () => {
            scm.reveals++;
            return earlier.revealSourceControlBriefly();
          },
        });
        logs.length = 0;
      }
      const result = await selection.select('r4', scm);
      expect(scm.reveals).toBe(reveals);
      expect(result === 'selected').toBe(continues);
      expect(logs.length > 0).toBe(logged);
    },
  );
});

describe('Repeated syncs select the repository directly', () => {
  it('Second sync to the same repository toggles exactly once', async () => {
    // Counts differ, so the first sync has to probe.
    const scm = new FakeSourceControl(ROOTS, { selected: 'r1' });
    const port = { ...bind(scm), repositoryRoots: () => [...ROOTS, 'extra'] };
    const selection = new SourceControlSelection(() => undefined);
    expect(await selection.select('r5', port)).toBe('selected');
    expect(scm.toggled.length).toBeGreaterThan(1);

    scm.click('r1');
    scm.toggled.length = 0;
    scm.visibleHistory.length = 0;
    expect(await selection.select('r5', port)).toBe('selected');
    expect(scm.toggled).toEqual([4]);
    expect(scm.visibleHistory).toEqual(['r5']);
  });

  it('Repository closed and reopened: an unregistered remembered handle is discarded and re-resolved', async () => {
    const first = new FakeSourceControl(ROOTS, { selected: 'r1' });
    const selection = new SourceControlSelection(() => undefined);
    expect(await selection.select('r2', first)).toBe('selected');

    // r2 closed and reopened: its old handle 1 is gone and it now has handle 6 at the end.
    const reopened = new FakeSourceControl(['r1', 'r3', 'r4', 'r5', 'r6', 'r2'], { handles: [0, 2, 3, 4, 5, 6], selected: 'r1' });
    expect(await selection.select('r2', reopened)).toBe('selected');
    expect(reopened.toggled).toEqual([6]);
  });
});

describe('Input box handles select the repository directly', () => {
  // Observed in VS Code 1.138: the Git API can list repositories in a different order than their handles.
  const apiOrder = () => ['alpha', 'gamma', 'beta'];

  it('hides the selected repository through the rank heuristic without input boxes', async () => {
    const scm = new FakeSourceControl(['alpha', 'beta', 'gamma'], { selected: 'beta' });
    expect(await new SourceControlSelection(() => undefined).select('gamma', { ...bind(scm), repositoryRoots: apiOrder })).toBe('notConfirmed');
    expect(scm.toggled).toEqual([1, 1]);
  });

  it('toggles only the target handle with input boxes', async () => {
    const scm = new FakeSourceControl(['alpha', 'beta', 'gamma'], { selected: 'beta', exposeInputBoxes: true });
    const logs: string[] = [];
    expect(await new SourceControlSelection((m) => logs.push(m)).select('gamma', { ...bind(scm), repositoryRoots: apiOrder })).toBe('selected');
    expect(scm.toggled).toEqual([2]);
    expect(scm.visibleHistory).toEqual(['gamma']);
    expect(logs).toEqual([]);
  });

  it('does not undo a known handle that gave no signal', async () => {
    const scm = new FakeSourceControl(['alpha', 'beta', 'gamma'], { selected: 'beta', exposeInputBoxes: true });
    scm.focused = undefined;
    const logs: string[] = [];
    expect(await new SourceControlSelection((m) => logs.push(m)).select('gamma', { ...bind(scm), repositoryRoots: apiOrder })).toBe('notConfirmed');
    expect(scm.toggled).toEqual([2]);
    expect(scm.visible).toBe('gamma');
    expect(logs).toHaveLength(1);
  });

  it('ignores input boxes for unregistered handles', async () => {
    const scm = new FakeSourceControl(['alpha', 'beta', 'gamma'], { selected: 'alpha' });
    const port = {
      ...bind(scm),
      inputBoxHandles: () =>
        new Map([
          [9, 'gamma'],
          [2, 'gamma'],
        ]),
    };
    expect(await new SourceControlSelection(() => undefined).select('gamma', port)).toBe('selected');
    expect(scm.toggled).toEqual([2]);
  });
});

describe('Failure isolation', () => {
  it('Internal command removed in a future VS Code release: no selection command found is logged, not thrown', async () => {
    const scm = new FakeSourceControl(ROOTS, { selected: 'r1', registered: false, registerOnReveal: false });
    const logs: string[] = [];
    const env: SyncEnvironment = {
      syncEnabled: true,
      selectionMode: 'single',
      gitAvailable: true,
      openRepository: async (root) => root,
      port: scm,
      log: (m) => logs.push(m),
    };
    expect(await syncSourceControlSelection(true, 'r4', env, new SourceControlSelection(env.log))).toBe('commandsUnavailable');
    expect(logs).toEqual(['Source Control selection commands are not registered; cannot select the repository.']);
  });
});
