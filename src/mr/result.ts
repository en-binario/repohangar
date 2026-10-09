// The texts after a creation (mr-creation: Result notification, Push options, Existing review opens instead, Undo).
// No vscode import.

import { plural } from '../shared/format';

export interface Applied {
  reviewers: string[];
  labels: string[];
  squash: boolean;
  deleteBranch: boolean;
  draft: boolean;
}

/** `Created !142 in billing-api (pushed 2 commits): reviewers ana.perez, carla.ruiz · squash · delete branch` */
export function createdText(ref: string, repo: string, pushed: number, applied: Applied): string {
  const parts: string[] = [];
  if (applied.reviewers.length) parts.push(`reviewers ${applied.reviewers.join(', ')}`);
  if (applied.labels.length) parts.push(`labels ${applied.labels.join(', ')}`);
  if (applied.squash) parts.push('squash');
  if (applied.deleteBranch) parts.push('delete branch');
  if (applied.draft) parts.push('draft');
  const push = pushed > 0 ? ` (pushed ${plural(pushed, 'commit', 'commits')})` : '';
  return `Created ${ref} in ${repo}${push}${parts.length ? `: ${parts.join(' · ')}` : ''}`;
}

export type OpenAfter = 'notify' | 'browser' | 'none';

export interface ResultPlan {
  /** The notification and its buttons, or none */
  notification?: { text: string; buttons: string[] };
  /** The status bar message shown for 5 s instead */
  statusBar?: string;
  openBrowser: boolean;
}

/** What the result does by `openAfterCreate` (Result text matrix). */
export function resultPlan(provider: 'gitlab' | 'github', text: string, ref: string, repo: string, openAfter: OpenAfter): ResultPlan {
  if (openAfter === 'none') return { statusBar: `Created ${ref} in ${repo}`, openBrowser: false };
  const open = provider === 'gitlab' ? 'Open MR' : 'Open PR';
  return { notification: { text, buttons: [open, 'Copy link', 'Undo'] }, openBrowser: openAfter === 'browser' };
}

export function existingText(ref: string, branch: string, repo: string): string {
  return `${ref} already exists for ${branch} in ${repo}.`;
}

/** `Pushed 2 commits; GitLab reports !142 for feature/ABC-12-notes in billing-api without reviewers (…) · …` */
export function pushedText(pushed: number, ref: string, branch: string, repo: string, reviewers: string[], descriptionLeftOut: boolean): string {
  let text = `Pushed ${plural(pushed, 'commit', 'commits')}; GitLab reports ${ref} for ${branch} in ${repo}`;
  if (reviewers.length) text += ` without reviewers (${reviewers.join(', ')})`;
  if (descriptionLeftOut) text += ' · description not set (push options take one line)';
  return text;
}

export const UNDO_WINDOW_MS = 30_000;

export function closedText(ref: string, branch: string): string {
  return `Closed ${ref}. The branch ${branch} was kept.`;
}

export function undoExpiredText(ref: string): string {
  return `Undo is no longer available for ${ref}.`;
}
