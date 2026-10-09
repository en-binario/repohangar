// The provider layer in the extension host (hosting-providers, provider-auth): the probe, credentials, the review
// queue and loader, the stored review states, the MR / PR cell of every row, the commands, and the hosted-roots
// context key.

import * as vscode from 'vscode';
import type { Registry } from '../git/registry';
import type { Notifier } from '../integrations/workbench';
import type { RepoHangarLog } from '../log';
import type { FirstRunPanel, RowData } from '../shared/model';
import { compareState, copyLinkPlan, openReviewPlan, pipelineActive, reviewNoun } from '../shared/review';
import type { RowStore } from '../state/store';
import { Auth, type HostInfo } from './auth';
import { firstRunModel } from './firstRun';
import { GitLabProvider } from './gitlab';
import { Http, type FetchFn } from './http';
import { Prober, VersionCheck, type ProbedProvider } from './probe';
import { ProviderFactory, type HostedProvider, type HostingProvider } from './provider';
import { reviewInfo, reviewTarget, storeKey, type StoredReview } from './reviewInfo';
import { ReviewLoader, type HostSelection } from './reviewLoader';
import { ReviewQueue } from './reviewQueue';

const REVIEWS_KEY = 'repohangar.reviews';
const PROBED_KEY = 'repohangar.providers.probed';
const SELECTION_PREFIX = 'repohangar.providers.selection.';
const WARNED_KEY = 'repohangar.providers.versionWarnings';
const FIRST_RUN_KEY = 'repohangar.firstRun.shown';
const PROJECT_INFO_MS = 60 * 60_000;

interface StoredSelection extends HostSelection {
  extension: string;
  gitlab?: string;
}

