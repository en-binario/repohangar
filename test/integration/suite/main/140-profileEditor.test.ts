// mr-profiles :: Save scope matrix (R1–R4), Round trip keeps comments, External change with unsaved edits. The editor
// panel is open; Save and the dirty state are sent as the webview sends them, and every result is read back with
// `inspect()` and from the settings files.

import * as assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import * as vscode from 'vscode';
import type { TestApi } from '../../../../src/extension';
import type { ProfilesHostMessage } from '../../../../src/shared/profileEditor';
import { ready, setScopedConfig, waitFor } from '../helpers';

const USER = vscode.ConfigurationTarget.Global;
const WORKSPACE = vscode.ConfigurationTarget.Workspace;
const userSettingsFile = process.env.REPOHANGAR_USER_SETTINGS as string;

interface Values {
  userProfiles: unknown;
  userRules: unknown;
  workspaceProfiles: unknown;
  workspaceRules: unknown;
}

function values(): Values {
  const config = vscode.workspace.getConfiguration('repohangar');
  const profiles = config.inspect('mr.profiles');
  const rules = config.inspect('mr.rules');
  return {
    userProfiles: profiles?.globalValue,
    userRules: rules?.globalValue,
    workspaceProfiles: profiles?.workspaceValue,
    workspaceRules: rules?.workspaceValue,
  };
}

