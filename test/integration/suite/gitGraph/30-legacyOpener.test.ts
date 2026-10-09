// git-graph-opener-migration :: Legacy opener matrix (R1–R3) and Uninstall from the notification, with
// git-graph-opener-0.1.0.vsix installed in this session (it depends on Git Graph, which the detection suite installed).

import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { TestApi } from '../../../../src/extension';
import {
  LEGACY_NOTICE_STATE_KEY,
  LEGACY_NOTICE_TEXT,
  LegacyOpenerGuard,
  UNINSTALL_BUTTON,
} from '../../../../src/integrations/migration';
import { ready, recordIntegrations, waitFor } from '../helpers';

const NOTICE = { severity: 'information', text: LEGACY_NOTICE_TEXT, buttons: ['Uninstall Git Graph Opener', 'Later'] };

/** A global state that starts empty. */
function memento(): vscode.Memento {
  const values = new Map<string, unknown>();
  return {
    keys: () => [...values.keys()],
    get: <T>(key: string, fallback?: T) => (values.has(key) ? (values.get(key) as T) : fallback) as T,
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    },
  };
}

describe('Git Graph Opener installed', () => {
  let api: TestApi;
  let stop: () => void;

  before(async () => {
    api = await ready(14);
  });
  beforeEach(() => {
    stop = recordIntegrations(api);
  });
  afterEach(() => stop());

  it('hides the Explorer graph items while Git Graph Opener is installed', () => {
    const manifest = vscode.extensions.getExtension('enbinario.repohangar')?.packageJSON as {
      contributes: { menus: Record<string, { command?: string; when?: string }[]> };
    };
    const graphItems = (manifest.contributes.menus['explorer/context'] ?? []).filter((m) => m.command?.startsWith('repohangar.openIn'));
    assert.equal(graphItems.length, 2);
    for (const item of graphItems) assert.match(item.when ?? '', /!repohangar\.legacyOpenerInstalled/);
    // The dashboard and Source Control items do not depend on it.
    for (const item of manifest.contributes.menus['scm/sourceControl'] ?? []) assert.doesNotMatch(item.when ?? '', /legacyOpener/);
  });

  it('R1 not installed: the key is false and there is no notification', () => {
    assert.equal(vscode.extensions.getExtension('enbinario.git-graph-opener'), undefined);
    assert.equal(api.legacyOpener.installed, false);
    assert.deepEqual(api.notifier.shown, []);
  });

  it('R2 installed, notice not shown before: the key is true and the notice is shown once', async function () {
    this.timeout(120_000);
    api.notifier.answer = () => 'Later';
    await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(process.env.REPOHANGAR_LEGACY_OPENER_VSIX as string));
    await waitFor(() => api.legacyOpener.installed, 'Git Graph Opener to be detected', 60_000);
    await api.legacyOpener.notice;
    assert.deepEqual(api.notifier.shown, [NOTICE]);
    assert.equal(api.migration.state.get(LEGACY_NOTICE_STATE_KEY), true);
  });

  it('R3 installed, notice shown before: the key is true and there is no notification', async () => {
    // As after a reload: a new guard reads the same global state.
    const guard = new LegacyOpenerGuard(api.migration.state, api.notifier, api.commands);
    try {
      assert.equal(guard.installed, true);
      await guard.notice;
      assert.deepEqual(api.notifier.shown, []);
    } finally {
      guard.dispose();
    }
  });

  it('uninstalls Git Graph Opener from the notification and shows the graph item again without a reload', async function () {
    this.timeout(120_000);
    api.notifier.answer = () => UNINSTALL_BUTTON;
    const guard = new LegacyOpenerGuard(memento(), api.notifier, api.commands);
    try {
      assert.equal(guard.installed, true);
      await guard.notice;
      assert.deepEqual(api.notifier.shown, [NOTICE]);
      assert.deepEqual(
        api.commands.executed.filter((c) => c.command === 'workbench.extensions.uninstallExtension'),
        [{ command: 'workbench.extensions.uninstallExtension', args: ['enbinario.git-graph-opener'] }],
      );
      // The guard sets repohangar.legacyOpenerInstalled to false once the uninstall finished.
      assert.equal(guard.installed, false);
    } finally {
      guard.dispose();
    }
  });
});
