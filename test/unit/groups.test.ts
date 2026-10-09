import { describe, expect, it } from 'vitest';
import { assignGroup, type FolderRef } from '../../src/git/groups';
import type { GroupingMode } from '../../src/shared/model';

const acme: FolderRef[] = [{ name: 'acme', path: '/home/dev/code/acme' }];
const twoGroups = { payments: ['**/billing-*', '**/ledger'], web: ['**/web-*'] };

// repo-registry :: Group assignment matrix
const rows: [string, GroupingMode, string, FolderRef[], Record<string, string[]>, string | null][] = [
  ['uses the parent folder', 'parentFolder', '/home/dev/code/acme/backend/billing-api', acme, {}, 'backend'],
  ['uses the workspace folder', 'workspaceFolder', '/home/dev/code/acme/backend/billing-api', acme, {}, 'acme'],
  ['uses Other outside every workspace folder', 'workspaceFolder', '/home/dev/code/tools/release-cli', acme, {}, 'Other'],
  ['uses the first matching custom group', 'custom', '/home/dev/code/acme/backend/billing-api', acme, twoGroups, 'payments'],
  ['matches a later custom group', 'custom', '/home/dev/code/acme/frontend/web-shop', acme, twoGroups, 'web'],
  ['uses Other when no glob matches', 'custom', '/home/dev/code/acme/infra/charts', acme, twoGroups, 'Other'],
  ['takes the first key when two groups match', 'custom', '/home/dev/code/acme/backend/billing-api', acme, { a: ['**/billing-*'], b: ['**/billing-api'] }, 'a'],
  ['uses Other with no custom groups', 'custom', '/home/dev/code/acme/backend/billing-api', acme, {}, 'Other'],
  ['puts no repository in a group with none', 'none', '/home/dev/code/acme/backend/billing-api', acme, twoGroups, null],
];

describe('assignGroup', () => {
  it.each(rows)('%s', (_name, mode, root, folders, groups, expected) => {
    expect(assignGroup(mode, root, folders, groups, 'linux')).toBe(expected);
  });

  it('matches globs case-insensitively on Windows only', () => {
    const groups = { payments: ['**/Billing-*'] };
    expect(assignGroup('custom', 'C:\\code\\acme\\billing-api', [], groups, 'win32')).toBe('payments');
    expect(assignGroup('custom', '/code/acme/billing-api', [], groups, 'linux')).toBe('Other');
  });
});
