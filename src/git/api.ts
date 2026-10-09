// Access to the built-in Git extension's API (getAPI(1)), its enablement and its state.

import * as vscode from 'vscode';
import type { API, GitExtension } from './git';
import type { GitApiState } from '../shared/model';

export class GitApiAccess implements vscode.Disposable {
  private api: API | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  /** Fires when Git is enabled or disabled, or when the API state changes. */
  readonly onDidChange = this.changeEmitter.event;

  constructor(private readonly extension: GitExtension) {
    this.disposables.push(
      extension.onDidChangeEnablement(() => this.connect()),
      this.changeEmitter,
    );
    this.connect();
  }

  static async create(): Promise<GitApiAccess> {
    const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!ext) throw new Error('The built-in Git extension (vscode.git) is not installed.');
    const exports = ext.isActive ? ext.exports : await ext.activate();
    return new GitApiAccess(exports);
  }

  get enabled(): boolean {
    return this.extension.enabled;
  }

  get current(): API | undefined {
    return this.api;
  }

  get state(): GitApiState {
    return this.api?.state ?? 'uninitialized';
  }

  /** Resolves once the Git API is enabled and initialized. */
  whenInitialized(): Promise<API> {
    return new Promise((resolve) => {
      const check = (): boolean => {
        if (this.api && this.api.state === 'initialized') {
          resolve(this.api);
          return true;
        }
        return false;
      };
      if (check()) return;
      const sub = this.onDidChange(() => {
        if (check()) sub.dispose();
      });
    });
  }

  private connect(): void {
    if (!this.extension.enabled) {
      this.api = undefined;
      this.changeEmitter.fire();
      return;
    }
    if (this.api) return;
    this.api = this.extension.getAPI(1);
    this.disposables.push(this.api.onDidChangeState(() => this.changeEmitter.fire()));
    this.changeEmitter.fire();
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
