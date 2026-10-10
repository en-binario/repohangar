// Merge request creation in the extension host (mr-creation): the create flow's port, the create job, the result and
// its buttons, Undo, the push-options result and Connect, the quick create input, the drawer, and merge requests for
// a selection with their related links.

import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import * as vscode from 'vscode';
import { nodeFileSystem } from '../git/fsPort';
import type { Repository } from '../git/git';
import { gitProcessLog, runGit } from '../git/process';
import type { Registry } from '../git/registry';
import type { CommandRunner, Notifier } from '../integrations/workbench';
import type { PanelView } from '../jobs/results';
import type { Job, JobRunner } from '../jobs/runner';
import type { RepoHangarLog } from '../log';
import { GitLabProvider } from '../providers/gitlab';
import type { HostedProvider, ProjectInfo, UserStores } from '../providers/provider';
import type { ProviderService } from '../providers/service';
import type { DrawerData, DrawerEdits } from '../shared/drawer';
import { plural } from '../shared/format';
import type { RowData } from '../shared/model';
import type { RowStore } from '../state/store';
import type { MrBatch } from '../ui/actions';
import { CreateFlow, type CreateOptions, type FlowOutcome, type MrSettings, type Prepared, type Stop } from './create';
import type { UsePushOptions } from './guards';
import { RepoMemoryStore, SAVED_KEYS, type SavedValues } from './memory';
import { batchEntry, confirmDetail, entryDetail, mrPanelTitle, relatedNote, writeRelatedLinks, type MrBatchEntry } from './multi';
import { hasWorkspace } from './profileEditor';
import { mergeScopes, resolveProfile, type ProfileValues, type RawProfiles } from './profiles';
import { EMPTY_RECENT, readRecent, recentKey, recordRecent, type Recent } from './recent';
import { allLinks } from './related';
import { closedText, resultPlan, undoExpiredText, UNDO_WINDOW_MS } from './result';
import { readRules } from './rules';
import { planSaveDefaults, type SaveTarget } from './saveDefaults';
import { DEFAULT_TICKET_PATTERN, DEFAULT_TYPE_MAP } from './templates';

const PROJECT_INFO_MS = 60 * 60_000;
const REMOTE_HEAD = 1;

/** The quick create input (mr-creation: Quick create input), replaced by the integration tests. */
export interface QuickCreateModel {
  title: string;
  repo: string;
  profile: string;
  detail: string;
  otherProfiles: string[];
}

export type QuickCreateChoice =
  | { kind: 'create'; title: string }
  | { kind: 'edit'; title: string }
  | { kind: 'profile'; profile: string }
  | { kind: 'draft'; title: string }
  | undefined;

/** The confirmation before a selection (mr-creation: Create merge requests on a selection). */
export interface BatchConfirmModel {
  /** `Create merge requests in 3 repositories` */
  title: string;
  /** `Create 3` */
  label: string;
  /** `billing-api main ← feature/ABC-12-notes · …` */
  detail: string;
}

export interface MrUi {
  quickCreate(model: QuickCreateModel): Promise<QuickCreateChoice>;
}

/** The confirmation before a selection, replaced by the integration tests. */
export interface MrBatchUi {
  /** True when the user picks the Create item; false on Esc */
  confirmBatch(model: BatchConfirmModel): Promise<boolean>;
}

export const vscodeMrBatchUi: MrBatchUi = {
  async confirmBatch(model) {
    const chosen = await vscode.window.showQuickPick([{ label: model.label, detail: model.detail }], { title: model.title, matchOnDetail: false });
    return chosen !== undefined;
  },
};

