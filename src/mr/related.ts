// The related-links section of the merge requests of one selection batch (mr-creation: Related links; mr-profiles:
// Related placeholder; add-multi-repo-mrs design D-2). No vscode import.

export const RELATED_START = '<!-- repohangar:related -->';
export const RELATED_END = '<!-- /repohangar:related -->';
/** What `{related}` renders at creation in a selection batch: the markers, which keep the section's place. */
export const EMPTY_RELATED = `${RELATED_START}\n${RELATED_END}`;

export interface RelatedReview {
  repo: string;
  /** `!142` or `#311` */
  ref: string;
  url: string;
}

function byRepo<T extends RelatedReview>(reviews: readonly T[]): T[] {
  return [...reviews].sort((a, b) => (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : 0));
}

/** `billing-api !142 https://…` */
export function relatedLink(review: RelatedReview): string {
  return `${review.repo} ${review.ref} ${review.url}`;
}

/** The section listing the other reviews of the batch, ordered by repository name. */
export function relatedSection(others: readonly RelatedReview[]): string {
  return [RELATED_START, 'Related:', ...byRepo(others).map((r) => `- ${relatedLink(r)}`), RELATED_END].join('\n');
}

/**
 * The description with the section: in place of an earlier section or of the empty markers `{related}` left, else
 * appended after an empty line.
 */
export function mergeRelated(description: string, section: string): string {
  const start = description.indexOf(RELATED_START);
  const end = start < 0 ? -1 : description.indexOf(RELATED_END, start);
  if (start >= 0 && end >= 0) return `${description.slice(0, start)}${section}${description.slice(end + RELATED_END.length)}`;
  const text = description.replace(/\s+$/, '');
  return text ? `${text}\n\n${section}` : section;
}

/** Each review with the others it links to; none when fewer than two reviews can be linked. */
export function relatedUpdates<T extends RelatedReview>(reviews: readonly T[]): { review: T; others: T[] }[] {
  if (reviews.length < 2) return [];
  return byRepo(reviews).map((review) => ({ review, others: reviews.filter((r) => r !== review) }));
}

/** Copy all links: one `<repository> <ref> <URL>` line per review, ordered by repository name. */
export function allLinks(reviews: readonly RelatedReview[]): string {
  return byRepo(reviews).map(relatedLink).join('\n');
}
