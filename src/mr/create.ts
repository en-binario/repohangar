// The create flow (mr-creation; design D-1, D-5, D-6): the existing-review check, profile resolution, the guards, the
// push, the create request or push options, and the result. No vscode import: the extension supplies a port, and the
// drawer and the quick input call `prepare` to show the values before `create` sends them.

import { pushHookFailure } from '../git/errors';
import { isDirty } from '../shared/format';
import type { RowData } from '../shared/model';
import { reference, reviewNoun } from '../shared/review';
import type { Credential } from '../providers/http';
import type { CreateNotice, HostedProvider, HostingProvider, ProjectInfo, UserStores } from '../providers/provider';
import { postGuards, preGuards, pushPlan, type GuardButton, type UsePushOptions } from './guards';
import { applySquashPolicy, resolveValues, type ExplicitProfile, type ProfileValues } from './profiles';
import { pushArguments, reportedMergeRequest } from './pushOptions';
import type { Recent } from './recent';
import { EMPTY_RELATED } from './related';
import { createdText, existingText, pushedText, type Applied } from './result';
import { chooseRule, missingProfileText, type Rule } from './rules';
import { renderDescription, renderTarget, renderTitle, type TemplateContext, type TemplateFiles } from './templates';
import { prepareUsers } from './users';

export interface MrSettings {
  profiles: Map<string, ExplicitProfile>;
  rules: (Rule | undefined)[];
  usePushOptions: UsePushOptions;
  ticketPattern?: string;
  typeMap?: Record<string, string>;
}

export interface CreateFlowPort {
  row(id: string): RowData | undefined;
  /** The repository root, for the repository's own description templates */
  root(id: string): string | undefined;
  settings(): MrSettings;
  credential(host: string): Promise<Credential | undefined>;
  provider(kind: HostedProvider, host: string, webUrl: string): HostingProvider;
  /** The GitLab or GitHub project's information, kept 1 h; undefined when it cannot be read */
  projectInfo(id: string): Promise<ProjectInfo | undefined>;
  /** The current user on the host (for `@me` and `{me}`); empty when unknown */
  me(host: string): Promise<string>;
  /** The per-repository memory of `<host>/<project path>` (mr-profiles: Per-repository memory) */
  memory?(repoKey: string): Partial<ProfileValues> | undefined;
  stores: UserStores;
  files: TemplateFiles;
  git: {
    /** Branch names of the remote from local refs (`release/2.10`) */
    remoteBranches(id: string, remote: string): Promise<string[]>;
    /** Subjects of the commits of HEAD that `refs/remotes/<remote>/<target>` lacks, oldest first; undefined without that ref */
    commitsAhead(id: string, remote: string, target: string): Promise<string[] | undefined>;
    /** Publishes (`setUpstream`) or pushes through the Git extension; rejects with Git's message */
    push(id: string, publish: boolean): Promise<void>;
    /** `git push` with push options; resolves to its output, rejects with Git's message */
    pushWithOptions(id: string, args: string[]): Promise<string>;
  };
}

export interface CreateOptions {
  /** Values edited in the drawer or the quick input */
  edits?: Partial<ProfileValues>;
  /** A profile chosen in the drawer or the quick input instead of the rules' */
  profile?: string;
  /**
   * Part of a selection batch (add-multi-repo-mrs design D-1): `{related}` keeps the related-links section's place, and
   * an existing review comes with its description, which the related links are merged into.
   */
  batch?: boolean;
}

/** A stop: a guard, a profile error or a failure, with its fix button. */
export interface Stop {
  kind: 'stop';
  text: string;
  button?: GuardButton | 'Open Settings' | 'Push' | 'Show Git Output' | 'Connect';
  severity: 'warning' | 'error';
}