export const vscodeMrUi: MrUi = {
  quickCreate(model) {
    return new Promise((resolve) => {
      const qp = vscode.window.createQuickPick<vscode.QuickPickItem & { choice: string }>();
      qp.title = `Create MR for ${model.repo} — Enter to create, type to change the title`;
      qp.value = model.title;
      qp.placeholder = 'Title';
      qp.matchOnDescription = false;
      qp.items = [
        { label: `Create with profile "${model.profile}"`, detail: model.detail, alwaysShow: true, choice: 'create' },
        { label: 'Edit all fields…', alwaysShow: true, choice: 'edit' },
        ...model.otherProfiles.map((p) => ({ label: `Use profile "${p}"`, alwaysShow: true, choice: `profile:${p}` })),
        { label: 'Create as draft', alwaysShow: true, choice: 'draft' },
      ];
      let done = false;
      qp.onDidAccept(() => {
        const item = qp.selectedItems[0] ?? qp.activeItems[0];
        done = true;
        const title = qp.value.trim() || model.title;
        qp.hide();
        if (!item || item.choice === 'create') resolve({ kind: 'create', title });
        else if (item.choice === 'edit') resolve({ kind: 'edit', title });
        else if (item.choice === 'draft') resolve({ kind: 'draft', title });
        else resolve({ kind: 'profile', profile: item.choice.slice('profile:'.length) });
      });
      qp.onDidHide(() => {
        qp.dispose();
        if (!done) resolve(undefined);
      });
      qp.show();
    });
  },
};

export interface MrDashboard {
  open(): void;
  /** Posts the drawer to the webview, or closes it */
  postDrawer(data: DrawerData | null): void;
  postDrawerUsers(id: string, users: string[]): void;
}

