// The MR profile editor panel (mr-profiles: Open the profile editor, Profile editor content, Save profiles and rules,
// Settings changed outside the editor, Per-repository memory; add-profile-editor design D-1, D-2): one panel per window,
// with the dashboard's CSP and validated messages. Settings are written only on Save, through
// `WorkspaceConfiguration.update`, so VS Code keeps the rest of `settings.json` and its comments.

import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import {
  hasChanges,
  parseProfilesMessage,
  profilesValue,
  rulesValue,
  scopeData,
  searchDefault,
  type EditorScope,
  type ProfilesHostMessage,
  type ProfilesState,
  type ProfilesViewMessage,
  type ScopeChanges,
  type SearchRepoChoice,
} from '../shared/profileEditor';
import { memoryLines, type RepoMemoryStore } from './memory';
import { mergeScopes, resolveProfile, type RawProfiles } from './profiles';
import { DEFAULT_TICKET_PATTERN, DEFAULT_TYPE_MAP, renderTitle } from './templates';
import type { UserSearch } from './userSearch';

export const PROFILES_VIEW_TYPE = 'repohangar.profiles';

/** The title preview's repository and branch without a focused dashboard row. */
export const PREVIEW_EXAMPLE = { repo: 'example', branch: 'feature/ABC-12-add-notes' };

export interface ProfileEditorPort {
  /** The focused dashboard row's repository name and branch, for the title preview */
  focused(): { repo: string; branch: string } | undefined;
  memory: RepoMemoryStore;
  /** The focused dashboard row's id (mr-profiles: Find users in the profile editor) */
  focusedId(): string | undefined;
  /** The dashboard repositories whose provider is `gitlab` or `github`, by name */
  hostedRepos(): SearchRepoChoice[];
  userSearch: UserSearch;
}

interface StoredScope {
  profiles: unknown;
  rules: unknown;
}