export interface Prepared {
  kind: 'prepared';
  id: string;
  repo: string;
  host: string;
  provider: HostedProvider;
  projectPath: string;
  branch: string;
  remote: string;
  path: 'api' | 'pushOptions';
  profile: string;
  rule?: { index: number; glob: string };
  values: ProfileValues;
  /** The rendered title, description and target */
  title: string;
  description: string;
  target: string;
  commitsAhead: number;
  /** Notes for the drawer: the squash policy, a missing named template */
  notes: string[];
  /** The squash policy forced `values.squash` (Save as defaults leaves it out) */
  squashForced: boolean;
  /** The uncommitted-files warning, shown after the result */
  warning?: { text: string; button: GuardButton };
  /** Whether a push runs first */
  willPush: boolean;
}

export interface Existing {
  kind: 'exists';
  ref: string;
  url: string;
  text: string;
  /** The review's current description, read by the review check of a batch */
  description?: string;
}

export interface Created {
  kind: 'created';
  provider: HostedProvider;
  host: string;
  projectPath: string;
  branch: string;
  repo: string;
  ref: string;
  number: number;
  url: string;
  pushed: number;
  text: string;
  /** The description sent with the create request */
  description: string;
  notices: CreateNotice[];
  openAfterCreate: ProfileValues['openAfterCreate'];
  /** The reviewers (without `@me`) and labels the create request sent, for the recent values */
  sent: Recent;
  warning?: { text: string; button: GuardButton };
}

export interface Pushed {
  kind: 'pushed';
  host: string;
  projectPath: string;
  branch: string;
  repo: string;
  ref: string;
  number: number;
  url: string;
  text: string;
  /** Commits the push sent */
  pushed: number;
  reviewers: string[];
  /** Assignees after the first, which push options could not set */
  assignees: string[];
  /** What the push options sent: labels, no reviewers */
  sent: Recent;
  warning?: { text: string; button: GuardButton };
}

export type FlowOutcome = Stop | Existing | Created | Pushed;

function stop(text: string, button?: Stop['button'], severity: Stop['severity'] = 'warning'): Stop {
  return { kind: 'stop', text, ...(button ? { button } : {}), severity };
}

export class CreateFlow {
  constructor(private readonly port: CreateFlowPort) {}