export class MrService implements vscode.Disposable {
  readonly flow: CreateFlow;
  ui: MrUi = vscodeMrUi;
  batchUi: MrBatchUi = vscodeMrBatchUi;
  /** Replaced by the tests to answer the drawer without a webview. */
  dashboard: MrDashboard | undefined;
  /** The per-repository memory of this workspace (mr-profiles: Per-repository memory) */
  readonly repoMemory: RepoMemoryStore;
  private readonly projectInfos = new Map<string, { info: ProjectInfo | undefined; at: number }>();
  private drawer: { id: string; profile: string; edits: DrawerEdits } | undefined;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  /** The last selection batch, one entry per repository: its lines, Retry failed and the related links. */
  private readonly batchEntries = new Map<string, MrBatchEntry>();
  /** What the dashboard's batches ask of merge request creation (`Actions.mrBatch`). */
  readonly mrBatch: MrBatch = {
    confirm: (ids) => this.confirmBatch(ids),
    job: (id) => this.batchJob(id),
    finish: (ids) => this.finishBatch(ids),
    openReview: async (id) => {
      const url = this.batchEntries.get(id)?.review?.url;
      if (url) await this.openUrl(url);
    },
    copyAllLinks: async (ids) => {
      const reviews = ids.flatMap((id) => this.batchEntries.get(id)?.review ?? []);
      if (reviews.length) await this.writeClipboard(allLinks(reviews));
    },
    signIn: async (id) => {
      const host = this.store.get(id)?.hosted?.host;
      return host ? this.providers.auth.signIn(host) : false;
    },
  };
  /** Writes the clipboard (integration tests record it instead). */
  writeClipboard: (text: string) => Promise<unknown> = (text) => Promise.resolve(vscode.env.clipboard.writeText(text));
  /** The clock of the Undo window (integration tests move it). */
  now: () => number = () => Date.now();
  /** Opens a review in the browser (integration tests record it instead). */
  openUrl: (url: string) => Promise<unknown> = async (url) => vscode.env.openExternal(vscode.Uri.parse(url, true));

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: RowStore,
    private readonly registry: Registry,
    private readonly runner: JobRunner,
    private readonly providers: ProviderService,
    private readonly notifier: Notifier,
    private readonly log: RepoHangarLog,
    private readonly gitPath: () => string,
    /** Runs a row action (the Pull and Push fix buttons) */
    private readonly rowAction: (id: string, action: 'pull' | 'push') => Promise<void>,
    private readonly commands: CommandRunner,
  ) {
    const stores: UserStores = {
      userId: (host, name) => context.globalState.get<Record<string, number>>(`repohangar.gitlab.userIds.${host}`, {})[name],
      setUserId: (host, name, id) =>
        void context.globalState.update(`repohangar.gitlab.userIds.${host}`, { ...context.globalState.get(`repohangar.gitlab.userIds.${host}`, {}), [name]: id }),
      singleReviewer: (host) => context.globalState.get<boolean>(`repohangar.gitlab.singleReviewer.${host}`, false),
      setSingleReviewer: (host) => void context.globalState.update(`repohangar.gitlab.singleReviewer.${host}`, true),
    };
    this.repoMemory = new RepoMemoryStore(context.workspaceState);
    this.flow = new CreateFlow({
      row: (id) => this.store.get(id),
      root: (id) => this.registry.repository(id)?.rootUri.fsPath,
      settings: () => settings(),
      credential: (host) => this.providers.auth.credential(host),
      provider: (kind, host, webUrl) => this.providers.factory.get(kind, host, new URL(webUrl).origin),
      projectInfo: (id) => this.projectInfo(id),
      me: (host) => this.providers.me(host),
      memory: (repoKey) => this.repoMemory.get(repoKey),
      stores,
      files: {
        readFile: (path) => nodeFileSystem.readFile(path),
        list: async (path) => {
          try {
            return (await readdir(path, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
          } catch {
            return [];
          }
        },
      },
      git: {
        remoteBranches: (id, remote) => this.remoteBranches(id, remote),
        commitsAhead: async (id, remote, target) => {
          const root = this.registry.repository(id)?.rootUri.fsPath;
          if (!root) return undefined;
          try {
            const out = await runGit(this.gitPath(), ['log', '--format=%s', '--reverse', `refs/remotes/${remote}/${target}..HEAD`], root);
            return out.split(/\r?\n/).filter((l) => l.length > 0);
          } catch {
            return undefined;
          }
        },
        push: async (id, publish) => {
          const repository = this.registry.repository(id) as Repository;
          const row = this.store.get(id);
          if (publish && row?.head.kind === 'branch') await repository.push(row.remote?.name ?? 'origin', row.head.name, true);
          else await repository.push();
        },
        pushWithOptions: async (id, args) => {
          const root = this.registry.repository(id)?.rootUri.fsPath as string;
          const timeout = vscode.workspace.getConfiguration('repohangar').get<number>('fetchTimeoutSeconds', 60) * 1000;
          gitProcessLog.push({ args, cwd: root, at: Date.now() });
          // GitLab prints its `remote:` lines on stderr.
          return new Promise<string>((resolve, reject) => {
            execFile(
              this.gitPath(),
              args,
              { cwd: root, timeout, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
              (error, stdout, stderr) => (error ? reject(Object.assign(error, { stderr })) : resolve(`${stdout}${stderr}`)),
            );
          });
        },
      },
    });
  }
  /** The project's information, kept 1 h per project (mr-profiles: Squash policy). */
  private async projectInfo(id: string): Promise<ProjectInfo | undefined> {
    const row = this.store.get(id);
    if (!row?.hosted || (row.provider !== 'gitlab' && row.provider !== 'github')) return undefined;
    const key = `${row.hosted.host}/${row.hosted.projectPath}`;
    const cached = this.projectInfos.get(key);
    if (cached && Date.now() - cached.at < PROJECT_INFO_MS) return cached.info;
    const credential = await this.providers.auth.credential(row.hosted.host);
    let info: ProjectInfo | undefined;
    if (credential) {
      try {
        info = await this.providers.factory.get(row.provider, row.hosted.host, new URL(row.hosted.webUrl).origin).projectInfo(row.hosted.projectPath, credential);
      } catch {
        info = undefined;
      }
    }
    this.projectInfos.set(key, { info, at: Date.now() });
    return info;
  }

  /** The recent reviewers and labels of a host (mr-profiles: Recent reviewers and labels). */
  recent(host: string): Recent {
    return host ? readRecent(this.context.globalState.get(recentKey(host))) : { ...EMPTY_RECENT };
  }

  /** Records what a successful creation sent (design D-5). */
  private async remember(outcome: FlowOutcome): Promise<void> {
    if (outcome.kind !== 'created' && outcome.kind !== 'pushed') return;
    await this.context.globalState.update(recentKey(outcome.host), recordRecent(this.recent(outcome.host), outcome.sent));
  }

  // -------------------------------------------------------------------------------------------------------------
  // Create with defaults, the quick input and the job

  /** `m`, [Create MR], the hover button, `repohangar.mr.create` and the menus (mr-creation: Create entry points). */
  async createWithDefaults(id: string): Promise<void> {
    const mode = vscode.workspace.getConfiguration('repohangar').get<string>('mr.quickCreate', 'direct');
    if (mode === 'confirm') return this.quickCreate(id);
    await this.runCreate(id, {});
  }

  /** The quick create input (mr-creation: Quick create input). */
  async quickCreate(id: string, profile?: string): Promise<void> {
    const prepared = await this.flow.prepare(id, profile ? { profile } : {});
    if (prepared.kind !== 'prepared') return this.handle(id, prepared, {});
    const others = [...settings().profiles.keys(), 'default'].filter((p, i, all) => p !== prepared.profile && all.indexOf(p) === i);
    const choice = await this.ui.quickCreate({
      title: prepared.title,
      repo: prepared.repo,
      profile: prepared.profile,
      detail: quickDetail(prepared),
      otherProfiles: others.sort(),
    });
    if (!choice) return;
    const base: CreateOptions = profile ? { profile } : {};
    if (choice.kind === 'profile') return this.quickCreate(id, choice.profile);
    if (choice.kind === 'edit') return this.openDrawer(id, { ...(profile ? { profile } : {}), edits: titleEdit(choice.title, prepared) });
    const edits: Partial<ProfileValues> = { ...titleEdit(choice.title, prepared), ...(choice.kind === 'draft' ? { draft: true } : {}) };
    await this.runCreate(id, { ...base, edits });
  }

  /** Runs a creation as the row's job (mr-creation: Create job in the row). */
  async runCreate(id: string, options: CreateOptions): Promise<FlowOutcome | undefined> {
    let outcome: FlowOutcome | undefined;
    const finished = await this.runner.run(id, 'createMr', async (ctx) => {
      outcome = await ctx.network(() => this.flow.create(id, options));
      return outcome.kind === 'stop' && outcome.severity === 'error' ? { state: 'failed', detail: outcome.text } : { state: 'ok' };
    });
    if (!finished || !outcome) return undefined;
    await this.remember(outcome);
    await this.handle(id, outcome, options);
    return outcome;
  }

  /** The notifications and follow-ups of an outcome. */
  private async handle(id: string, outcome: FlowOutcome, options: CreateOptions): Promise<void> {
    switch (outcome.kind) {
      case 'stop':
        return this.stopped(id, outcome, options);
      case 'exists': {
        if (outcome.url) await this.openUrl(outcome.url);
        const choice = await this.notifier.show('information', outcome.text, 'Copy link');
        if (choice === 'Copy link') await vscode.env.clipboard.writeText(outcome.url);
        return;
      }
      case 'created':
        return this.created(id, outcome);
      case 'pushed':
        return this.pushed(id, outcome);
    }
  }

  private async stopped(id: string, stop: Stop, options: CreateOptions): Promise<void> {
    const buttons = stop.button ? [stop.button === 'Connect' ? `Connect ${this.store.get(id)?.hosted?.host ?? ''}` : stop.button] : [];
    if (stop.button === 'Connect') buttons.push('Show Output');
    const choice = await this.notifier.show(stop.severity, stop.text, ...buttons);
    if (!choice) return;
    const repository = this.registry.repository(id);
    const host = this.store.get(id)?.hosted?.host ?? '';
    if (choice === 'Sign In…' || choice.startsWith('Connect ')) {
      // A successful sign-in continues the creation (Sign in continues the creation).
      if (await this.providers.auth.signIn(host)) await this.runCreate(id, options);
    } else if (choice === 'Create Branch…') {
      await this.commands.execute('git.branch', repository);
    } else if (choice === 'Pull') {
      await this.rowAction(id, 'pull');
    } else if (choice === 'Push') {
      await this.rowAction(id, 'push');
    } else if (choice === 'Open Settings') {
      await this.commands.execute('workbench.action.openSettings', 'repohangar.mr');
    } else if (choice === 'Show Git Output' || choice === 'Show Output') {
      await this.commands.execute('git.showOutput');
    }
  }

  private async created(id: string, c: Extract<FlowOutcome, { kind: 'created' }>): Promise<void> {
    this.providers.afterPush(id);
    const plan = resultPlan(c.provider, c.text, c.ref, c.repo, c.openAfterCreate);
    if (plan.openBrowser) await this.openUrl(c.url);
    for (const notice of c.notices) {
      void this.notifier.show('warning', notice.text, ...(notice.button ? [notice.button] : [])).then((choice) => {
        if (choice === 'Open Settings') void this.commands.execute('workbench.action.openSettings', 'repohangar.mr');
      });
    }
    if (c.warning) {
      const warning = c.warning;
      void this.notifier.show('warning', warning.text, warning.button).then((choice) => {
        if (choice === 'Open Source Control') void this.commands.execute('repohangar.showInSourceControl', this.registry.repository(id)?.rootUri);
      });
    }
    if (plan.statusBar) {
      vscode.window.setStatusBarMessage(plan.statusBar, 5000);
      return;
    }
    if (!plan.notification) return;
    const shownAt = this.now();
    const open = c.provider === 'gitlab' ? 'Open MR' : 'Open PR';
    const choice = await this.notifier.show('information', plan.notification.text, ...plan.notification.buttons);
    if (choice === open) await this.openUrl(c.url);
    else if (choice === 'Copy link') await vscode.env.clipboard.writeText(c.url);
    else if (choice === 'Undo') await this.undo(id, c, shownAt);
  }

  /** Undo (mr-creation: Undo): closes the review within 30 s of the result; the branch stays. */
  private async undo(id: string, c: Extract<FlowOutcome, { kind: 'created' }>, shownAt: number): Promise<void> {
    const open = c.provider === 'gitlab' ? 'Open MR' : 'Open PR';
    if (this.now() - shownAt > UNDO_WINDOW_MS) {
      const choice = await this.notifier.show('information', undoExpiredText(c.ref), open);
      if (choice === open) await this.openUrl(c.url);
      return;
    }
    const row = this.store.get(id);
    const credential = await this.providers.auth.credential(c.host);
    if (!row?.hosted || !credential || (row.provider !== 'gitlab' && row.provider !== 'github')) return;
    try {
      await this.providers.factory.get(row.provider, c.host, new URL(row.hosted.webUrl).origin).closeReview(c.projectPath, c.number, credential);
    } catch (error) {
      void this.notifier.show('error', `Closing ${c.ref} failed: ${(error as Error).message}`);
      return;
    }
    this.providers.afterPush(id);
    void this.notifier.show('information', closedText(c.ref, c.branch));
  }

  /** The push-options result (mr-creation: Push options) and Connect (Reviewers after connecting). */
  private async pushed(id: string, p: Extract<FlowOutcome, { kind: 'pushed' }>): Promise<void> {
    this.providers.storePushed(id, p.branch, p.number, p.url);
    if (p.warning) void this.notifier.show('warning', p.warning.text, p.warning.button);
    const connect = `Connect ${p.host}`;
    const choice = await this.notifier.show('information', p.text, 'Open MR', 'Copy link', connect);
    if (choice === 'Open MR') await this.openUrl(p.url);
    else if (choice === 'Copy link') await vscode.env.clipboard.writeText(p.url);
    else if (choice === connect) await this.connect(id, p);
  }

  /** After a sign-in, one `PUT …/merge_requests/<iid>` adds the reviewers and the other assignees. */
  async connect(id: string, p: Pick<Extract<FlowOutcome, { kind: 'pushed' }>, 'host' | 'projectPath' | 'number' | 'reviewers' | 'assignees'>): Promise<void> {
    if (!(await this.providers.auth.signIn(p.host))) return;
    const row = this.store.get(id);
    const credential = await this.providers.auth.credential(p.host);
    if (!row?.hosted || !credential) return;
    const provider = this.providers.factory.get('gitlab', p.host, new URL(row.hosted.webUrl).origin);
    if (!(provider instanceof GitLabProvider) || (p.reviewers.length === 0 && p.assignees.length === 0)) return;
    const stores = (this.flow as unknown as { port: { stores: UserStores } }).port.stores;
    const me = await this.providers.me(p.host);
    const reviewers = p.reviewers.filter((r) => r !== me && !r.startsWith('team:'));
    const result = await provider.updateReviewers(p.projectPath, p.number, reviewers, p.assignees, credential, stores);
    for (const notice of result.notices) void this.notifier.show('warning', notice.text, ...(notice.button ? [notice.button] : []));
    this.providers.afterPush(id);
  }

  // -------------------------------------------------------------------------------------------------------------
  // Merge requests for a selection (mr-creation: Create merge requests on a selection, Related links)

  /** With `repohangar.mr.quickCreate` `"confirm"`, one quick pick for the whole selection; no request is sent before it. */
  private async confirmBatch(ids: readonly string[]): Promise<boolean> {
    const mode = vscode.workspace.getConfiguration('repohangar').get<string>('mr.quickCreate', 'direct');
    if (mode !== 'confirm') return true;
    const items = await Promise.all(
      ids.map(async (id) => {
        const row = this.store.get(id);
        const branch = row?.head.kind === 'branch' ? row.head.name : 'detached';
        return { repo: row?.name ?? id, target: (await this.flow.previewTarget(id)) ?? row?.defaultBranch ?? 'main', branch };
      }),
    );
    return this.batchUi.confirmBatch({
      title: `Create merge requests in ${plural(ids.length, 'repository', 'repositories')}`,
      label: `Create ${ids.length}`,
      detail: confirmDetail(items),
    });
  }

  /** One repository of a selection: the single-repository flow with the batch flag, as its job (design D-1). */
  private batchJob(id: string): Job {
    return async (ctx) => {
      this.batchEntries.delete(id);
      const outcome = await ctx.network(() => this.flow.create(id, { batch: true }));
      await this.remember(outcome);
      if (outcome.kind === 'created') this.providers.afterPush(id);
      if (outcome.kind === 'pushed') this.providers.storePushed(id, outcome.branch, outcome.number, outcome.url);
      const row = this.store.get(id);
      const entry = batchEntry(outcome, {
        name: row?.name ?? id,
        provider: (row?.provider === 'github' ? 'github' : 'gitlab') as HostedProvider,
        host: row?.hosted?.host ?? '',
        projectPath: row?.hosted?.projectPath ?? '',
      });
      this.batchEntries.set(id, entry);
      return entry.result;
    };
  }

  /**
   * The related links of the batch (design D-3): one description update per review that has a credential, when the
   * batch has at least two, in parallel; then what each line and the panel show.
   */
  private async finishBatch(ids: readonly string[]): Promise<PanelView> {
    const entries = new Map(ids.flatMap((id) => {
      const entry = this.batchEntries.get(id);
      return entry ? [[id, entry] as const] : [];
    }));
    const { links, total } = await writeRelatedLinks(entries, {
      credential: (host) => this.providers.auth.credential(host),
      writer: (id, review) => {
        const webUrl = this.store.get(id)?.hosted?.webUrl;
        return webUrl ? this.providers.factory.get(review.provider, review.host, new URL(webUrl).origin) : undefined;
      },
      concurrency: concurrency(),
    });
    for (const [id, link] of links) {
      if (link.kind === 'failed') this.log.info(`The related links of ${this.store.get(id)?.name ?? id} were not added: ${link.reason}`);
    }
    const lines = new Map(
      ids.map((id) => {
        const entry = this.batchEntries.get(id);
        const detail = entry && entryDetail(entry, links.get(id) ?? { kind: 'none' });
        return [id, { ...(detail === undefined ? {} : { detail }), review: entry?.review !== undefined }] as const;
      }),
    );
    const added = [...links.values()].filter((l) => l.kind === 'added').length;
    const note = relatedNote(added, total);
    const branches = ids.map((id) => {
      const head = this.store.get(id)?.head;
      return head?.kind === 'branch' ? head.name : undefined;
    });
    return {
      title: mrPanelTitle(branches),
      ...(note === undefined ? {} : { note }),
      links: ids.some((id) => this.batchEntries.get(id)?.review !== undefined),
      lines,
    };
  }


  // -------------------------------------------------------------------------------------------------------------
  // The drawer (mr-creation: Create MR drawer)

  async openDrawer(id: string, options: { profile?: string; edits?: DrawerEdits } = {}): Promise<void> {
    const prepared = await this.flow.prepare(id, { ...(options.profile ? { profile: options.profile } : {}), ...(options.edits ? { edits: options.edits } : {}) });
    if (prepared.kind !== 'prepared') {
      this.drawer = undefined;
      return this.handle(id, prepared, {});
    }
    this.drawer = { id, profile: prepared.profile, edits: options.edits ?? {} };
    this.dashboard?.open();
    this.dashboard?.postDrawer(drawerData(prepared, this.store.get(id), options.edits ?? {}, '', await this.remoteBranches(id, prepared.remote), this.recent(prepared.host)));
  }

  async drawerChange(id: string, profile: string, edits: DrawerEdits): Promise<void> {
    if (this.drawer?.id !== id) return;
    const prepared = await this.flow.prepare(id, { profile, edits });
    if (prepared.kind !== 'prepared') return;
    this.drawer = { id, profile, edits };
    this.dashboard?.postDrawer(drawerData(prepared, this.store.get(id), edits, '', await this.remoteBranches(id, prepared.remote), this.recent(prepared.host)));
  }

  async drawerCreate(id: string, profile: string, edits: DrawerEdits): Promise<void> {
    if (this.drawer?.id !== id) return;
    const prepared = await this.flow.prepare(id, { profile, edits });
    if (prepared.kind === 'stop') {
      // R5: the drawer stays open with the guard's text at the top.
      const shown = await this.flow.prepare(id, { profile });
      if (shown.kind === 'prepared') {
        this.dashboard?.postDrawer(drawerData(shown, this.store.get(id), edits, prepared.text, await this.remoteBranches(id, shown.remote), this.recent(shown.host)));
      }
      return;
    }
    this.drawer = undefined;
    this.dashboard?.postDrawer(null);
    if (prepared.kind === 'exists') return this.handle(id, prepared, {});
    await this.runCreate(id, { profile, edits });
  }

  /**
   * Save as defaults ▾ (mr-profiles: Save as defaults; design D-3): the drawer's saved keys that differ from the
   * profile, into the profile at user or workspace scope, or into the per-repository memory; then the notification.
   */
  async drawerSaveDefaults(id: string, profile: string, edits: DrawerEdits, target: SaveTarget): Promise<void> {
    if (this.drawer?.id !== id || (target === 'workspace' && !hasWorkspace())) return;
    const prepared = await this.flow.prepare(id, { profile, edits });
    if (prepared.kind !== 'prepared') return;
    const base = resolveProfile(settings().profiles, profile);
    if (!base.ok) return;
    const config = vscode.workspace.getConfiguration('repohangar');
    const stored = config.inspect<RawProfiles>('mr.profiles');
    const values = Object.fromEntries(SAVED_KEYS.map((k) => [k, prepared.values[k]])) as unknown as SavedValues;
    const plan = planSaveDefaults({
      target,
      profile,
      repo: prepared.repo,
      repoKey: `${prepared.host}/${prepared.projectPath}`,
      values,
      effective: base.values,
      squashForced: prepared.squashForced,
      ...(target === 'user' ? { scopeProfiles: stored?.globalValue ?? stored?.defaultValue ?? {} } : {}),
      ...(target === 'workspace' ? { scopeProfiles: stored?.workspaceValue ?? {} } : {}),
      memory: this.repoMemory.all(),
    });
    if (plan.kind === 'settings') {
      await config.update('mr.profiles', plan.value, plan.scope === 'user' ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace);
    } else if (plan.kind === 'memory') {
      await this.repoMemory.replace(plan.value);
    }
    void this.notifier.show('information', plan.text);
  }

  /** The branches of a remote from local refs (`git for-each-ref`, no network), sorted; the drawer's targets. */
  private async remoteBranches(id: string, remote: string): Promise<string[]> {
    const repository = this.registry.repository(id);
    if (!repository) return [];
    try {
      const refs = await repository.getRefs({ pattern: `refs/remotes/${remote}/` });
      return refs
        .flatMap((r) => ((r.type as number) === REMOTE_HEAD && r.name?.startsWith(`${remote}/`) && !r.name.endsWith('/HEAD') ? [r.name.slice(remote.length + 1)] : []))
        .sort();
    } catch {
      return [];
    }
  }

  drawerClose(): void {
    this.drawer = undefined;
  }

  drawerSearchUsers(id: string, text: string): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.searchUsers(id, text), 300);
  }

  private async searchUsers(id: string, text: string): Promise<void> {
    const row = this.store.get(id);
    if (!row?.hosted || (row.provider !== 'gitlab' && row.provider !== 'github') || !text) return;
    const credential = await this.providers.auth.credential(row.hosted.host);
    if (!credential) return;
    try {
      const users = await this.providers.factory.get(row.provider, row.hosted.host, new URL(row.hosted.webUrl).origin).searchUsers(row.hosted.projectPath, text, credential);
      this.dashboard?.postDrawerUsers(id, users.slice(0, 10));
    } catch (error) {
      this.log.debug(`User search on ${row.hosted.host} failed: ${(error as Error).message}`);
    }
  }

  dispose(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }
}

