import { describe, expect, it } from 'vitest';
import { batchSummary, progressText, type BatchSummary, type SummaryOptions } from '../../src/jobs/summary';
import type { BatchAction, JobResult } from '../../src/shared/model';

const many = (n: number, result: JobResult): JobResult[] => Array.from({ length: n }, () => result);
const ok: JobResult = { state: 'ok' };
const updated: JobResult = { state: 'ok', detail: 'fast-forwarded 2 commits' };
const level: JobResult = { state: 'ok', detail: 'up to date' };
const skipped: JobResult = { state: 'skipped', detail: 'dirty (3 files)' };
const failed: JobResult = { state: 'failed', detail: 'Permission denied (publickey)' };

const NOTES = { branch: 'feature/ABC-12-notes' };
const REFUNDS = { branch: 'feature/ABC-31-refunds' };

// batch-operations :: Batch summary matrix, each batch started from a command
const cases: [string, BatchAction, number, JobResult[], SummaryOptions, BatchSummary][] = [
  ['R1 reports a Fetch all without problems as information', 'fetch', 4100, many(14, ok), {},
    { severity: 'information', text: 'Fetch all — finished in 4.1 s: ✓ 14 fetched', showOutput: false, showDetails: false }],
  ['R2 reports a Fetch all with a failure as a warning', 'fetch', 6000, [...many(12, ok), skipped, failed], {},
    { severity: 'warning', text: 'Fetch all — finished in 6.0 s: ✓ 12 fetched · ↷ 1 skipped · ✗ 1 failed', showOutput: true, showDetails: true }],
  ['R3 reports a Pull all (ff) with a failure as a warning', 'pullFf', 6200, [...many(9, updated), ...many(4, skipped), failed], {},
    { severity: 'warning', text: 'Pull all (ff) — finished in 6.2 s: ✓ 9 updated · ↷ 4 skipped · ✗ 1 failed', showOutput: true, showDetails: true }],
  ['R4 keeps the first count at 0 and shows the repositories up to date', 'pullFf', 2000, many(14, level), {},
    { severity: 'information', text: 'Pull all (ff) — finished in 2.0 s: ✓ 0 updated · = 14 up to date', showOutput: false, showDetails: false }],
  ['R5 counts the repositories switched', 'switch', 1200, [ok, { state: 'ok', detail: 'stashed 3 files' }, { state: 'skipped', detail: 'no branch feature/ABC-12-notes' }], NOTES,
    { severity: 'information', text: 'Switch to feature/ABC-12-notes — finished in 1.2 s: ✓ 2 switched · ↷ 1 skipped', showOutput: false, showDetails: true }],
  ['R6 counts the repositories where the branch was created', 'createBranch', 400, many(4, { state: 'ok', detail: 'created from a1b2c3d' }), REFUNDS,
    { severity: 'information', text: 'Create branch feature/ABC-31-refunds — finished in 0.4 s: ✓ 4 created', showOutput: false, showDetails: false }],
];

describe('batchSummary', () => {
  it.each(cases)('%s', (_name, action, ms, results, options, summary) => {
    expect(batchSummary(action, ms, results, options)).toEqual(summary);
  });

  it('leaves Show Details out when the batch was started from the dashboard, which shows the panel', () => {
    const [, action, ms, results] = cases[1] as (typeof cases)[number];
    expect(batchSummary(action, ms, results, { fromDashboard: true })).toMatchObject({ showOutput: true, showDetails: false });
  });
});

describe('progressText', () => {
  it('counts the repositories done', () => {
    expect(progressText('fetch', 6, 14)).toBe('Fetch all: 6/14');
    expect(progressText('pullFf', 0, 14)).toBe('Pull all (ff): 0/14');
    expect(progressText('switch', 1, 3, 'feature/ABC-12-notes')).toBe('Switch to feature/ABC-12-notes: 1/3');
  });
});

// mr-creation :: Merge request summary matrix (a selection batch runs from the dashboard)
const created = (ref: string): JobResult => ({ state: 'ok', detail: `created ${ref}` });
const existed: JobResult = { state: 'ok', detail: 'already existed' };
const mrCases: [string, number, JobResult[], BatchSummary][] = [
  ['R1 counts the merge requests created', 4300, [created('!142'), created('!143'), created('#311')],
    { severity: 'information', text: 'Create MRs — finished in 4.3 s: ✓ 3 created', showOutput: false, showDetails: false }],
  ['R2 counts the reviews that already existed apart, and the skips', 5000, [created('!142'), created('#311'), existed, { state: 'skipped', detail: 'on main' }],
    { severity: 'information', text: 'Create MRs — finished in 5.0 s: ✓ 2 created · = 1 already existed · ↷ 1 skipped', showOutput: false, showDetails: false }],
  ['R3 reports a failure as a warning with Show Git Output', 6100, [created('!142'), created('#311'), { state: 'failed', detail: 'push failed: Permission denied (publickey)' }],
    { severity: 'warning', text: 'Create MRs — finished in 6.1 s: ✓ 2 created · ✗ 1 failed', showOutput: true, showDetails: false }],
];

describe('batchSummary for merge requests', () => {
  it.each(mrCases)('%s', (_name, ms, results, summary) => {
    expect(batchSummary('createMr', ms, results, { fromDashboard: true })).toEqual(summary);
  });
});
