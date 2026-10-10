// Recent reviewers and labels (mr-profiles: Recent reviewers and labels; add-profile-editor design D-5): the values sent
// with each creation, kept per host in `globalState` `repohangar.mr.recent.<host>`, most recent first, and offered
// first in the drawer. No vscode import.

export const MAX_RECENT = 10;

export interface Recent {
  reviewers: string[];
  labels: string[];
}

export const EMPTY_RECENT: Readonly<Recent> = { reviewers: [], labels: [] };

export function recentKey(host: string): string {
  return `repohangar.mr.recent.${host}`;
}

/** The stored value, keeping only lists of strings. */
export function readRecent(raw: unknown): Recent {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, MAX_RECENT) : []);
  return { reviewers: list(record.reviewers), labels: list(record.labels) };
}

/** After a creation: the values it sent first, then the earlier ones, without duplicates, at most 10 of each. */
export function recordRecent(recent: Recent, sent: Recent): Recent {
  const merge = (earlier: string[], now: string[]) => [...new Set([...now, ...earlier])].slice(0, MAX_RECENT);
  return { reviewers: merge(recent.reviewers, sent.reviewers), labels: merge(recent.labels, sent.labels) };
}

/** The recent values the field does not hold yet, each offered as a button. */
export function recentOffer(recent: readonly string[], field: readonly string[]): string[] {
  return recent.filter((v) => !field.includes(v));
}

/** `recent: luis.gomez · team:backend`, or undefined when there is nothing to offer. */
export function recentLine(recent: readonly string[], field: readonly string[]): string | undefined {
  const offer = recentOffer(recent, field);
  return offer.length ? `recent: ${offer.join(' · ')}` : undefined;
}
