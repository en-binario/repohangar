// batch-operations :: Branch batch target matrix (R1–R8), and the scenarios Create from the switch quick pick, Dirty
// choice dismissed and Invalid branch name. The quick picks are answered by a script; the batches are recorded instead
// of run, so the fixture keeps its state, except in Dirty choice dismissed, which runs everything it would.

import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { TestApi } from '../../../../src/extension';
import type { Repository } from '../../../../src/git/git';
import { branchTargets, toolbarLabel, type BranchTrigger } from '../../../../src/shared/batch';
import type { BatchAction } from '../../../../src/shared/model';
import type { BatchOptions } from '../../../../src/ui/actions';
import { switchItems, type BranchUi, type DirtyPickModel, type NameInputModel, type SwitchPickModel } from '../../../../src/ui/quickInputs';
import { idOf, ready, recordGitCalls, rootOf } from '../helpers';

const NOTES = 'feature/ABC-12-notes';
const REFUNDS = 'feature/ABC-31-refunds';

interface Script {
  /** The text typed into the switch quick pick and the item picked: the first one, or the branch named */
  switchTo?: { typed: string; pick: 'first' | string };
  dirty?: 'skip' | 'stash' | 'switchAnyway';
  /** Names typed into the input box, each followed by Enter; Esc after the last one the box refused */
  names?: string[];
}

interface Seen {
  switchPicks: SwitchPickModel[];
  dirtyPicks: DirtyPickModel[];
  inputs: NameInputModel[];
  /** The message the input box showed for each refused name */
  messages: string[];
  firstItem?: string;
}

function scriptedUi(script: Script, seen: Seen): BranchUi {
  return {
    async pickBranch(model) {
      seen.switchPicks.push(model);
      if (!script.switchTo) return undefined;
      const items = switchItems(model, script.switchTo.typed);
      seen.firstItem = items[0]?.label;
      const item = script.switchTo.pick === 'first' ? items[0] : items.find((i) => i.label === script.switchTo?.pick);
      return item?.pick;
    },
    async pickDirtyChoice(model) {
      seen.dirtyPicks.push(model);
      return script.dirty;
    },
    async inputBranchName(model) {
      seen.inputs.push(model);
      for (const name of script.names ?? []) {
        const message = await model.validate(name);
        if (message === undefined) return name;
        seen.messages.push(message);
      }
      return undefined;
    },
  };
}