export class ProfileEditor implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private panelDisposables: vscode.Disposable[] = [];
  private readonly disposables: vscode.Disposable[] = [];
  private ready = false;
  /** The view has unsaved edits (it says so with `profilesDirty`) */
  private dirty = false;
  /** Set while Save writes, so its own configuration changes do not count as made elsewhere */
  private saving = false;
  /** The settings as last sent to the view; the rule list is rebuilt from it (design D-2) */
  private sent: { user: StoredScope; workspace: StoredScope } | undefined;
  /** Every message posted to the webview while `recordMessages` is true (integration tests). */
  readonly postedMessages: ProfilesHostMessage[] = [];
  recordMessages = false;
  /** Asks before a profile is deleted; true for Delete (integration tests answer it). */
  confirm: (text: string) => Promise<boolean> = async (text) => (await vscode.window.showWarningMessage(text, { modal: true }, 'Delete')) === 'Delete';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly port: ProfileEditorPort,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('repohangar.mr.profiles') || e.affectsConfiguration('repohangar.mr.rules')) this.settingsChanged();
      }),
      port.memory.onDidChange(() => this.post({ type: 'profilesMemory', memory: this.memory() })),
    );
  }

  get current(): vscode.WebviewPanel | undefined {
    return this.panel;
  }

  /** `repohangar.profiles.edit`, `⚙` and Set up a default profile: opens the editor, or reveals the open one. */
  open(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      PROFILES_VIEW_TYPE,
      'MR Profiles',
      vscode.window.tabGroups.activeTabGroup.viewColumn ?? vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: false, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')] },
    );
    this.panel = panel;
    this.ready = false;
    this.dirty = false;
    panel.webview.html = this.html(panel.webview);
    this.panelDisposables = [
      panel.webview.onDidReceiveMessage((raw) => {
        const message = parseProfilesMessage(raw);
        if (message) void this.handle(message);
      }),
      panel.onDidDispose(() => {
        for (const d of this.panelDisposables) d.dispose();
        this.panelDisposables = [];
        this.panel = undefined;
        this.ready = false;
        this.dirty = false;
      }),
    ];
  }

  /** Handles a raw message as if the webview had sent it (integration tests). */
  receiveForTest(raw: unknown): Promise<void> {
    const message = parseProfilesMessage(raw);
    return message ? this.handle(message) : Promise.resolve();
  }

  private async handle(message: ProfilesViewMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.ready = true;
        this.postState();
        return;
      case 'profilesDirty':
        this.dirty = message.dirty;
        return;
      case 'profilesSave':
        await this.save(message.scope, message);
        return;
      case 'profilesReload':
        this.postState();
        return;
      case 'profilesPreview':
        this.post({ type: 'profilesPreview', template: message.template, text: this.preview(message.template) });
        return;
      case 'profilesDelete':
        if (message.name === 'default') return;
        if (await this.confirm(`Delete the MR profile "${message.name}"? Rules that use it will stop working.`)) {
          this.post({ type: 'profilesDeleteConfirmed', scope: message.scope, name: message.name });
        }
        return;
      case 'profilesForget':
        await this.port.memory.forget(message.key);
        return;
      case 'profilesOpenSettings':
        await vscode.commands.executeCommand(message.scope === 'user' ? 'workbench.action.openSettingsJson' : 'workbench.action.openWorkspaceSettingsFile');
        return;
      case 'profilesSearchUsers':
        this.port.userSearch.search(`profiles:${message.field}`, message.repo, message.field, message.text, (answer) =>
          this.post({ type: 'profilesUsers', answer }),
        );
        return;
    }
  }

  /**
   * Save (mr-profiles: Save profiles and rules): at the chosen scope only, one `update` per changed setting, built from
   * the latest stored value so the profiles, rules and keys the editor did not change are kept.
   */
  private async save(scope: EditorScope, changes: ScopeChanges): Promise<void> {
    if (!hasChanges(changes) || (scope === 'workspace' && !hasWorkspace())) return;
    const target = scope === 'user' ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace;
    const config = vscode.workspace.getConfiguration('repohangar');
    this.saving = true;
    try {
      if (Object.keys(changes.changed).length > 0 || changes.deleted.length > 0) {
        await config.update('mr.profiles', profilesValue(this.stored(scope).profiles, changes), target);
      }
      if (changes.rules !== null) {
        await config.update('mr.rules', rulesValue(this.sent?.[scope].rules ?? this.stored(scope).rules, changes.rules), target);
      }
    } finally {
      this.saving = false;
    }
    this.postState();
  }

  /** The value of each setting at a scope, as stored (the user scope falls back to the declared default). */
  private stored(scope: EditorScope): StoredScope {
    const config = vscode.workspace.getConfiguration('repohangar');
    const profiles = config.inspect<RawProfiles>('mr.profiles');
    const rules = config.inspect<unknown[]>('mr.rules');
    return scope === 'user'
      ? { profiles: profiles?.globalValue ?? profiles?.defaultValue ?? {}, rules: rules?.globalValue ?? [] }
      : { profiles: profiles?.workspaceValue ?? {}, rules: rules?.workspaceValue ?? [] };
  }

  private state(): ProfilesState {
    const searchRepos = this.port.hostedRepos();
    const user = this.stored('user');
    const workspace = this.stored('workspace');
    this.sent = { user, workspace };
    return {
      scope: 'user',
      user: scopeData(user.profiles, user.rules),
      workspace: hasWorkspace() ? scopeData(workspace.profiles, workspace.rules) : null,
      memory: this.memory(),
      searchRepos,
      searchDefault: searchDefault(this.port.focusedId(), searchRepos),
    };
  }

  private postState(): void {
    if (!this.panel) return;
    this.dirty = false;
    this.post({ type: 'profilesState', state: this.state() });
  }

  /** mr-profiles: Settings changed outside the editor — reload without unsaved edits, else the banner. */
  private settingsChanged(): void {
    if (this.saving || !this.sent || !this.panel || !this.ready) return;
    if (JSON.stringify({ user: this.stored('user'), workspace: this.stored('workspace') }) === JSON.stringify(this.sent)) return;
    if (this.dirty) this.post({ type: 'profilesBanner' });
    else this.postState();
  }

  /** The memory lines, against the `default` profile of both scopes. */
  private memory() {
    const user = this.stored('user').profiles as RawProfiles;
    const workspace = this.stored('workspace').profiles as RawProfiles;
    const base = resolveProfile(mergeScopes(user, workspace), 'default');
    return memoryLines(this.port.memory.all(), base.ok ? base.values : undefined);
  }

  /** The title template for the focused dashboard row's repository and branch, else the example branch. */
  private preview(template: string): string {
    const config = vscode.workspace.getConfiguration('repohangar');
    const { repo, branch } = this.port.focused() ?? PREVIEW_EXAMPLE;
    return renderTitle(
      template,
      {
        branch,
        repo,
        defaultBranch: 'main',
        commits: [],
        remoteBranches: [],
        me: '',
        ticketPattern: config.get<string>('mr.ticketPattern', DEFAULT_TICKET_PATTERN),
        typeMap: config.get<Record<string, string>>('mr.typeMap', { ...DEFAULT_TYPE_MAP }),
      },
      true,
    );
  }

  private post(message: ProfilesHostMessage): void {
    if (this.recordMessages) this.postedMessages.push(message);
    if (!this.panel || !this.ready) return;
    void this.panel.webview.postMessage(message);
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('base64');
    const dist = (file: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', file)).toString();
    const csp = [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src ${webview.cspSource}`,
      `font-src ${webview.cspSource}`,
      `img-src ${webview.cspSource}`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${dist('codicons/codicon.css')}">
<link rel="stylesheet" href="${dist('profiles.css')}">
<title>MR Profiles</title>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" src="${dist('profiles.js')}"></script>
</body>
</html>`;
  }

  dispose(): void {
    this.panel?.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

/** An open folder or workspace, which Workspace scope needs. */
export function hasWorkspace(): boolean {
  return vscode.workspace.workspaceFile !== undefined || (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
}