  /** Everything up to the push: checks, values and guards; also what the drawer and the quick input show. */
  async prepare(id: string, options: CreateOptions = {}): Promise<Prepared | Existing | Stop> {
    const row = this.port.row(id);
    if (!row) return stop('The repository is no longer listed.');
    const settings = this.port.settings();
    const host = row.hosted?.host ?? '';
    const credential = row.hosted && (row.provider === 'gitlab' || row.provider === 'github') ? await this.port.credential(host) : undefined;
    const pre = preGuards({
      repo: row.name,
      operation: row.operation,
      head: row.head,
      provider: row.provider,
      host,
      credential: !!credential,
      usePushOptions: settings.usePushOptions,
    });
    if (pre.kind === 'stop') return stop(pre.text, pre.button);
    if (row.head.kind !== 'branch' || !row.hosted || (row.provider !== 'gitlab' && row.provider !== 'github')) {
      return stop(`${row.name} is not on a known GitLab or GitHub host.`);
    }
    const kind = row.provider;
    const branch = row.head.name;
    const provider = this.port.provider(kind, host, row.hosted.webUrl);

    // Existing review opens instead (API path only: push options need no token).
    if (pre.path === 'api' && credential) {
      const existing = await this.existing(provider, credential, row.hosted.projectPath, branch, row.name, options.batch);
      if (existing) return existing;
    }

    const repoKey = `${host}/${row.hosted.projectPath}`;
    const chosen = options.profile ? { profile: options.profile, set: {} } : chooseRule(settings.rules, repoKey, branch);
    const memory = this.port.memory?.(repoKey);
    const resolved = resolveValues({
      profiles: settings.profiles,
      profile: chosen.profile,
      set: chosen.set,
      ...(memory ? { memory } : {}),
      ...(options.edits ? { edits: options.edits } : {}),
    });
    if (!resolved.ok) {
      const ruleIndex = 'index' in chosen ? chosen.index : undefined;
      const missingRuleProfile = ruleIndex !== undefined && !settings.profiles.has(chosen.profile) && chosen.profile !== 'default';
      return stop(missingRuleProfile ? missingProfileText(ruleIndex, chosen.profile) : resolved.error, 'Open Settings');
    }
    const values = resolved.values;
    const info = credential ? await this.port.projectInfo(id) : undefined;
    const notes: string[] = [];
    const squash = applySquashPolicy(values.squash, kind === 'gitlab' ? info?.squashOption : undefined, row.hosted.projectPath);
    values.squash = squash.squash;
    if (squash.note) notes.push(squash.note);

    const remote = row.remote?.name ?? 'origin';
    const me = credential ? await this.port.me(host) : '';
    const ctx: TemplateContext = {
      branch,
      repo: row.name,
      defaultBranch: row.defaultBranch ?? info?.defaultBranch ?? 'main',
      commits: [],
      remoteBranches: await this.port.git.remoteBranches(id, remote),
      me,
      ...(settings.ticketPattern ? { ticketPattern: settings.ticketPattern } : {}),
      ...(settings.typeMap ? { typeMap: settings.typeMap } : {}),
      related: options.batch ? EMPTY_RELATED : '',
    };
    const target = renderTarget(values.target, ctx, remote, chosen.profile);
    if (!target.ok) return stop(target.error);
    const commits = await this.port.git.commitsAhead(id, remote, target.target);
    // Without the target's remote-tracking ref the count is unknown; the provider validates the request.
    ctx.commits = commits ?? [];
    const post = postGuards(
      {
        repo: row.name,
        operation: row.operation,
        head: row.head,
        provider: row.provider,
        host,
        credential: !!credential,
        usePushOptions: settings.usePushOptions,
        target: target.target,
        aheadOfTarget: commits === undefined ? 1 : commits.length,
        dirtyFiles: dirtyFiles(row),
      },
      pre.path,
    );
    if (post.kind === 'stop') return stop(post.text, post.button);
    const title = renderTitle(values.title, ctx, resolved.explicit.has('title'));
    const root = this.port.root(id) ?? row.path;
    const description = await renderDescription(values.description, ctx, kind, root, this.port.files);
    if (description.note) notes.push(description.note);
    const plan = pushPlan(row.head, ctx.commits.length, values.pushIfNeeded, remote);
    return {
      kind: 'prepared',
      id,
      repo: row.name,
      host,
      provider: kind,
      projectPath: row.hosted.projectPath,
      branch,
      remote,
      path: pre.path,
      profile: chosen.profile,
      ...('index' in chosen && chosen.index !== undefined && chosen.glob ? { rule: { index: chosen.index, glob: chosen.glob } } : {}),
      values,
      title,
      description: description.text,
      target: target.target,
      commitsAhead: ctx.commits.length,
      notes,
      squashForced: squash.note !== undefined,
      ...(post.warning ? { warning: post.warning } : {}),
      willPush: plan.kind === 'publish' || plan.kind === 'push',
    };
  }

  /** The review check before creating: an open review of the branch, or undefined; in a batch with its description. */
  private async existing(
    provider: HostingProvider,
    credential: Credential,
    projectPath: string,
    branch: string,
    repo: string,
    description = false,
  ): Promise<Existing | undefined> {
    const answer = await provider.reviewStates([{ key: 'self', projectPath, branch }], credential, description ? { description } : {}).catch(() => undefined);
    const result = answer?.results.get('self');
    if (result?.kind !== 'review') return undefined;
    const ref = reference(result.review);
    return {
      kind: 'exists',
      ref,
      url: result.review.url,
      text: existingText(ref, branch, repo),
      ...(result.review.description === undefined ? {} : { description: result.review.description }),
    };
  }

