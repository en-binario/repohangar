// Credentials per host (provider-auth): VS Code sessions, tokens in SecretStorage, the glab and gh imports, sign in,
// sign out, rejected credentials and skipped hosts (design D-6). The order lives in `authOrder.ts`; this module runs it.

import { execFile } from 'node:child_process';
import * as vscode from 'vscode';
import type { Notifier } from '../integrations/workbench';
import { findCredential, sessionProvider, type AuthPort, type CredentialSource, type Validation } from './authOrder';
import { HttpError, type Credential } from './http';
import type { HostedProvider, HostingProvider } from './provider';
import type { HostState } from './reviewInfo';

export const SECRET_PREFIX = 'repohangar.token.';
const SKIPPED_KEY = 'repohangar.providers.skippedHosts';
const CLI_TIMEOUT_MS = 10_000;

export interface HostInfo {
  host: string;
  kind: HostedProvider;
  provider: HostingProvider;
}

interface Known {
  token: string;
  source: CredentialSource;
  username?: string;
}

type Entry = { status: 'pending'; promise: Promise<Known | undefined> } | { status: 'done'; credential: Known | undefined };

/** The interactive parts, replaced by the integration tests. */
export interface AuthUi {
  /** A VS Code session; `create` prompts (`createIfNone`), `force` asks for a new one (`forceNewSession`) */
  session(
    providerId: 'github' | 'github-enterprise',
    mode: 'silent' | 'create' | 'force',
  ): Promise<{ token: string; username: string } | undefined>;
  openExternal(url: string): Promise<void>;
  /**
   * Shows the password input until `accept` returns no message or the user presses Esc; resolves to the accepted value
   * or undefined.
   */
  password(title: string, accept: (value: string) => Promise<string | undefined>): Promise<string | undefined>;
  /** Runs glab or gh: its standard output and error, or undefined when it cannot run or fails */
  cli(command: 'glab' | 'gh', args: string[]): Promise<string | undefined>;
}

export const vscodeAuthUi: AuthUi = {
  async session(providerId, mode) {
    const options: vscode.AuthenticationGetSessionOptions =
      mode === 'silent' ? { createIfNone: false, silent: true } : mode === 'create' ? { createIfNone: true } : { forceNewSession: true };
    try {
      const session = await vscode.authentication.getSession(providerId, ['repo'], options);
      return session ? { token: session.accessToken, username: session.account.label } : undefined;
    } catch {
      return undefined;
    }
  },
  async openExternal(url) {
    await vscode.env.openExternal(vscode.Uri.parse(url, true));
  },
  password(title, accept) {
    return new Promise((resolve) => {
      const input = vscode.window.createInputBox();
      input.title = title;
      input.password = true;
      input.ignoreFocusOut = true;
      input.placeholder = 'Token';
      let done = false;
      input.onDidAccept(async () => {
        const value = input.value.trim();
        if (!value) return;
        input.busy = true;
        input.enabled = false;
        const message = await accept(value);
        input.busy = false;
        input.enabled = true;
        if (message) {
          input.validationMessage = message;
          return;
        }
        done = true;
        input.hide();
        resolve(value);
      });
      input.onDidChangeValue(() => (input.validationMessage = undefined));
      input.onDidHide(() => {
        input.dispose();
        if (!done) resolve(undefined);
      });
      input.show();
    });
  },
  cli(command, args) {
    return new Promise((resolve) => {
      // No update check, telemetry, prompt or colour from glab and gh while RepoHangar borrows a login.
      const env = {
        ...process.env,
        NO_COLOR: '1',
        GLAB_CHECK_UPDATE: 'false',
        GLAB_SEND_TELEMETRY: 'false',
        GH_NO_UPDATE_NOTIFIER: '1',
        GH_PROMPT_DISABLED: '1',
      };
      execFile(command, args, { timeout: CLI_TIMEOUT_MS, windowsHide: true, env }, (error, stdout, stderr) => {
        resolve(error ? undefined : `${stdout}${stderr}`);
      });
    });
  },
};