/** `repohangar.mr.*` and `repohangar.gitlab.usePushOptions`, user and workspace scopes read separately (design D-2). */
export function settings(): MrSettings {
  const config = vscode.workspace.getConfiguration('repohangar');
  const profiles = config.inspect<RawProfiles>('mr.profiles');
  const workspace = { ...(profiles?.workspaceValue ?? {}), ...(profiles?.workspaceFolderValue ?? {}) };
  const usePushOptions = config.get<string>('gitlab.usePushOptions', 'whenNoToken');
  return {
    profiles: mergeScopes(profiles?.globalValue ?? profiles?.defaultValue, workspace),
    rules: readRules(config.get('mr.rules', [])),
    usePushOptions: (['whenNoToken', 'always', 'never'].includes(usePushOptions) ? usePushOptions : 'whenNoToken') as UsePushOptions,
    ticketPattern: config.get<string>('mr.ticketPattern', DEFAULT_TICKET_PATTERN),
    typeMap: config.get<Record<string, string>>('mr.typeMap', { ...DEFAULT_TYPE_MAP }),
  };
}

/** `main ← feature/ABC-12-notes · reviewers ana.perez, carla.ruiz · squash · delete` */
export function quickDetail(p: Prepared): string {
  const parts = [`${p.target} ← ${p.branch}`];
  if (p.values.reviewers.length) parts.push(`reviewers ${p.values.reviewers.join(', ')}`);
  if (p.values.squash) parts.push('squash');
  if (p.values.deleteSourceBranch) parts.push('delete');
  if (p.values.draft) parts.push('draft');
  return parts.join(' · ');
}