  /**
   * The target a creation would use, from the settings and local refs only (no request): the detail of the
   * confirmation before a selection.
   */
  async previewTarget(id: string): Promise<string | undefined> {
    const row = this.port.row(id);
    if (!row?.hosted || row.head.kind !== 'branch') return undefined;
    const settings = this.port.settings();
    const chosen = chooseRule(settings.rules, `${row.hosted.host}/${row.hosted.projectPath}`, row.head.name);
    const resolved = resolveValues({ profiles: settings.profiles, profile: chosen.profile, set: chosen.set });
    if (!resolved.ok) return undefined;
    const remote = row.remote?.name ?? 'origin';
    const ctx: TemplateContext = {
      branch: row.head.name,
      repo: row.name,
      defaultBranch: row.defaultBranch ?? 'main',
      commits: [],
      remoteBranches: await this.port.git.remoteBranches(id, remote),
      me: '',
      ...(settings.ticketPattern ? { ticketPattern: settings.ticketPattern } : {}),
      ...(settings.typeMap ? { typeMap: settings.typeMap } : {}),
    };
    const target = renderTarget(resolved.values.target, ctx, remote, chosen.profile);
    return target.ok ? target.target : undefined;
  }

  /** Prepares, pushes when needed and creates (create with defaults, the quick input, the drawer's Create). */
  async create(id: string, options: CreateOptions = {}): Promise<FlowOutcome> {
    const prepared = await this.prepare(id, options);
    if (prepared.kind !== 'prepared') return prepared;
    return this.send(prepared, options.batch);
  }

  /** Pushes and creates a prepared merge request, with the values as prepared (the drawer's edits included). */
  async send(p: Prepared, batch = false): Promise<FlowOutcome> {
    const row = this.port.row(p.id);
    if (!row || row.head.kind !== 'branch' || !row.hosted) return stop('The repository is no longer listed.');
    if (p.path === 'pushOptions') return this.sendWithPushOptions(p, row);
    const plan = pushPlan(row.head, p.commitsAhead, p.values.pushIfNeeded, p.remote);
    if (plan.kind === 'stop') return stop(plan.text, plan.button);
    let pushed = 0;
    if (plan.kind === 'publish' || plan.kind === 'push') {
      try {
        await this.port.git.push(p.id, plan.kind === 'publish');
      } catch (error) {
        return stop(`Push failed in ${p.repo}: ${messageOf(error)}`, 'Show Git Output', 'error');
      }
      pushed = plan.commits;
    }
    const credential = await this.port.credential(p.host);
    if (!credential) return stop(`Sign in to ${p.host} to create ${reviewNoun(p.provider)}s.`, 'Sign In…');
    const provider = this.port.provider(p.provider, p.host, row.hosted.webUrl);
    const me = await this.port.me(p.host);
    const users = prepareUsers(p.provider, p.host, p.values.reviewers, p.values.assignees, me);
    const outcome = await provider.createReview(
      {
        projectPath: p.projectPath,
        source: p.branch,
        target: p.target,
        title: p.title,
        description: p.description,
        draft: p.values.draft,
        squash: p.values.squash,
        deleteSourceBranch: p.values.deleteSourceBranch,
        reviewers: users.reviewers,
        teams: users.teams,
        assignees: users.assignees,
        labels: p.values.labels,
      },
      credential,
      this.port.stores,
    );
    if (outcome.kind === 'exists') {
      // A batch needs the review's description for its related links.
      const known = outcome.url && outcome.number !== undefined && !batch;
      const found = known ? undefined : await this.existing(provider, credential, p.projectPath, p.branch, p.repo, batch);
      if (found) return found;
      const ref = p.provider === 'gitlab' ? `!${outcome.number}` : `#${outcome.number}`;
      return { kind: 'exists', ref, url: outcome.url ?? '', text: existingText(ref, p.branch, p.repo) };
    }
    if (outcome.kind === 'failed') return failure(p, outcome.status, outcome.message);
    const ref = p.provider === 'gitlab' ? `!${outcome.number}` : `#${outcome.number}`;
    const applied: Applied = {
      reviewers: outcome.applied.reviewers,
      labels: outcome.applied.labels,
      // GitHub keeps squash and delete for auto-merge and delete-after-merge (add-auto-merge).
      squash: p.provider === 'gitlab' && p.values.squash,
      deleteBranch: p.provider === 'gitlab' && p.values.deleteSourceBranch,
      draft: p.values.draft,
    };
    return {
      kind: 'created',
      provider: p.provider,
      host: p.host,
      projectPath: p.projectPath,
      branch: p.branch,
      repo: p.repo,
      ref,
      number: outcome.number,
      url: outcome.url,
      pushed,
      text: createdText(ref, p.repo, pushed, applied),
      description: p.description,
      notices: [...users.notices, ...outcome.notices],
      openAfterCreate: p.values.openAfterCreate,
      sent: { reviewers: p.values.reviewers.filter((r) => r !== '@me'), labels: p.values.labels },
      ...(p.warning ? { warning: p.warning } : {}),
    };
  }