export class Auth implements vscode.Disposable {
  private readonly entries = new Map<string, Entry>();
  /** Hosts whose credential was rejected in this window session; no request until the user signs in */
  private readonly rejected = new Set<string>();
  private readonly warned = new Set<string>();
  private readonly changeEmitter = new vscode.EventEmitter<string>();
  /** Fires with a host whose credential state changed. */
  readonly onDidChange = this.changeEmitter.event;
  private readonly disposables: vscode.Disposable[] = [];
  ui: AuthUi = vscodeAuthUi;
  /** Tokens per host that UI tests seed through REPOHANGAR_TEST_TOKENS; never set in Production mode. */
  testTokens: Record<string, string> = {};

  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly globalState: vscode.Memento,
    private readonly notifier: Notifier,
    /** The provider of a host the dashboard lists, or undefined */
    private readonly hostInfo: (host: string) => HostInfo | undefined,
  ) {
    this.disposables.push(
      this.changeEmitter,
      vscode.authentication.onDidChangeSessions((e) => {
        if (e.provider.id !== 'github' && e.provider.id !== 'github-enterprise') return;
        // A host that uses a VS Code session, or has no credential yet, looks it up again; stored tokens stay.
        for (const [host, entry] of [...this.entries]) {
          if (sessionProvider(host, gheHost()) !== e.provider.id) continue;
          if (entry.status === 'done' && entry.credential && entry.credential.source !== 'session') continue;
          this.forget(host);
        }
      }),
    );
  }

  /** The state of a host for the MR / PR cells; starts the credential lookup the first time. */
  hostState(host: string): HostState {
    if (this.skipped().includes(host)) return 'skipped';
    // No listed repository is on this host as GitLab or GitHub (yet): nothing to look up.
    if (!this.hostInfo(host)) return 'none';
    if (this.rejected.has(host)) return 'none';
    const entry = this.entries.get(host);
    if (!entry) {
      this.lookup(host);
      return 'pending';
    }
    if (entry.status === 'pending') return 'pending';
    return entry.credential ? 'credential' : 'none';
  }

  /** The credential of a host, looked up once per session (provider-auth: GitHub credentials, GitLab credentials). */
  async credential(host: string): Promise<Credential | undefined> {
    if (this.skipped().includes(host) || this.rejected.has(host)) return undefined;
    const entry = this.entries.get(host);
    const known = entry ? (entry.status === 'pending' ? await entry.promise : entry.credential) : await this.lookup(host);
    const info = this.hostInfo(host);
    return known && info ? { token: known.token, apiHost: info.provider.apiHost } : undefined;
  }

  /** The account and how it was found, for the first-run panel and the sign-in quick pick. */
  account(host: string): { username: string; source: CredentialSource } | undefined {
    const entry = this.entries.get(host);
    if (entry?.status !== 'done' || !entry.credential || this.rejected.has(host)) return undefined;
    return { username: entry.credential.username ?? '', source: entry.credential.source };
  }

  private lookup(host: string): Promise<Known | undefined> {
    const info = this.hostInfo(host);
    if (!info) return Promise.resolve(undefined);
    const promise = findCredential(host, info.kind, this.port(info)).then(async (found) => {
      let known: Known | undefined = found;
      if (found && found.username === undefined) {
        const validation = await this.validate(info, found.token);
        known = { ...found, ...(validation.ok ? { username: validation.username } : {}) };
      }
      if (this.entries.get(host)?.status === 'pending') {
        this.entries.set(host, { status: 'done', credential: known });
        this.changeEmitter.fire(host);
      }
      return known;
    });
    this.entries.set(host, { status: 'pending', promise });
    return promise;
  }

  private port(info: HostInfo): AuthPort {
    return {
      gheHost: gheHost(),
      session: (id) => this.ui.session(id, 'silent'),
      secret: async (host) => this.testTokens[host] ?? ((await this.secrets.get(SECRET_PREFIX + host)) || undefined),
      storeSecret: (host, token) => Promise.resolve(this.secrets.store(SECRET_PREFIX + host, token)),
      run: (command, args) => this.ui.cli(command, args),
      validate: (token) => this.validate(info, token),
      announce: (text) => void this.notifier.show('information', text),
    };
  }

  private async validate(info: HostInfo, token: string): Promise<Validation> {
    try {
      const user = await info.provider.currentUser(token);
      return { ok: true, username: user.username };
    } catch (error) {
      return { ok: false, ...(error instanceof HttpError && error.status !== undefined ? { status: error.status } : {}) };
    }
  }

  /**
   * Signs in to a host (provider-auth: Sign in to a host): the VS Code session for github.com and the
   * `github-enterprise.uri` host, else the token page and a password input. Resolves to true after a sign-in.
   */
  async signIn(host: string, options: { force?: boolean } = {}): Promise<boolean> {
    const info = this.hostInfo(host);
    if (!info) return false;
    const sessionId = info.kind === 'github' ? sessionProvider(host, gheHost()) : undefined;
    let known: Known | undefined;
    if (sessionId) {
      const session = await this.ui.session(sessionId, options.force ? 'force' : 'create');
      if (session) known = { token: session.token, source: 'session', username: session.username };
    } else {
      const page =
        info.kind === 'gitlab'
          ? `https://${host}/-/user_settings/personal_access_tokens?name=RepoHangar&scopes=api`
          : `https://${host}/settings/tokens/new?description=RepoHangar&scopes=repo`;
      await this.ui.openExternal(page);
      let username = '';
      const token = await this.ui.password(`Paste the ${info.kind === 'gitlab' ? 'GitLab' : 'GitHub'} token for ${host}`, async (value) => {
        const validation = await this.validate(info, value);
        if (validation.ok) {
          username = validation.username;
          return undefined;
        }
        return `${host} did not accept this token${validation.status ? ` (${validation.status})` : ''}.`;
      });
      if (token) {
        await this.secrets.store(SECRET_PREFIX + host, token);
        known = { token, source: 'token', username };
      }
    }
    if (!known) return false;
    this.rejected.delete(host);
    this.warned.delete(host);
    await this.setSkipped(host, false);
    this.entries.set(host, { status: 'done', credential: known });
    this.changeEmitter.fire(host);
    return true;
  }

  /** Sign out of a host (provider-auth: Sign out of a host); false when the credential is a VS Code session. */
  async signOut(host: string): Promise<boolean> {
    const entry = this.entries.get(host);
    if (entry?.status === 'done' && entry.credential?.source === 'session') {
      void this.notifier.show('information', `RepoHangar uses your VS Code account for ${host}. Sign out of it from the Accounts menu.`);
      return false;
    }
    await this.secrets.delete(SECRET_PREFIX + host);
    this.entries.set(host, { status: 'done', credential: undefined });
    this.changeEmitter.fire(host);
    return true;
  }

  /** A request with the host's credential was answered 401 (provider-auth: Rejected credential). */
  async reject(host: string): Promise<void> {
    if (this.rejected.has(host)) return;
    this.rejected.add(host);
    const entry = this.entries.get(host);
    const session = entry?.status === 'done' && entry.credential?.source === 'session';
    if (!session) await this.secrets.delete(SECRET_PREFIX + host);
    this.entries.set(host, { status: 'done', credential: undefined });
    this.changeEmitter.fire(host);
    if (this.warned.has(host)) return;
    this.warned.add(host);
    const choice = await this.notifier.show('warning', `${host} rejected the saved ${session ? 'VS Code session' : 'token'}.`, 'Sign In…');
    if (choice === 'Sign In…') await this.signIn(host, { force: session });
  }

  /** The stored token of a host (integration tests). */
  storedToken(host: string): Thenable<string | undefined> {
    return this.secrets.get(SECRET_PREFIX + host);
  }

  skipped(): string[] {
    return this.globalState.get<string[]>(SKIPPED_KEY, []);
  }

  async setSkipped(host: string, skipped: boolean): Promise<void> {
    const current = this.skipped();
    if (current.includes(host) === skipped) return;
    await this.globalState.update(SKIPPED_KEY, skipped ? [...current, host] : current.filter((h) => h !== host));
    this.changeEmitter.fire(host);
  }

  /** Looks the credential of a host up again (sessions changed). */
  forget(host: string): void {
    this.entries.delete(host);
    this.changeEmitter.fire(host);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}

/** The host of `github-enterprise.uri`, lower-cased, or undefined. */
export function gheHost(): string | undefined {
  const uri = vscode.workspace.getConfiguration().get<string>('github-enterprise.uri');
  if (!uri) return undefined;
  try {
    return new URL(uri.includes('://') ? uri : `https://${uri}`).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}