describe('branch batch targets', () => {
  let api: TestApi;
  let seen: Seen;
  let batches: { action: BatchAction; names: string[]; options: BatchOptions }[];
  let restore: (() => void)[];
  let branchUi: BranchUi;

  const names = (ids: readonly string[]) => ids.map((id) => api.store.get(id)?.name ?? id);
  const ids = (...repos: string[]) => repos.map((r) => idOf(api, r));
  const listed = () => api.registry.ids();
  const script = (s: Script) => {
    api.actions.branchUi = scriptedUi(s, seen);
  };
  /** The message the webview posts for a key or a toolbar button (webview/App.tsx). */
  const press = async (trigger: BranchTrigger, selected: string[], focused?: string) => {
    const targets = branchTargets(trigger, selected, listed(), focused);
    if (!targets) return false;
    await api.dashboard.receiveForTest({ type: targets.action === 'switch' ? 'switchBranch' : 'createBranch', ids: targets.ids });
    return true;
  };

  before(async () => {
    api = await ready(14);
    branchUi = api.actions.branchUi;
  });
  beforeEach(() => {
    seen = { switchPicks: [], dirtyPicks: [], inputs: [], messages: [] };
    batches = [];
    const runBatch = api.actions.runBatch;
    api.actions.runBatch = async (action, batchIds, options = {}) => {
      batches.push({ action, names: names(batchIds), options });
      return undefined;
    };
    restore = [() => (api.actions.runBatch = runBatch)];
    api.dashboard.selection = [];
  });
  afterEach(() => {
    for (const r of restore) r();
    api.actions.branchUi = branchUi;
    api.dashboard.selection = [];
  });

  it('R1 switches in the 3 selected repositories with b', async () => {
    script({ switchTo: { typed: '', pick: NOTES }, dirty: 'skip' });
    assert.ok(await press('b', ids('billing-api', 'ledger', 'web-shop'), idOf(api, 'notifications')));
    assert.equal(seen.switchPicks[0]?.title, 'Switch branch in 3 repositories');
    assert.deepEqual(batches, [
      { action: 'switch', names: ['billing-api', 'ledger', 'web-shop'], options: { params: { branch: NOTES, dirtyChoice: 'skip' }, fromDashboard: true } },
    ]);
  });

  it('R2 switches the focused row only with b and no selection, with git.checkout', async () => {
    const recorder = recordGitCalls(api);
    try {
      assert.equal(await press('b', [], idOf(api, 'ledger')), false);
      // The webview runs the row action instead (git-operations: Row action keys).
      await api.dashboard.receiveForTest({ type: 'runAction', id: idOf(api, 'ledger'), action: 'switchBranch' });
      assert.deepEqual(recorder.commands, [{ command: 'git.checkout', args: [rootOf(api, 'ledger')] }]);
      assert.deepEqual(seen.switchPicks, []);
    } finally {
      recorder.restore();
    }
  });

  it('R3 switches in the 3 selected repositories from repohangar.switchBranch and the toolbar', async () => {
    script({ switchTo: { typed: '', pick: 'main' }, dirty: 'skip' });
    api.dashboard.selection = ids('billing-api', 'ledger', 'web-shop');
    await vscode.commands.executeCommand('repohangar.switchBranch');
    assert.equal(toolbarLabel('switch', 3), '⎇ Switch… (3)');
    assert.equal(seen.switchPicks[0]?.title, 'Switch branch in 3 repositories');
    assert.equal(seen.dirtyPicks[0]?.title, '1 of 3 repositories have uncommitted changes');
    assert.deepEqual(batches.map((b) => [b.action, b.names, b.options.fromDashboard]), [['switch', ['billing-api', 'ledger', 'web-shop'], undefined]]);
  });

  it('R4 switches in every listed repository from repohangar.switchBranch without a selection', async () => {
    script({ switchTo: { typed: '', pick: 'main' }, dirty: 'skip' });
    await vscode.commands.executeCommand('repohangar.switchBranch');
    assert.equal(toolbarLabel('switch', 0), '⎇ Switch…');
    assert.equal(seen.switchPicks[0]?.title, `Switch branch in ${listed().length} repositories`);
    assert.deepEqual(batches.map((b) => [b.action, b.names]), [['switch', names(listed())]]);
    // Suggestions come from the local refs: main is local in most repositories.
    assert.equal(seen.switchPicks[0]?.suggestions[0]?.name, 'main');
  });

  it('R5 creates in the 4 selected repositories with n', async () => {
    script({ names: [REFUNDS] });
    await press('n', ids('billing-api', 'ledger', 'web-shop', 'notifications'), idOf(api, 'auth-service'));
    assert.equal(seen.inputs[0]?.title, 'Create branch in 4 repositories');
    assert.deepEqual(batches, [
      { action: 'createBranch', names: ['billing-api', 'ledger', 'web-shop', 'notifications'], options: { params: { branch: REFUNDS }, fromDashboard: true } },
    ]);
  });

  it('R6 creates in the focused row with n and no selection', async () => {
    script({ names: [REFUNDS] });
    await press('n', [], idOf(api, 'ledger'));
    assert.equal(seen.inputs[0]?.title, 'Create branch in 1 repository');
    assert.deepEqual(batches.map((b) => [b.action, b.names]), [['createBranch', ['ledger']]]);
  });

  it('R7 creates in the 2 selected repositories from repohangar.createBranch and the toolbar', async () => {
    script({ names: [REFUNDS] });
    api.dashboard.selection = ids('billing-api', 'ledger');
    await vscode.commands.executeCommand('repohangar.createBranch');
    assert.equal(toolbarLabel('createBranch', 2), '＋ Branch… (2)');
    assert.deepEqual(batches.map((b) => [b.action, b.names, b.options.params]), [['createBranch', ['billing-api', 'ledger'], { branch: REFUNDS }]]);
  });

  it('R8 creates in every listed repository from repohangar.createBranch without a selection', async () => {
    script({ names: [REFUNDS] });
    await vscode.commands.executeCommand('repohangar.createBranch');
    assert.equal(toolbarLabel('createBranch', 0), '＋ Branch…');
    assert.deepEqual(batches.map((b) => [b.action, b.names]), [['createBranch', names(listed())]]);
  });

  it('declares the commands with their palette titles', () => {
    const manifest = vscode.extensions.getExtension('enbinario.repohangar')?.packageJSON as {
      contributes: { commands: { command: string; title: string; category?: string }[] };
    };
    const titles = Object.fromEntries(manifest.contributes.commands.map((c) => [c.command, `${c.category}: ${c.title}`]));
    assert.equal(titles['repohangar.switchBranch'], 'RepoHangar: Switch Branch in Repositories…');
    assert.equal(titles['repohangar.createBranch'], 'RepoHangar: Create Branch in Repositories…');
  });

  it('creates the typed branch from the switch quick pick', async () => {
    script({ switchTo: { typed: REFUNDS, pick: 'first' } });
    await press('switchBranch', ids('billing-api', 'notifications', 'web-shop'));
    assert.equal(seen.firstItem, '＋ Create "feature/ABC-31-refunds" from current HEAD in all 3');
    assert.deepEqual(seen.dirtyPicks, []);
    assert.deepEqual(batches.map((b) => [b.action, b.names, b.options.params]), [
      ['createBranch', ['billing-api', 'notifications', 'web-shop'], { branch: REFUNDS }],
    ]);
  });

  it('runs no checkout, branch creation or stash when the uncommitted changes choice is dismissed', async () => {
    for (const r of restore) r();
    restore = [];
    const repositories = ids('billing-api', 'notifications', 'web-shop').map((id) => api.registry.repository(id) as Repository);
    const calls: string[] = [];
    for (const repository of repositories) {
      for (const method of ['checkout', 'createBranch', 'setBranchUpstream'] as const) {
        (repository as unknown as Record<string, unknown>)[method] = async () => void calls.push(method);
        restore.push(() => delete (repository as unknown as Record<string, unknown>)[method]);
      }
    }
    const processes = api.gitProcessLog.length;
    script({ switchTo: { typed: '', pick: NOTES } });
    const run = await api.actions.switchBranchIn(ids('billing-api', 'notifications', 'web-shop'), { fromDashboard: true });
    assert.equal(run, undefined);
    assert.equal(seen.dirtyPicks[0]?.title, '1 of 3 repositories have uncommitted changes');
    assert.deepEqual(calls, []);
    assert.ok(!api.gitProcessLog.slice(processes).some((c) => c.args[0] === 'stash'));
  });

  it('keeps the input box open on an invalid branch name and creates nothing', async () => {
    script({ names: ['feature/a..b'] });
    await press('n', ids('billing-api', 'ledger', 'web-shop', 'notifications'));
    assert.deepEqual(seen.messages, ['"feature/a..b" is not a valid branch name.']);
    assert.ok(api.gitProcessLog.some((c) => c.args.join(' ') === 'check-ref-format --branch feature/a..b'));
    assert.deepEqual(batches, []);
  });
});