/** The typed title as an edit only when it differs from the rendered one. */
function titleEdit(title: string, p: Prepared): Partial<ProfileValues> {
  return title && title !== p.title ? { title } : {};
}

/** The drawer's content from a prepared creation. */
export function drawerData(
  p: Prepared,
  row: RowData | undefined,
  edits: DrawerEdits,
  error: string,
  targets: string[] = [],
  recent: Recent = EMPTY_RECENT,
): DrawerData {
  const ahead = row?.head.kind === 'branch' && row.head.upstream ? (row.head.ahead ?? 0) : p.commitsAhead;
  const profiles = [...new Set(['default', ...settings().profiles.keys()])].sort();
  return {
    id: p.id,
    heading: `Create ${p.provider === 'gitlab' ? 'merge request' : 'pull request'} — ${p.repo}`,
    provider: p.provider,
    profiles,
    profile: p.profile,
    ruleNote: p.rule ? `(rule ${p.rule.index}: ${p.rule.glob})` : '',
    source: `${p.branch}  ↑${ahead}${p.willPush ? ' · will push first' : ''}`,
    targets: [...new Set([p.target, ...(row?.defaultBranch ? [row.defaultBranch] : []), ...targets])],
    target: edits.target ?? p.target,
    aheadNote: `${plural(p.commitsAhead, 'commit', 'commits')} ahead of ${p.target}`,
    title: edits.title ?? p.title,
    description: edits.description ?? p.description,
    reviewers: p.values.reviewers,
    assignees: p.values.assignees,
    labels: p.values.labels,
    squash: p.values.squash,
    deleteSourceBranch: p.values.deleteSourceBranch,
    draft: p.values.draft,
    notes: p.notes,
    warnings: p.warning ? [p.warning.text] : [],
    error,
    hasWorkspace: hasWorkspace(),
    recent: { reviewers: [...recent.reviewers], labels: [...recent.labels] },
  };
}


/** `repohangar.concurrency` (default 6), the job pool's limit, for the description updates of a batch. */
function concurrency(): number {
  const value = vscode.workspace.getConfiguration('repohangar').get<number>('concurrency', 6);
  return Number.isFinite(value) ? Math.min(32, Math.max(1, Math.floor(value))) : 6;
}
