// mr-profiles :: Related placeholder matrix (R1–R3); mr-creation :: Related links matrix (R1–R5): the section, where
// it goes in a description, and which reviews get one.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { batchEntry, type BatchReview } from '../../src/mr/multi';
import { EMPTY_RELATED, mergeRelated, RELATED_END, RELATED_START, relatedSection, relatedUpdates } from '../../src/mr/related';
import { renderDescription, type TemplateContext, type TemplateFiles } from '../../src/mr/templates';

const ROOT = join('/', 'repos', 'billing-api');

function ctx(related: string): TemplateContext {
  return { branch: 'feature/ABC-12-notes', repo: 'billing-api', defaultBranch: 'main', commits: ['Add notes field to invoice'], remoteBranches: [], me: '', related };
}

function files(content: Record<string, string>): TemplateFiles {
  return { readFile: async (path) => content[path], list: async () => [] };
}

const BILLING = { repo: 'billing-api', ref: '!142', url: 'https://git.acme.com/payments/billing-api/-/merge_requests/142' };
const LEDGER = { repo: 'ledger', ref: '!143', url: 'https://git.acme.com/payments/ledger/-/merge_requests/143' };
const WEB = { repo: 'web-shop', ref: '#311', url: 'https://github.com/acme/web-shop/pull/311' };
const TEMPLATE = '## What\n{commits}\n{related}';

const section = (...lines: string[]) => [RELATED_START, 'Related:', ...lines, RELATED_END].join('\n');

// mr-profiles :: Related placeholder matrix
describe('the {related} placeholder', () => {
  it('R1 renders as nothing for one repository', async () => {
    expect((await renderDescription(TEMPLATE, ctx(''), 'gitlab', ROOT, files({}))).text).toBe('## What\n- Add notes field to invoice');
  });

  it('R2 keeps the place of the section in a selection, where the links are written later', async () => {
    const rendered = (await renderDescription(TEMPLATE, ctx(EMPTY_RELATED), 'gitlab', ROOT, files({}))).text;
    expect(rendered).toBe(`## What\n- Add notes field to invoice\n${RELATED_START}\n${RELATED_END}`);
    expect(mergeRelated(rendered, relatedSection([LEDGER]))).toBe(`## What\n- Add notes field to invoice\n${section(`- ledger !143 ${LEDGER.url}`)}`);
  });

  it('R3 adds nothing to a repository template without it; the links are appended after an empty line', async () => {
    const template = { [join(ROOT, '.gitlab', 'merge_request_templates', 'Default.md')]: '## Summary\nWhat it does.\n' };
    const rendered = (await renderDescription('template:default', ctx(EMPTY_RELATED), 'gitlab', ROOT, files(template))).text;
    expect(rendered).toBe('## Summary\nWhat it does.\n\n- Add notes field to invoice');
    expect(mergeRelated(rendered, relatedSection([LEDGER]))).toBe(`${rendered}\n\n${section(`- ledger !143 ${LEDGER.url}`)}`);
  });
});

/** The description each review gets: the others of the batch, merged into its description. */
function linked<T extends { repo: string; ref: string; url: string; description: string }>(reviews: T[]): Map<string, string> {
  return new Map(relatedUpdates(reviews).map(({ review, others }) => [review.repo, mergeRelated(review.description, relatedSection(others))]));
}

// mr-creation :: Related links matrix
describe('related links', () => {
  const rendered = `## What\n- Add notes field to invoice\n${EMPTY_RELATED}`;

  it('R1 writes the section at the place of {related}', () => {
    const after = linked([{ ...BILLING, description: rendered }, { ...LEDGER, description: '' }, { ...WEB, description: '' }]);
    expect(after.get('billing-api')).toBe(`## What\n- Add notes field to invoice\n${section(`- ledger !143 ${LEDGER.url}`, `- web-shop #311 ${WEB.url}`)}`);
    expect(after.size).toBe(3);
  });

  it('R2 appends the section after an empty line to a description without {related}', () => {
    const after = linked([{ ...BILLING, description: rendered }, { ...LEDGER, description: '' }, { ...WEB, description: 'Closes ABC-12' }]);
    expect(after.get('web-shop')).toBe(`Closes ABC-12\n\n${section(`- billing-api !142 ${BILLING.url}`, `- ledger !143 ${LEDGER.url}`)}`);
  });

  it('R3 replaces the section an earlier batch wrote, leaving one', () => {
    const earlier = `Notes for ABC-12\n\n${section(`- ledger !140 https://git.acme.com/payments/ledger/-/merge_requests/140`)}\n\nThanks`;
    const notifications = { repo: 'notifications', ref: '!88', url: 'https://git.acme.com/payments/notifications/-/merge_requests/88', description: earlier };
    const after = linked([notifications, { ...LEDGER, description: '' }, { ...WEB, description: '' }]).get('notifications') as string;
    expect(after).toBe(`Notes for ABC-12\n\n${section(`- ledger !143 ${LEDGER.url}`, `- web-shop #311 ${WEB.url}`)}\n\nThanks`);
    expect(after.split(RELATED_START)).toHaveLength(2);
  });

  it('R4 updates nothing when the batch has one review', () => {
    expect(relatedUpdates([{ ...BILLING, description: rendered }])).toEqual([]);
  });

  it('R5 leaves out a review created without a token, which cannot be updated', () => {
    const pushed = batchEntry(
      {
        kind: 'pushed',
        host: 'git.acme.com',
        projectPath: 'payments/auth-service',
        branch: 'feature/ABC-12-notes',
        repo: 'auth-service',
        ref: '!143',
        number: 143,
        url: 'https://git.acme.com/payments/auth-service/-/merge_requests/143',
        text: '',
        pushed: 1,
        reviewers: [],
        assignees: [],
      },
      { name: 'auth-service', provider: 'gitlab', host: 'git.acme.com', projectPath: 'payments/auth-service' },
    );
    expect(pushed.review?.linkable).toBe(false);
    expect(pushed.notes).toContain('no related links: not signed in');
    const reviews = [
      { ...BILLING, description: rendered, linkable: true },
      { ...LEDGER, description: '', linkable: true },
      { ...(pushed.review as BatchReview), description: '' },
    ].filter((r) => r.linkable);
    const after = linked(reviews);
    expect([...after.keys()]).toEqual(['billing-api', 'ledger']);
    expect(after.get('billing-api')).not.toContain('auth-service');
  });
});