describe('MR profile editor', () => {
  let api: TestApi;
  let originalUserSettings: string;

  const posted = (type: ProfilesHostMessage['type']) => api.profiles.postedMessages.filter((m) => m.type === type);
  const workspaceFile = () => readFileSync((vscode.workspace.workspaceFile as vscode.Uri).fsPath, 'utf8');
  const save = (message: Record<string, unknown>) => api.profiles.receiveForTest({ type: 'profilesSave', changed: {}, deleted: [], rules: null, ...message });

  /** Sets the four values, then has the editor read them again, as it does after a change made elsewhere. */
  async function given(v: Values): Promise<void> {
    await setScopedConfig('repohangar.mr.profiles', v.userProfiles, USER);
    await setScopedConfig('repohangar.mr.rules', v.userRules, USER);
    await setScopedConfig('repohangar.mr.profiles', v.workspaceProfiles, WORKSPACE);
    await setScopedConfig('repohangar.mr.rules', v.workspaceRules, WORKSPACE);
    await waitFor(() => JSON.stringify(values()) === JSON.stringify(v), 'the settings');
    await api.profiles.receiveForTest({ type: 'profilesDirty', dirty: false });
    await api.profiles.receiveForTest({ type: 'profilesReload' });
  }

  before(async () => {
    api = await ready(14);
    originalUserSettings = readFileSync(userSettingsFile, 'utf8');
    api.profiles.recordMessages = true;
    await vscode.commands.executeCommand('repohangar.profiles.edit');
    await waitFor(() => posted('profilesState').length > 0, 'the editor state');
  });

  after(async () => {
    api.profiles.current?.dispose();
    api.profiles.recordMessages = false;
    await given({ userProfiles: undefined, userRules: undefined, workspaceProfiles: undefined, workspaceRules: undefined });
    writeFileSync(userSettingsFile, originalUserSettings);
  });

  describe('Save scope matrix', () => {
    const initial: Values = {
      userProfiles: { default: { squash: true } },
      userRules: [{ branch: 'hotfix/**', profile: 'hotfix' }],
      workspaceProfiles: { default: { labels: ['payments'] }, hotfix: { draft: true } },
      workspaceRules: [
        { repo: 'git.acme.com/payments/**', profile: 'default', set: { reviewers: ['carla.ruiz'] } },
        { branch: 'hotfix/**', profile: 'hotfix' },
      ],
    };

    beforeEach(() => given(initial));

    it('R1 User: default.reviewers → ["ana.perez"] writes only the user-scope profiles', async () => {
      await save({ scope: 'user', changed: { default: { squash: true, reviewers: ['ana.perez'] } } });
      assert.deepEqual(values(), { ...initial, userProfiles: { default: { squash: true, reviewers: ['ana.perez'] } } });
    });

    it('R2 Workspace: rule 2 moved above rule 1 writes only the workspace rules, in the new order', async () => {
      const moved = [
        { from: 1, branch: 'hotfix/**', profile: 'hotfix' },
        { from: 0, repo: 'git.acme.com/payments/**', profile: 'default', set: { reviewers: ['carla.ruiz'] } },
      ];
      await save({ scope: 'workspace', rules: moved });
      assert.deepEqual(values(), {
        ...initial,
        workspaceRules: [
          { branch: 'hotfix/**', profile: 'hotfix' },
          { repo: 'git.acme.com/payments/**', profile: 'default', set: { reviewers: ['carla.ruiz'] } },
        ],
      });
    });

    it('R3 Workspace: new profile docs with labels ["docs"] adds it to the workspace-scope profiles only', async () => {
      await save({ scope: 'workspace', changed: { docs: { labels: ['docs'] } } });
      assert.deepEqual(values(), {
        ...initial,
        workspaceProfiles: { default: { labels: ['payments'] }, hotfix: { draft: true }, docs: { labels: ['docs'] } },
      });
    });

    it('R4 User: nothing edited writes nothing', async () => {
      const userText = readFileSync(userSettingsFile, 'utf8');
      const workspaceText = workspaceFile();
      await save({ scope: 'user' });
      assert.deepEqual(values(), initial);
      assert.equal(readFileSync(userSettingsFile, 'utf8'), userText);
      assert.equal(workspaceFile(), workspaceText);
    });
  });

  it('Round trip keeps comments', async () => {
    await given({ userProfiles: undefined, userRules: undefined, workspaceProfiles: { default: { squash: true } }, workspaceRules: undefined });
    const profiles = { default: { reviewers: ['ana.perez'] }, hotfix: { extends: 'default', labels: ['needs-review'] } };
    const before = [
      '{',
      '  // larger font for demos',
      '  "editor.fontSize": 15,',
      '  // team defaults, ask Ana before changing',
      `  "repohangar.mr.profiles": ${JSON.stringify(profiles)}`,
      '}',
      '',
    ].join('\n');
    writeFileSync(userSettingsFile, before);
    await waitFor(() => JSON.stringify(values().userProfiles) === JSON.stringify(profiles), 'the user settings.json');
    await api.profiles.receiveForTest({ type: 'profilesReload' });

    // Labels of hotfix set to hotfix, priority::1, then Save.
    await save({ scope: 'user', changed: { hotfix: { extends: 'default', labels: ['hotfix', 'priority::1'] } } });

    const after = readFileSync(userSettingsFile, 'utf8');
    const key = before.indexOf('"repohangar.mr.profiles"');
    assert.equal(after.slice(0, key), before.slice(0, key), 'both comment lines and every other setting unchanged');
    assert.deepEqual(values().userProfiles, { ...profiles, hotfix: { extends: 'default', labels: ['hotfix', 'priority::1'] } });
    assert.deepEqual(values().workspaceProfiles, { default: { squash: true } });
    assert.equal(vscode.workspace.getConfiguration('editor').inspect('fontSize')?.globalValue, 15);
  });

  it('External change with unsaved edits shows the banner and writes nothing', async () => {
    await given({ userProfiles: { default: { labels: ['payments'] } }, userRules: undefined, workspaceProfiles: undefined, workspaceRules: undefined });
    // An unsaved edit of default.labels.
    await api.profiles.receiveForTest({ type: 'profilesDirty', dirty: true });
    api.profiles.postedMessages.length = 0;

    await setScopedConfig('repohangar.mr.profiles', { default: { labels: ['changed-elsewhere'] } }, USER);

    await waitFor(() => posted('profilesBanner').length > 0, 'the banner');
    assert.deepEqual(posted('profilesState'), [], 'the editor keeps the unsaved edits');
    assert.deepEqual(values().userProfiles, { default: { labels: ['changed-elsewhere'] } });

    // Without unsaved edits, a change made elsewhere reloads the editor.
    await api.profiles.receiveForTest({ type: 'profilesDirty', dirty: false });
    api.profiles.postedMessages.length = 0;
    await setScopedConfig('repohangar.mr.profiles', { default: { labels: ['again'] } }, USER);
    await waitFor(() => posted('profilesState').length > 0, 'the reload');
    assert.deepEqual(posted('profilesBanner'), []);
  });
});
