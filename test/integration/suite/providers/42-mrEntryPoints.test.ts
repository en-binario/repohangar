// mr-creation :: Entry point matrix (R1–R12): which triggers create with defaults, show the quick create input or open
// the drawer, with repohangar.mr.quickCreate "direct", "confirm" and the default "drawer".

import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { TestApi } from '../../../../src/extension';
import type { DrawerData } from '../../../../src/shared/drawer';
import type { RowData } from '../../../../src/shared/model';
import { rowReviewCell } from '../../../../src/shared/review';
import { closeAllEditors, dashboardTabs, idOf, ready, rowNamed, setConfig, waitFor } from '../helpers';
import { startCreating, type CreateSession } from './support';

describe('Merge request entry points', () => {
  let api: TestApi;
  let session: CreateSession;

  const press = (name: string, action: 'createMr' | 'createMrEdit') =>
    api.dashboard.receiveForTest({ type: 'runAction', id: idOf(api, name), action });
  const created = (repo: string) => api.notifier.shown.filter((n) => n.text.startsWith(`Created !142 in ${repo}`));
  const drawers = () => api.dashboard.postedMessages.flatMap((m) => (m.type === 'drawer' && m.data ? [m.data as DrawerData] : []));

  async function editFileOf(name: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(`${rowNamed(api, name)?.path}/README.md`));
    await vscode.window.showTextDocument(doc);
  }

  function keybinding(command: string): { key: string; mac: string } | undefined {
    const ext = vscode.extensions.getExtension('enbinario.repohangar');
    return (ext?.packageJSON.contributes.keybindings as { command: string; key: string; mac: string }[]).find((k) => k.command === command);
  }

  before(async () => {
    api = await ready(6);
    api.providers.focusOverride = true;
  });

  beforeEach(async () => {
    session = await startCreating(api);
  });

  afterEach(async () => {
    await session.finish();
  });

  it('R1 m on the focused row creates with defaults, no dialog', async () => {
    await session.branch('billing-api', 'feature/ABC-12-entry-r1');
    await press('billing-api', 'createMr');
    assert.equal(session.creates().length, 1);
    assert.equal(session.quickInputs.length, 0);
    assert.equal(created('billing-api').length, 1);
  });

  it('R2 Ctrl+Alt+M in an editor creates with defaults for the repository of the file', async () => {
    assert.deepEqual(keybinding('repohangar.mr.create'), { command: 'repohangar.mr.create', key: 'ctrl+alt+m', mac: 'ctrl+cmd+m' });
    await session.branch('billing-api', 'feature/ABC-12-entry-r2');
    await editFileOf('billing-api');
    await vscode.commands.executeCommand('repohangar.mr.create');
    assert.equal(session.creates().length, 1);
    assert.ok(session.creates()[0]?.url.includes('payments%2Fbilling-api'));
    assert.equal(session.quickInputs.length, 0);
  });

  it('R3 Create MR in the Source Control menu of ledger creates with defaults for ledger', async () => {
    await session.branch('ledger', 'feature/ABC-12-entry-r3');
    await vscode.commands.executeCommand('repohangar.scm.mr.create', { rootUri: vscode.Uri.file(rowNamed(api, 'ledger')?.path as string) });
    assert.deepEqual(
      session.creates().map((r) => r.url),
      ['https://git.acme.com/api/v4/projects/payments%2Fledger/merge_requests'],
    );
    assert.equal(session.quickInputs.length, 0);
    assert.equal(created('ledger').length, 1);
  });

  it('R4 m with "confirm" shows the quick create input', async () => {
    await setConfig('repohangar.mr.quickCreate', 'confirm');
    await session.branch('billing-api', 'feature/ABC-12-entry-r4');
    await press('billing-api', 'createMr');
    assert.deepEqual(
      session.quickInputs.map((m) => [m.repo, m.profile]),
      [['billing-api', 'default']],
    );
    assert.equal(session.creates().length, 0);
  });

  it('R5 Ctrl+Alt+M with "confirm" shows the quick create input', async () => {
    await setConfig('repohangar.mr.quickCreate', 'confirm');
    await session.branch('billing-api', 'feature/ABC-12-entry-r5');
    await editFileOf('billing-api');
    await vscode.commands.executeCommand('repohangar.mr.create');
    assert.equal(session.quickInputs.length, 1);
    assert.equal(session.creates().length, 0);
  });

  /** Opens the dashboard and waits for its snapshot. */
  async function openDashboard(): Promise<void> {
    await vscode.commands.executeCommand('repohangar.open');
    await waitFor(() => api.dashboard.postedMessages.some((m) => m.type === 'snapshot'), 'the dashboard');
  }

  /** [Create MR] in the MR / PR cell of billing-api sends the row action createMr. */
  async function clickCreateCell(branch: string): Promise<void> {
    await session.branch('billing-api', branch);
    await waitFor(() => rowReviewCell(rowNamed(api, 'billing-api') as RowData, Date.now()).text === '[Create MR]', 'the [Create MR] cell');
    await press('billing-api', 'createMr');
  }

  it('R6 [Create MR] in the MR / PR cell with "direct" creates with defaults, no dialog', async () => {
    await clickCreateCell('feature/ABC-12-entry-r6');
    assert.equal(session.creates().length, 1);
    assert.equal(session.quickInputs.length, 0);
  });

  it('R7 M on the focused row opens the drawer', async () => {
    await session.branch('billing-api', 'feature/ABC-12-entry-r7');
    await vscode.commands.executeCommand('repohangar.open');
    await waitFor(() => api.dashboard.postedMessages.some((m) => m.type === 'snapshot'), 'the dashboard');
    await press('billing-api', 'createMrEdit');
    const drawer = await waitFor(() => drawers()[0], 'the drawer');
    assert.equal(drawer.heading, 'Create merge request — billing-api');
    assert.equal(drawer.id, idOf(api, 'billing-api'));
    assert.equal(session.creates().length, 0);
  });

  it('R8 Ctrl+Alt+Shift+M with the dashboard closed opens it with the drawer for the active repository', async () => {
    assert.deepEqual(keybinding('repohangar.mr.createEdit'), {
      command: 'repohangar.mr.createEdit',
      key: 'ctrl+alt+shift+m',
      mac: 'ctrl+cmd+shift+m',
    });
    await session.branch('billing-api', 'feature/ABC-12-entry-r8');
    await closeAllEditors();
    await editFileOf('billing-api');
    await vscode.commands.executeCommand('repohangar.mr.createEdit');
    await waitFor(() => dashboardTabs().length === 1, 'the dashboard tab');
    const drawer = await waitFor(() => drawers()[0], 'the drawer');
    assert.equal(drawer.id, idOf(api, 'billing-api'));
    assert.equal(session.creates().length, 0);
  });

  it('R9 m on the focused row with the default "drawer" opens the pre-filled drawer', async () => {
    await setConfig('repohangar.mr.quickCreate', undefined);
    await session.branch('billing-api', 'feature/ABC-12-entry-r9');
    await openDashboard();
    await press('billing-api', 'createMr');
    const drawer = await waitFor(() => drawers()[0], 'the drawer');
    assert.equal(drawer.heading, 'Create merge request — billing-api');
    assert.equal(drawer.id, idOf(api, 'billing-api'));
    assert.equal(session.creates().length, 0);
    assert.equal(session.quickInputs.length, 0);
  });

  it('R10 [Create MR] in the MR / PR cell with the default "drawer" opens the pre-filled drawer', async () => {
    await setConfig('repohangar.mr.quickCreate', undefined);
    await openDashboard();
    await clickCreateCell('feature/ABC-12-entry-r10');
    const drawer = await waitFor(() => drawers()[0], 'the drawer');
    assert.equal(drawer.id, idOf(api, 'billing-api'));
    assert.equal(session.creates().length, 0);
  });

  it('R11 Ctrl+Alt+M with the default "drawer" and the dashboard closed opens it with the drawer', async () => {
    await setConfig('repohangar.mr.quickCreate', undefined);
    await session.branch('billing-api', 'feature/ABC-12-entry-r11');
    await closeAllEditors();
    await editFileOf('billing-api');
    await vscode.commands.executeCommand('repohangar.mr.create');
    await waitFor(() => dashboardTabs().length === 1, 'the dashboard tab');
    const drawer = await waitFor(() => drawers()[0], 'the drawer');
    assert.equal(drawer.id, idOf(api, 'billing-api'));
    assert.equal(session.creates().length, 0);
  });

  it('R12 [Create MR] in the MR / PR cell with "confirm" shows the quick create input', async () => {
    await setConfig('repohangar.mr.quickCreate', 'confirm');
    await clickCreateCell('feature/ABC-12-entry-r12');
    assert.equal(session.quickInputs.length, 1);
    assert.equal(session.creates().length, 0);
  });
});
