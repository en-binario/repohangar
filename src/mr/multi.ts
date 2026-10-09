// Merge requests for a selection (mr-creation: Create merge requests on a selection, Related links, Merge request
// result panel; add-multi-repo-mrs design D-1, D-3): a flow outcome as the repository's job result and result panel
// line, and the reviews the related links connect. No vscode import.

import { gitErrorMessage } from '../git/errors';
import { plural } from '../shared/format';
import { HttpError, type Credential } from '../providers/http';
import type { HostedProvider, ReviewWriter } from '../providers/provider';
import type { JobResult } from '../shared/model';
import type { FlowOutcome, Stop } from './create';
import { mergeRelated, relatedSection, relatedUpdates, type RelatedReview } from './related';

/** A review a batch created or found. */
export interface BatchReview extends RelatedReview {
  provider: HostedProvider;
  host: string;
  projectPath: string;
  number: number;
  /** The description the related links are merged into; undefined when it is not known */
  description?: string;
  /** Created or found through the host's API with a credential, so its description can be updated */
  linkable: boolean;
  existed: boolean;
}

/** What the related-links step did for a review. */
export type LinkState = { kind: 'added' } | { kind: 'failed'; reason: string } | { kind: 'none' };

export interface MrBatchEntry {
  result: JobResult;
  review?: BatchReview;
  /** `pushed 2`, `3 uncommitted files not included`, `no related links: not signed in` */
  notes: string[];
}

/** The first sentence, without its period, starting lower-case. */
function reason(text: string): string {
  const sentence = (/^(.*?)\.(\s|$)/.exec(text)?.[1] ?? text).trim();
  return sentence.charAt(0).toLowerCase() + sentence.slice(1);
}

