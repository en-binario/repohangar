// hosting-providers :: Pipeline value matrix (R1–R11), Approval value matrix (R1–R7), Review cell matrix (R1–R6),
// Mergeable value matrix (R1–R7).

import { describe, expect, it } from 'vitest';
import type { ReviewState } from '../../src/shared/model';
import { approvalValue, mergeableValue, pipelineValue, reviewCell } from '../../src/shared/review';
import { githubReview, gitlabReview, loaded } from './rows';

describe('Pipeline value matrix', () => {
  it.each<[string, 'gitlab' | 'github', string[] | [null], string | null, string | null]>([
    ['shows a GitLab pipeline that succeeded as passed', 'gitlab', ['SUCCESS'], '✓ passed', 'Pipeline passed'],
    ['shows a running GitLab pipeline as running', 'gitlab', ['RUNNING'], '⟳ running', 'Pipeline running'],
    [
      'shows waiting GitLab pipelines as pending',
      'gitlab',
      ['PENDING', 'CREATED', 'WAITING_FOR_RESOURCE', 'PREPARING', 'SCHEDULED', 'WAITING_FOR_CALLBACK'],
      '◷ pending',
      'Pipeline pending',
    ],
    ['shows a GitLab pipeline waiting for a manual job', 'gitlab', ['MANUAL'], '◷ manual', 'Pipeline waiting for a manual job'],
    ['shows a failed GitLab pipeline as failed', 'gitlab', ['FAILED'], '✗ failed', 'Pipeline failed'],
    ['shows canceled GitLab pipelines as canceled', 'gitlab', ['CANCELED', 'CANCELING'], '⊘ canceled', 'Pipeline canceled'],
    ['shows nothing for a skipped GitLab pipeline or none', 'gitlab', ['SKIPPED', null as unknown as string], null, null],
    ['shows GitHub checks that succeeded as passed', 'github', ['SUCCESS'], '✓ passed', 'Checks passed'],
    ['shows pending GitHub checks as running', 'github', ['PENDING', 'EXPECTED'], '⟳ running', 'Checks running'],
    ['shows failed GitHub checks as failed', 'github', ['FAILURE', 'ERROR'], '✗ failed', 'Checks failed'],
    ['shows nothing without a GitHub status rollup', 'github', [null], null, null],
  ])('%s', (_name, provider, values, text, label) => {
    for (const value of values) {
      const part = pipelineValue(provider, value);
      expect(part ? [part.text, part.label] : null).toEqual(text === null ? null : [text, label]);
    }
  });
});

describe('Approval value matrix', () => {
  it.each<[string, ReviewState, string | null, string | null]>([
    ['shows one of two GitLab approvals', gitlabReview({ approvalsRequired: 2, approvalsLeft: 1 }), '1/2', '1 of 2 approvals'],
    ['shows two of two GitLab approvals', gitlabReview({ approvalsRequired: 2, approvalsLeft: 0 }), '2/2', '2 of 2 approvals'],
    ['shows nothing when GitLab requires no approval or the field was removed', gitlabReview({ approvalsRequired: 0 }), null, null],
    ['shows an approved pull request', githubReview({ reviewDecision: 'APPROVED' }), 'approved', 'Approved'],
    ['shows a pull request with changes requested', githubReview({ reviewDecision: 'CHANGES_REQUESTED' }), 'changes requested', 'Changes requested'],
    ['shows a pull request that needs a review', githubReview({ reviewDecision: 'REVIEW_REQUIRED' }), 'review required', 'Review required'],
    ['shows nothing without a review decision', githubReview({ reviewDecision: null }), null, null],
  ])('%s', (_name, review, text, label) => {
    const part = approvalValue(review);
    expect(part ? [part.text, part.label] : null).toEqual(text === null ? null : [text, label]);
  });

  it('shows nothing when the approval fields were removed from the selection', () => {
    expect(approvalValue(gitlabReview({ approvalsRequired: null, approvalsLeft: null }))).toBeNull();
  });
});

describe('Review cell matrix', () => {
  it.each<[string, ReturnType<typeof loaded>, string, string]>([
    [
      'shows a draft merge request with a running pipeline',
      loaded(gitlabReview({ draft: true, pipeline: 'RUNNING' })),
      '!142  Draft  ⟳ running',
      'Merge request 142, Draft, Pipeline running',
    ],
    [
      'shows a merge request that passed with its approvals',
      loaded(gitlabReview({ number: 88, pipeline: 'SUCCESS', approvalsRequired: 2, approvalsLeft: 0 })),
      '!88  ✓ passed  2/2',
      'Merge request 88, Pipeline passed, 2 of 2 approvals',
    ],
    [
      'shows a pull request with failed checks and changes requested',
      loaded(githubReview({ pipeline: 'FAILURE', reviewDecision: 'CHANGES_REQUESTED' })),
      '#311  ✗ failed  changes requested',
      'Pull request 311, Checks failed, Changes requested',
    ],
    [
      'shows a pull request with auto-merge',
      loaded(githubReview({ number: 57, pipeline: 'SUCCESS', autoMerge: true })),
      '#57  ✓ passed  auto ⇢',
      'Pull request 57, Checks passed, Auto-merge enabled',
    ],
    ['shows a dash for a GitLab branch without an open merge request', loaded(null, 'gitlab'), '—', 'No open merge request'],
    ['shows a dash for a GitHub branch without an open pull request', loaded(null, 'github'), '—', 'No open pull request'],
  ])('%s', (_name, info, text, label) => {
    const cell = reviewCell(info, 0);
    expect([cell.text, cell.label]).toEqual([text, label]);
  });

  it('uses the title of the review as tooltip', () => {
    expect(reviewCell(loaded(gitlabReview()), 0).tooltip).toBe('feat: ABC-12 Add billing notes');
  });
});

describe('Mergeable value matrix', () => {
  it.each<[string, 'gitlab' | 'github', (string | null)[], string]>([
    ['reads a GitLab merge request that can merge as yes', 'gitlab', ['MERGEABLE'], 'yes'],
    ['reads a GitLab conflict as conflicts', 'gitlab', ['CONFLICT'], 'conflicts'],
    [
      'reads GitLab statuses that block a merge as blocked',
      'gitlab',
      [
        'BLOCKED_STATUS',
        'NOT_APPROVED',
        'CI_MUST_PASS',
        'CI_STILL_RUNNING',
        'DISCUSSIONS_NOT_RESOLVED',
        'DRAFT_STATUS',
        'NOT_OPEN',
        'NEED_REBASE',
        'JIRA_ASSOCIATION_MISSING',
        'EXTERNAL_STATUS_CHECKS',
        'REQUESTED_CHANGES',
      ],
      'blocked',
    ],
    ['reads a GitLab status still being checked, any other value or none as unknown', 'gitlab', ['CHECKING', 'UNCHECKED', 'SOMETHING_NEW', null], 'unknown'],
    ['reads a GitHub pull request that can merge as yes', 'github', ['MERGEABLE'], 'yes'],
    ['reads a GitHub conflict as conflicts', 'github', ['CONFLICTING'], 'conflicts'],
    ['reads an unknown GitHub state as unknown', 'github', ['UNKNOWN'], 'unknown'],
  ])('%s', (_name, provider, values, expected) => {
    for (const value of values) expect(mergeableValue(provider, value)).toBe(expected);
  });
});
