// hosting-providers :: Cache matrix (R1–R5).

import { describe, expect, it } from 'vitest';
import { reviewInfo, type InfoContext, type StoredReview } from '../../src/providers/reviewInfo';
import { reviewCell } from '../../src/shared/review';
import { gitlabReview, row } from './rows';

const MIN = 60_000;
const SESSION_START = 100 * MIN;
const NOW = SESSION_START + 5 * MIN;
const hosted = { host: 'git.acme.com', projectPath: 'payments/billing-api', webUrl: 'https://git.acme.com/payments/billing-api' };

function feature(headSha = 'c3d4e5f') {
  return row({
    hosted,
    headSha,
    head: { kind: 'branch', name: 'feature/ABC-12-notes', upstream: 'origin/feature/ABC-12-notes', ahead: 0, behind: 0 },
  });
}

function ctx(stored: Record<string, StoredReview>): InfoContext {
  return {
    hostState: () => 'credential',
    stored: (_id, branch) => stored[branch],
    sessionStart: SESSION_START,
    hostFailing: () => false,
  };
}

describe('Cache matrix', () => {
  it('R1 shows … with no stored state for the branch', () => {
    const cell = reviewCell(reviewInfo(feature(), ctx({})), NOW);
    expect([cell.text, cell.label, cell.stale]).toEqual(['…', 'Loading', false]);
  });

  it('R2 shows a state from an earlier session as not refreshed', () => {
    const fetchedAt = NOW - 12 * MIN;
    const stored = { 'feature/ABC-12-notes': { review: gitlabReview({ pipeline: 'RUNNING' }), headSha: 'c3d4e5f', fetchedAt } };
    const cell = reviewCell(reviewInfo(feature(), ctx(stored)), NOW);
    expect(cell.text).toBe('!142  ⟳ running');
    expect(cell.stale).toBe(true);
    expect(cell.tooltip?.split('\n').pop()).toBe('Not refreshed since 12 min ago');
    expect(cell.label.endsWith(', not refreshed')).toBe(true);
  });

  it('R3 shows a state loaded for another head SHA as not refreshed', () => {
    const stored = { 'feature/ABC-12-notes': { review: gitlabReview({ pipeline: 'RUNNING' }), headSha: 'c3d4e5f', fetchedAt: NOW - MIN } };
    const cell = reviewCell(reviewInfo(feature('e6f7a8b'), ctx(stored)), NOW);
    expect([cell.text, cell.stale]).toEqual(['!142  ⟳ running', true]);
  });

  it('R4 shows a state loaded in this session for HEAD as refreshed', () => {
    const stored = { 'feature/ABC-12-notes': { review: gitlabReview({ pipeline: 'SUCCESS' }), headSha: 'c3d4e5f', fetchedAt: NOW - MIN } };
    const cell = reviewCell(reviewInfo(feature(), ctx(stored)), NOW);
    expect([cell.text, cell.stale, cell.tooltip]).toEqual(['!142  ✓ passed', false, 'feat: ABC-12 Add billing notes']);
  });

  it('R5 shows … when only another branch has a stored state', () => {
    const stored = { main: { review: gitlabReview(), headSha: 'c3d4e5f', fetchedAt: NOW - MIN } };
    const cell = reviewCell(reviewInfo(feature(), ctx(stored)), NOW);
    expect([cell.text, cell.stale]).toEqual(['…', false]);
  });

  it('marks the cells of a failing host as not refreshed', () => {
    const stored = { 'feature/ABC-12-notes': { review: gitlabReview(), headSha: 'c3d4e5f', fetchedAt: NOW - MIN } };
    const info = reviewInfo(feature(), { ...ctx(stored), hostFailing: () => true });
    expect(reviewCell(info, NOW).stale).toBe(true);
  });
});