/** A stop of the single-repository flow as a job result: its notification in the words of a skip reason (D-1). */
export function stopResult(stop: Pick<Stop, 'text' | 'severity'>): JobResult {
  const text = stop.text;
  const failed = (detail: string): JobResult => ({ state: 'failed', detail });
  const skipped = (detail: string): JobResult => ({ state: 'skipped', detail });
  let m: RegExpExecArray | null;
  if ((m = /^Push failed in .+?: (.*)$/s.exec(text))) return failed(`push failed: ${gitErrorMessage(m[1])}`);
  if ((m = /^Creating the (?:merge|pull) request failed in .+?: (.*)$/s.exec(text))) return failed(`create failed: ${m[1]}`);
  if ((m = /^(\S+) did not allow creating the (?:merge|pull) request \((\d+)\)/.exec(text))) return failed(`${m[1]} did not allow creating it (${m[2]})`);
  if ((m = /^Finish the (.+) in .+ first\.$/.exec(text))) return skipped(`${m[1]} in progress`);
  if (/ is not on a branch\.$/.test(text)) return skipped('detached HEAD');
  if ((m = /^You're on (.+?)\. /.exec(text))) return skipped(`on ${m[1]}`);
  if ((m = /^Nothing to merge into (.+) from .+\.$/.exec(text))) return skipped(`nothing to merge into ${m[1]}`);
  if ((m = /^The remote branch of .+ has (\d+) commits? you don't have\.$/.exec(text))) return skipped(`behind (↓${m[1]})`);
  if ((m = /^Sign in to (\S+) to create /.exec(text))) return skipped(`not signed in to ${m[1]}`);
  if ((m = / is already pushed, so GitLab cannot create the merge request during a push\. Sign in to (\S+) /.exec(text))) {
    return skipped(`already pushed, not signed in to ${m[1]}`);
  }
  if ((m = /^Pushed .+, but (\S+) reported no merge request\./.exec(text))) return skipped(`no merge request reported, not signed in to ${m[1]}`);
  if ((m = /^(\S+) is not pushed to (\S+)\./.exec(text))) return skipped(`not pushed to ${m[2]}`);
  return stop.severity === 'error' ? failed(reason(text)) : skipped(reason(text));
}

/** `3 uncommitted files not included`, from the uncommitted-files warning of the guards. */
function uncommittedNote(warning: string): string | undefined {
  const m = /^(\d+) uncommitted files? (?:is|are) not in/.exec(warning);
  return m ? `${plural(Number(m[1]), 'uncommitted file', 'uncommitted files')} not included` : undefined;
}

/** The repository of a batch line: its name and hosted project. */
export interface BatchRepo {
  name: string;
  provider: HostedProvider;
  host: string;
  projectPath: string;
}

/** The job result of one repository of the batch, its review and the notes of its line (Selection result matrix). */
export function batchEntry(outcome: FlowOutcome, repo: BatchRepo): MrBatchEntry {
  switch (outcome.kind) {
    case 'stop':
      return { result: stopResult(outcome), notes: [] };
    case 'exists': {
      const review: BatchReview = {
        repo: repo.name,
        ref: outcome.ref,
        url: outcome.url,
        provider: repo.provider,
        host: repo.host,
        projectPath: repo.projectPath,
        number: Number(outcome.ref.slice(1)),
        ...(outcome.description === undefined ? {} : { description: outcome.description }),
        linkable: outcome.description !== undefined,
        existed: true,
      };
      return { result: { state: 'ok', detail: 'already existed' }, review, notes: [] };
    }
    case 'created': {
      const notes: string[] = [];
      if (outcome.pushed > 0) notes.push(`pushed ${outcome.pushed}`);
      const uncommitted = outcome.warning && uncommittedNote(outcome.warning.text);
      if (uncommitted) notes.push(uncommitted);
      return {
        result: { state: 'ok', detail: `created ${outcome.ref}${outcome.pushed > 0 ? `, pushed ${outcome.pushed}` : ''}` },
        review: {
          repo: repo.name,
          ref: outcome.ref,
          url: outcome.url,
          provider: outcome.provider,
          host: outcome.host,
          projectPath: outcome.projectPath,
          number: outcome.number,
          description: outcome.description,
          linkable: true,
          existed: false,
        },
        notes,
      };
    }
    case 'pushed': {
      const notes = [`pushed ${outcome.pushed}`, 'no related links: not signed in'];
      const uncommitted = outcome.warning && uncommittedNote(outcome.warning.text);
      if (uncommitted) notes.splice(1, 0, uncommitted);
      return {
        result: { state: 'ok', detail: `created ${outcome.ref}, pushed ${outcome.pushed}, no related links` },
        review: {
          repo: repo.name,
          ref: outcome.ref,
          url: outcome.url,
          provider: 'gitlab',
          host: outcome.host,
          projectPath: outcome.projectPath,
          number: outcome.number,
          linkable: false,
          existed: false,
        },
        notes,
      };
    }
  }
}

/**
 * The detail of an `ok` line (Selection result matrix): `!142  git.acme.com/payments/billing-api  (pushed 2)`, or
 * `!88  already existed — description updated with related links`.
 */
export function entryDetail(entry: MrBatchEntry, link: LinkState): string | undefined {
  const review = entry.review;
  if (entry.result.state !== 'ok' || !review) return undefined;
  const notes = [...entry.notes, ...(link.kind === 'failed' ? [`related links not added: ${link.reason}`] : [])];
  const suffix = notes.length ? `  (${notes.join(', ')})` : '';
  if (review.existed) {
    return `${review.ref}  already existed${link.kind === 'added' ? ' — description updated with related links' : ''}${suffix}`;
  }
  return `${review.ref}  ${review.host}/${review.projectPath}${suffix}`;
}

/** `Related links added to all 3 descriptions.` or `Related links added to 2 of 3 descriptions.`; none when none was. */
export function relatedNote(added: number, total: number): string | undefined {
  if (added === 0) return undefined;
  return added === total ? `Related links added to all ${total} descriptions.` : `Related links added to ${added} of ${total} descriptions.`;
}

/** `Create MRs — feature/ABC-12-notes` when every repository is on that branch, else `Create MRs`. */
export function mrPanelTitle(branches: readonly (string | undefined)[]): string {
  const first = branches[0];
  return first !== undefined && branches.every((b) => b === first) ? `Create MRs — ${first}` : 'Create MRs';
}

export interface LinkPort {
  credential(host: string): Promise<Credential | undefined>;
  /** The provider that updates a review's description */
  writer(id: string, review: BatchReview): ReviewWriter | undefined;
  /** At most this many updates at a time (`repohangar.concurrency`) */
  concurrency: number;
}

export interface LinkOutcome {
  /** What the related-links step did for each repository that took part */
  links: Map<string, LinkState>;
  /** The reviews that were to be updated */
  total: number;
}

/**
 * The related links of a batch (design D-3): one description update per `ok` review with a credential, when there are
 * at least two, in parallel. A failure is recorded for its review only; a written description becomes the review's
 * description, so a later run replaces the section.
 */
export async function writeRelatedLinks(entries: ReadonlyMap<string, MrBatchEntry>, port: LinkPort): Promise<LinkOutcome> {
  const candidates: (RelatedReview & { id: string; review: BatchReview; credential: Credential })[] = [];
  for (const [id, entry] of entries) {
    const review = entry.result.state === 'ok' ? entry.review : undefined;
    if (!review?.linkable || review.description === undefined) continue;
    const credential = await port.credential(review.host);
    if (credential) candidates.push({ id, review, credential, repo: review.repo, ref: review.ref, url: review.url });
  }
  const links = new Map<string, LinkState>();
  const updates = relatedUpdates(candidates);
  const queue = [...updates];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const { id, review, credential } = next.review;
      const description = mergeRelated(review.description ?? '', relatedSection(next.others));
      try {
        const writer = port.writer(id, review);
        if (!writer) throw new Error('the repository is no longer open');
        await writer.updateDescription(review.projectPath, review.number, description, credential);
        review.description = description;
        links.set(id, { kind: 'added' });
      } catch (error) {
        links.set(id, { kind: 'failed', reason: error instanceof HttpError && error.status !== undefined ? String(error.status) : (error as Error).message });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, port.concurrency), queue.length) }, worker));
  return { links, total: updates.length };
}

/** The confirmation before a selection: `billing-api main ← feature/ABC-12-notes · ledger main ← …`. */
export function confirmDetail(items: readonly { repo: string; target: string; branch: string }[]): string {
  return items.map((i) => `${i.repo} ${i.target} ← ${i.branch}`).join(' · ');
}