  private async sendWithPushOptions(p: Prepared, row: RowData): Promise<FlowOutcome> {
    const { args, descriptionLeftOut } = pushArguments(p.remote, p.branch, {
      target: p.target,
      title: p.title,
      description: p.description,
      draft: p.values.draft,
      labels: p.values.labels,
      assignees: p.values.assignees,
      squash: p.values.squash,
      deleteSourceBranch: p.values.deleteSourceBranch,
    });
    let output: string;
    try {
      output = await this.port.git.pushWithOptions(p.id, args);
    } catch (error) {
      return stop(`Push failed in ${p.repo}: ${messageOf(error)}`, 'Connect', 'error');
    }
    const reported = reportedMergeRequest(output);
    if (!reported) return stop(`Pushed ${p.branch}, but ${p.host} reported no merge request. Sign in to ${p.host} to create it.`, 'Sign In…');
    const pushed = row.head.kind === 'branch' && row.head.upstream ? (row.head.ahead ?? 0) : p.commitsAhead;
    const ref = `!${reported.iid}`;
    const reviewers = p.values.reviewers.filter((r) => r !== '@me');
    const assignees = p.values.assignees.filter((a) => a !== '@me').slice(1);
    return {
      kind: 'pushed',
      host: p.host,
      projectPath: p.projectPath,
      branch: p.branch,
      repo: p.repo,
      ref,
      number: reported.iid,
      url: reported.url,
      text: pushedText(pushed, ref, p.branch, p.repo, reviewers, descriptionLeftOut),
      pushed,
      reviewers,
      assignees,
      sent: { reviewers: [], labels: p.values.labels },
      ...(p.warning ? { warning: p.warning } : {}),
    };
  }
}

/** The notification of a create request the provider rejects (Create failure matrix). */
export function failure(p: Pick<Prepared, 'provider' | 'host' | 'repo'>, status: number | undefined, message: string): Stop {
  const noun = reviewNoun(p.provider);
  if (status === 403) {
    const scope = p.provider === 'gitlab' ? 'api' : 'repo';
    return stop(`${p.host} did not allow creating the ${noun} (403). The token needs the ${scope} scope.`, 'Sign In…', 'error');
  }
  return stop(`Creating the ${noun} failed in ${p.repo}: ${message}`, p.provider === 'gitlab' && status === 422 ? 'Open Settings' : undefined, 'error');
}

function dirtyFiles(row: RowData): number {
  if (!isDirty(row)) return 0;
  const c = row.counts;
  return c.conflicts + c.unstaged + c.staged + c.untracked;
}

function messageOf(error: unknown): string {
  const stderr = (error as { stderr?: unknown } | undefined)?.stderr;
  if (typeof stderr === 'string' && stderr.trim()) {
    const hook = pushHookFailure(stderr);
    if (hook) return hook;
    const lines = stderr.trim().split(/\r?\n/).filter((l) => !/^(remote:|To |hint:)/.test(l));
    if (lines.length) return lines[0] as string;
  }
  return error instanceof Error ? error.message : String(error);
}
