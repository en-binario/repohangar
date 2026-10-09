import { describe, expect, it } from 'vitest';
import { detailsLines } from '../../src/shared/format';
import type { Head, RowData, RowDetails } from '../../src/shared/model';
import { row } from './rows';

const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);
const min = 60_000;

// dashboard :: Row details matrix
const rows: [string, RowDetails, Head, RowData['remote'], string, string[]][] = [
  [
    'shows the last commit, upstream, remote and path',
    { commit: { hash: 'a1b2c3d4e5f6', subject: 'Add credit note link to invoice page', author: 'Luis Gómez', date: NOW - 25 * min } },
    { kind: 'branch', name: 'feature/ABC-12-notes', upstream: 'origin/feature/ABC-12-notes', ahead: 3, behind: 0 },
    { name: 'origin', displayUrl: 'https://git.acme.com/acme/web-shop.git' },
    '/home/dev/code/acme/frontend/web-shop',
    [
      'Last commit  a1b2c3d  "Add credit note link to invoice page" — Luis Gómez, 25 min ago',
      'Upstream  origin/feature/ABC-12-notes',
      'Remote  origin  https://git.acme.com/acme/web-shop.git',
      'Path  /home/dev/code/acme/frontend/web-shop',
    ],
  ],
  [
    'shows No commits yet for an unborn branch',
    { commit: null },
    { kind: 'branch', name: 'main' },
    { name: 'origin', displayUrl: 'git@github.com:acme/new-service.git' },
    '/home/dev/code/acme/backend/new-service',
    [
      'Last commit  No commits yet',
      'Upstream  none',
      'Remote  origin  git@github.com:acme/new-service.git',
      'Path  /home/dev/code/acme/backend/new-service',
    ],
  ],
  [
    'shows none for the upstream and the remote',
    { commit: { hash: '9f8e7d6c5b4a', subject: 'Initial import', author: 'Ana Pérez', date: NOW - 3 * 24 * 60 * min } },
    { kind: 'branch', name: 'main' },
    null,
    '/home/dev/code/acme/tools/scratch',
    [
      'Last commit  9f8e7d6  "Initial import" — Ana Pérez, 3 d ago',
      'Upstream  none',
      'Remote  none',
      'Path  /home/dev/code/acme/tools/scratch',
    ],
  ],
];

describe('detailsLines', () => {
  it.each(rows)('%s', (_name, details, head, remote, path, expected) => {
    expect(detailsLines(row({ head, remote, path }), details, NOW)).toEqual(expected);
  });

  it('shows just now under a minute', () => {
    const details: RowDetails = { commit: { hash: 'abcdef1', subject: 's', author: 'a', date: NOW - 10_000 } };
    expect(detailsLines(row(), details, NOW)[0]).toBe('Last commit  abcdef1  "s" — a, just now');
  });
});
