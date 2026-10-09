import { describe, expect, it } from 'vitest';
import { batchSummary, progressText, type BatchSummary } from '../../src/jobs/summary';
import type { BatchAction, JobResult } from '../../src/shared/model';

const many = (n: number, result: JobResult): JobResult[] => Array.from({ length: n }, () => result);
const ok: JobResult = { state: 'ok' };
const updated: JobResult = { state: 'ok', detail: 'fast-forwarded 2 commits' };
const level: JobResult = { state: 'ok', detail: 'up to date' };
const skipped: JobResult = { state: 'skipped', detail: 'dirty (3 files)' };
const failed: JobResult = { state: 'failed', detail: 'Permission denied (publickey)' };

// batch-operations :: Batch summary matrix
const cases: [string, BatchAction, number, JobResult[], BatchSummary][] = [
  ['R1 reports a Fetch all without problems as information', 'fetch', 4100, many(14, ok),
    { severity: 'information', text: 'Fetch all — finished in 4.1 s: ✓ 14 fetched', showOutput: false }],
  ['R2 reports a Fetch all with a failure as a warning', 'fetch', 6000, [...many(12, ok), skipped, failed],
    { severity: 'warning', text: 'Fetch all — finished in 6.0 s: ✓ 12 fetched · ↷ 1 skipped · ✗ 1 failed', showOutput: true }],
  ['R3 reports a Pull all (ff) with a failure as a warning', 'pullFf', 6200, [...many(9, updated), ...many(4, skipped), failed],
    { severity: 'warning', text: 'Pull all (ff) — finished in 6.2 s: ✓ 9 updated · ↷ 4 skipped · ✗ 1 failed', showOutput: true }],
  ['R4 keeps the first count at 0 and shows the repositories up to date', 'pullFf', 2000, many(14, level),
    { severity: 'information', text: 'Pull all (ff) — finished in 2.0 s: ✓ 0 updated · = 14 up to date', showOutput: false }],
];

describe('batchSummary', () => {
  it.each(cases)('%s', (_name, action, ms, results, summary) => {
    expect(batchSummary(action, ms, results)).toEqual(summary);
  });
});

describe('progressText', () => {
  it('counts the repositories done', () => {
    expect(progressText('fetch', 6, 14)).toBe('Fetch all: 6/14');
    expect(progressText('pullFf', 0, 14)).toBe('Pull all (ff): 0/14');
  });
});
