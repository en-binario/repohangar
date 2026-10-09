import { describe, expect, it } from 'vitest';
import { matchesFilter } from '../../src/shared/format';
import type { ChipId } from '../../src/shared/model';
import { counts, row } from './rows';

const billing = row({
  name: 'billing-api',
  group: 'backend',
  head: { kind: 'branch', name: 'feature/ABC-12-notes', upstream: 'origin/feature/ABC-12-notes', ahead: 2, behind: 0 },
  counts: counts(0, 3, 1, 0),
});

// dashboard :: Filter combination matrix
const rows: [string, string, ChipId[], boolean][] = [
  ['shows the row without filters', '', [], true],
  ['matches the name', 'bill', [], true],
  ['matches the branch case-insensitively', 'abc-12', [], true],
  ['matches the group case-insensitively', 'BACKEND', [], true],
  ['hides a row that does not match the text', 'ledger', [], false],
  ['matches the Dirty chip', '', ['dirty'], true],
  ['matches two chips that both hold', '', ['dirty', 'ahead'], true],
  ['combines chips with AND', '', ['dirty', 'behind'], false],
  ['combines text and chips with AND', 'bill', ['behind'], false],
];

describe('matchesFilter', () => {
  it.each(rows)('%s', (_name, text, chips, shown) => {
    expect(matchesFilter(billing, text, chips)).toBe(shown);
  });
});