export class ProviderService implements vscode.Disposable {
  readonly http: Http;
  readonly factory: ProviderFactory;
  readonly auth: Auth;
  readonly prober: Prober;
  readonly versions: VersionCheck;
  readonly loader: ReviewLoader;
  readonly queue: ReviewQueue;
  /** Overrides the window focus state (integration tests); undefined uses `window.state.focused`. */
  focusOverride: boolean | undefined;
  private readonly stored = new Map<string, StoredReview>();
  private readonly sessionStart = Date.now();
  private readonly seen = new Map<string, string>();
  private readonly gitlabVersions = new Map<string, string>();
  private readonly defaults = new Map<string, { value: string | undefined; at: number }>();
  private readonly firstRunEmitter = new vscode.EventEmitter<void>();
  /** Fires when the first-run panel's content changes. */
  readonly onDidChangeFirstRun = this.firstRunEmitter.event;
  private readonly disposables: vscode.Disposable[] = [];
  private hostedRoots = '';
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: RowStore,
    private readonly registry: Registry,
    private readonly notifier: Notifier,
    private readonly log: RepoHangarLog,
  ) {
    this.http = new Http({ trace: (line) => log.trace(line) });
    const stub = process.env.REPOHANGAR_HTTP_STUB;
    if (stub && context.extensionMode !== vscode.ExtensionMode.Production) this.http.fetchOverride = stubFetch(stub);
    this.factory = new ProviderFactory(this.http);
    this.auth = new Auth(context.secrets, context.globalState, notifier, (host) => this.hostInfo(host));
    const tokens = process.env.REPOHANGAR_TEST_TOKENS;
    if (tokens && context.extensionMode !== vscode.ExtensionMode.Production) this.auth.testTokens = JSON.parse(tokens) as Record<string, string>;
    this.prober = new Prober(this.http, {
      get: (host) => context.globalState.get<Record<string, ProbedProvider>>(PROBED_KEY, {})[host],
      set: (host, provider) =>
        Promise.resolve(context.globalState.update(PROBED_KEY, { ...context.globalState.get(PROBED_KEY, {}), [host]: provider })),
    });
    this.versions = new VersionCheck({
      read: async (host) => {
        const info = this.hostInfo(host);
        if (!(info?.provider instanceof GitLabProvider)) return undefined;
        return info.provider.version(await this.auth.credential(host));
      },
      warned: (host, version) => context.globalState.get<string[]>(WARNED_KEY, []).includes(`${host} ${version}`),
      markWarned: (host, version) =>
        Promise.resolve(context.globalState.update(WARNED_KEY, [...context.globalState.get<string[]>(WARNED_KEY, []), `${host} ${version}`])),
      warn: (text) => void notifier.show('warning', text),
    });
    this.loader = new ReviewLoader({
      row: (id) => this.store.get(id),
      provider: (kind, host, origin) => this.factory.get(kind, host, origin),
      credential: (host) => this.auth.credential(host),
      rejected: (host) => this.auth.reject(host),
      selection: (host) => this.selection(host),
      saveSelection: (host, selection) => this.saveSelection(host, selection),
      store: (id, branch, state) => {
        this.stored.set(storeKey(id, branch), state);
        this.scheduleSave();
      },
      now: () => Date.now(),
      log: (message) => log.warn(message),
    });
    this.queue = new ReviewQueue({
      timers: {
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
        now: () => Date.now(),
      },
      focused: () => this.focused,
      hostOf: (id) => this.loadableHost(id),
      all: () => this.store.all().flatMap((row) => (this.loadableHost(row.id) === undefined ? [] : [row.id])),
      age: (id) => {
        const row = this.store.get(id);
        const target = row ? reviewTarget(row) : undefined;
        const state = target ? this.stored.get(storeKey(id, target.branch)) : undefined;
        return state ? Date.now() - state.fetchedAt : undefined;
      },
      activePipelines: () => this.store.all().some((row) => row.review?.kind === 'loaded' && !!row.review.review && pipelineActive(row.review.review)),
      refreshMinutes: () => integerSetting('providers.refreshMinutes', 3, 1, 60),
      load: (host, ids) => this.load(host, ids),
    });
    for (const [key, state] of context.workspaceState.get<[string, StoredReview][]>(REVIEWS_KEY, [])) this.stored.set(key, state);
    registry.probed = (host) => this.prober.known(host);

    this.disposables.push(
      this.auth,
      this.firstRunEmitter,
      store.onBatch((batch) => this.onRows(batch.upserts)),
      this.auth.onDidChange((host) => this.onHostChanged(host)),
      vscode.window.onDidChangeWindowState((state) => this.queue.windowFocusChanged(this.focusOverride ?? state.focused)),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('repohangar.providers.refreshMinutes')) this.queue.pipelinesChanged();
      }),
      { dispose: () => this.queue.dispose() },
    );
    store.setDecorator((row) => ({ ...row, review: reviewInfo(row, this.infoContext()) }));
  }

  private get focused(): boolean {
    return this.focusOverride ?? vscode.window.state.focused;
  }

  private infoContext() {
    return {
      hostState: (host: string) => this.auth.hostState(host),
      stored: (id: string, branch: string) => this.stored.get(storeKey(id, branch)),
      sessionStart: this.sessionStart,
      hostFailing: (host: string) => this.queue.failing(host),
    };
  }

  /** The host and provider of a host the dashboard lists. */
  hostInfo(host: string): HostInfo | undefined {
    const row = this.store.all().find((r) => r.hosted?.host === host && (r.provider === 'gitlab' || r.provider === 'github'));
    if (!row?.hosted || (row.provider !== 'gitlab' && row.provider !== 'github')) return undefined;
    const provider = this.provider(row.provider, host, row.hosted.webUrl);
    return { host, kind: row.provider, provider };
  }

  private provider(kind: HostedProvider, host: string, webUrl: string): HostingProvider {
    return this.factory.get(kind, host, new URL(webUrl).origin);
  }

  /** The host of a repository's review request, when it has a credential. */
  private loadableHost(id: string): string | undefined {
    const row = this.store.get(id);
    const target = row ? reviewTarget(row) : undefined;
    return target && this.auth.hostState(target.host) === 'credential' ? target.host : undefined;
  }

  private async load(host: string, ids: string[]) {
    if (this.hostInfo(host)?.kind === 'gitlab') this.gitlabVersions.set(host, await this.versions.version(host));
    const outcome = await this.loader.load(host, ids);
    this.store.redecorate(this.idsOfHost(host));
    return outcome;
  }

  private idsOfHost(host: string): string[] {
    return this.store.all().flatMap((row) => (row.hosted?.host === host ? [row.id] : []));
  }

  private selection(host: string): HostSelection {
    const saved = this.context.globalState.get<StoredSelection>(SELECTION_PREFIX + host);
    if (!saved || saved.extension !== extensionVersion(this.context) || saved.gitlab !== this.gitlabVersions.get(host)) return {};
    return { ...(saved.selection ? { selection: saved.selection } : {}), ...(saved.rest ? { rest: true } : {}) };
  }

  private async saveSelection(host: string, selection: HostSelection): Promise<void> {
    const value: StoredSelection = {
      ...selection,
      extension: extensionVersion(this.context),
      ...(this.gitlabVersions.has(host) ? { gitlab: this.gitlabVersions.get(host) } : {}),
    };
    await this.context.globalState.update(SELECTION_PREFIX + host, value);
  }

  /** New or changed rows: the probe of unknown hosts, and a review request when the branch or head SHA changed. */
  private onRows(rows: readonly RowData[]): void {
    for (const row of rows) {
      if (row.provider === 'unknown' && row.hosted) {
        const host = row.hosted.host;
        if (this.prober.known(host) === undefined && this.focused) {
          void this.prober.probe(host, new URL(row.hosted.webUrl).origin).then((found) => {
            if (found) this.registry.recomputeAll();
          });
        }
      }
      const target = reviewTarget(row);
      const key = target ? `${target.branch}\u0000${row.headSha ?? ''}` : '';
      const previous = this.seen.get(row.id);
      this.seen.set(row.id, key);
      // The first time a row is seen, and whenever its branch or head SHA changes (Refresh trigger matrix R1–R3).
      if (target && previous !== key) this.queue.queue(row.id);
    }
    this.updateHostedRoots();
    this.firstRunEmitter.fire();
  }

  /** A host's credential state changed: its cells, and a request at once when it now has a credential. */
  private onHostChanged(host: string): void {
    const ids = this.idsOfHost(host);
    this.store.redecorate(ids);
    if (this.auth.hostState(host) === 'credential') {
      // A new credential: the host's earlier failures no longer count (provider-auth: Sign in to a host).
      this.queue.resetBackoff(host);
      void this.queue.loadNow(ids);
    }
    this.firstRunEmitter.fire();
  }

  /** RepoHangar pushed or published a repository (Provider refresh triggers R4). */
  afterPush(id: string): void {
    this.queue.queue(id);
  }

  /** `repohangar.refresh`: every unidentified host is probed again and every host gets a request at once. */
  async refresh(): Promise<void> {
    this.prober.forget();
    const probes = this.store.all().flatMap((row) =>
      row.provider === 'unknown' && row.hosted ? [this.prober.probe(row.hosted.host, new URL(row.hosted.webUrl).origin)] : [],
    );
    const found = await Promise.all(probes);
    if (found.some(Boolean)) this.registry.recomputeAll();
    await this.queue.refresh();
  }

  private updateHostedRoots(): void {
    const roots = this.store
      .all()
      .filter((r) => r.provider === 'gitlab' || r.provider === 'github')
      .map((r) => r.path)
      .sort();
    const key = roots.join('\n');
    if (key === this.hostedRoots) return;
    this.hostedRoots = key;
    void vscode.commands.executeCommand('setContext', 'repohangar.hostedRoots', roots);
  }

  /** The value of `repohangar.hostedRoots` (integration tests). */
  get hostedRootPaths(): string[] {
    return this.hostedRoots ? this.hostedRoots.split('\n') : [];
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      const ids = new Set(this.store.all().map((r) => r.id));
      const entries = [...this.stored.entries()].filter(([key]) => ids.has(key.split('\u0000')[0] as string));
      void this.context.workspaceState.update(REVIEWS_KEY, entries);
    }, 500);
  }

  // -------------------------------------------------------------------------------------------------------------
  // Actions on a row

  async openReview(id: string): Promise<void> {
    const row = this.store.get(id);
    if (!row) return;
    const plan = openReviewPlan(row, {
      reviewListUrl: (path, branch) => (row.hosted && this.isHosted(row) ? this.provider(row.provider, row.hosted.host, row.hosted.webUrl).reviewListUrl(path, branch) : ''),
    });
    if (plan.kind === 'open') await vscode.env.openExternal(vscode.Uri.parse(plan.url, true));
    else void this.notifier.show('information', plan.text);
  }

  async copyLink(id: string): Promise<void> {
    const row = this.store.get(id);
    if (!row) return;
    const plan = copyLinkPlan(row);
    if (plan.kind === 'notify') {
      void this.notifier.show('information', plan.text);
      return;
    }
    await vscode.env.clipboard.writeText(plan.url);
    vscode.window.setStatusBarMessage(`Copied ${plan.url}`, 3000);
  }

  async openPipeline(id: string): Promise<void> {
    const row = this.store.get(id);
    const review = row?.review?.kind === 'loaded' ? row.review.review : null;
    if (!review) return;
    await vscode.env.openExternal(vscode.Uri.parse(`${review.url}/${review.provider === 'gitlab' ? 'pipelines' : 'checks'}`, true));
  }

  /** The compare page's target: `refs/remotes/<remote>/HEAD`, else the provider's default branch (kept 1 h). */
  async compareTarget(id: string): Promise<string | null> {
    const row = this.store.get(id);
    if (!row) return null;
    if (row.defaultBranch) return row.defaultBranch;
    return (await this.providerDefault(row)) ?? null;
  }

  private async providerDefault(row: RowData): Promise<string | undefined> {
    if (!row.hosted || !this.isHosted(row)) return undefined;
    const key = `${row.hosted.host}/${row.hosted.projectPath}`;
    const cached = this.defaults.get(key);
    if (cached && Date.now() - cached.at < PROJECT_INFO_MS) return cached.value;
    const credential = await this.auth.credential(row.hosted.host);
    if (!credential) return undefined;
    let value: string | undefined;
    try {
      value = await this.provider(row.provider, row.hosted.host, row.hosted.webUrl).defaultBranch(row.hosted.projectPath, credential);
    } catch {
      value = undefined;
    }
    this.defaults.set(key, { value, at: Date.now() });
    return value;
  }

  async openCompare(id: string): Promise<void> {
    const row = this.store.get(id);
    if (!row?.hosted || !this.isHosted(row) || row.head.kind !== 'branch') return;
    const target = await this.compareTarget(id);
    const state = compareState(row, target);
    if (!state.enabled || state.target === null) {
      void this.notifier.show('information', `The compare page of ${row.name} is not available: ${state.enabled ? 'Default branch unknown' : state.reason}.`);
      return;
    }
    const url = this.provider(row.provider, row.hosted.host, row.hosted.webUrl).compareUrl(row.hosted.projectPath, state.target, row.head.name);
    await vscode.env.openExternal(vscode.Uri.parse(url, true));
  }

  private isHosted(row: RowData): row is RowData & { provider: HostedProvider } {
    return row.provider === 'gitlab' || row.provider === 'github';
  }

  /** The `?` cell: This host is GitLab / GitHub, written to `repohangar.hosts` at user scope. */
  async chooseProvider(host: string): Promise<void> {
    const items = [
      { label: 'This host is GitLab', provider: 'gitlab' as const },
      { label: 'This host is GitHub', provider: 'github' as const },
    ];
    const chosen = await this.pickProvider(host, items);
    if (!chosen) return;
    const config = vscode.workspace.getConfiguration('repohangar');
    const current = config.inspect<Record<string, unknown>>('hosts')?.globalValue ?? {};
    await config.update('hosts', { ...current, [host]: chosen }, vscode.ConfigurationTarget.Global);
  }

  /** The provider quick pick; replaced by the tests. */
  pickProvider: (host: string, items: { label: string; provider: 'gitlab' | 'github' }[]) => Promise<'gitlab' | 'github' | undefined> = async (
    host,
    items,
  ) => (await vscode.window.showQuickPick(items, { title: host, placeHolder: `Which provider is ${host}?` }))?.provider;

  /** The hosts of the listed repositories whose provider is gitlab or github. */
  hosts(): HostInfo[] {
    const hosts = new Set(this.store.all().flatMap((r) => (r.hosted && this.isHosted(r) ? [r.hosted.host] : [])));
    return [...hosts].sort().flatMap((host) => {
      const info = this.hostInfo(host);
      return info ? [info] : [];
    });
  }

  /** `repohangar.signIn`: a quick pick of the hosts with their state, then the sign-in. */
  async signInCommand(): Promise<void> {
    const items = this.hosts().map((info) => {
      const state = this.auth.hostState(info.host);
      const account = this.auth.account(info.host);
      const description = state === 'skipped' ? 'Skipped' : account ? `Signed in as ${account.username}` : 'Not connected';
      return { label: info.host, description, host: info.host };
    });
    if (items.length === 0) {
      void this.notifier.show('information', 'No repository is on a GitLab or GitHub host.');
      return;
    }
    const chosen = await vscode.window.showQuickPick(items, { placeHolder: 'Sign in to a host' });
    if (chosen) await this.auth.signIn(chosen.host);
  }

  /** `repohangar.signOut`: a quick pick of the hosts with a credential. */
  async signOutCommand(): Promise<void> {
    const items = this.hosts()
      .filter((info) => this.auth.hostState(info.host) === 'credential')
      .map((info) => ({ label: info.host, description: this.auth.account(info.host)?.username ?? '', host: info.host }));
    if (items.length === 0) {
      void this.notifier.show('information', 'RepoHangar is not signed in to any host.');
      return;
    }
    const chosen = await vscode.window.showQuickPick(items, { placeHolder: 'Sign out of a host' });
    if (chosen) await this.signOut(chosen.host);
  }

  async signOut(host: string): Promise<void> {
    if (!(await this.auth.signOut(host))) return;
    const ids = new Set(this.idsOfHost(host));
    for (const key of [...this.stored.keys()]) if (ids.has(key.split('\u0000')[0] as string)) this.stored.delete(key);
    this.scheduleSave();
    this.store.redecorate(ids);
  }

  async skipHost(host: string): Promise<void> {
    await this.auth.setSkipped(host, true);
  }

  // -------------------------------------------------------------------------------------------------------------
  // First run

  /** The first-run hosts panel, until the user dismisses it once. */
  firstRun(): FirstRunPanel | undefined {
    if (this.context.globalState.get<boolean>(FIRST_RUN_KEY, false)) return undefined;
    return firstRunModel(this.store.all(), (host) => {
      const account = this.auth.account(host);
      return { state: this.auth.hostState(host), ...(account ? { account } : {}) };
    });
  }

  firstRunDismissed(): boolean {
    return this.context.globalState.get<boolean>(FIRST_RUN_KEY, false);
  }

  async firstRunDone(): Promise<void> {
    await this.context.globalState.update(FIRST_RUN_KEY, true);
    this.firstRunEmitter.fire();
  }

  /** The noun of the provider of a row, for notifications. */
  noun(id: string): string {
    const provider = this.store.get(id)?.provider;
    return provider === 'github' ? reviewNoun('github') : reviewNoun('gitlab');
  }

  dispose(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    for (const d of this.disposables) d.dispose();
  }
}

function extensionVersion(context: vscode.ExtensionContext): string {
  return String((context.extension.packageJSON as { version?: unknown }).version ?? '');
}

function integerSetting(key: string, fallback: number, min: number, max: number): number {
  const value = vscode.workspace.getConfiguration('repohangar').get<number>(key, fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
}

/** UI tests: every provider request goes to a local stub server, as `<stub>/<host><path>?<query>`. */
function stubFetch(stub: string): FetchFn {
  return (url, init) => {
    const target = new URL(url);
    return globalThis.fetch(`${stub.replace(/\/$/, '')}/${target.host}${target.pathname}${target.search}`, init);
  };
}
