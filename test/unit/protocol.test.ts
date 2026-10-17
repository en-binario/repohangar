import { describe, expect, it } from 'vitest';
import { parseViewMessage } from '../../src/shared/protocol';

describe('parseViewMessage', () => {
  it.each([
    [{ type: 'ready' }],
    [{ type: 'firstPaint', rows: 50 }],
    [{ type: 'setGrouping', mode: 'workspaceFolder' }],
    [{ type: 'toggleGroup', group: 'backend' }],
    [{ type: 'setSort', column: 'sync', direction: 'desc' }],
    [{ type: 'setSort', column: 'review', direction: 'asc' }],
    [{ type: 'loadDetails', id: 'file:///home/dev/code/acme/backend/billing-api' }],
    [{ type: 'openSettings' }],
    [{ type: 'runAction', id: 'file:///home/dev/code/acme/backend/ledger', action: 'fetch' }],
    [{ type: 'runAction', id: 'file:///home/dev/code/acme/backend/ledger', action: 'copyBranch' }],
    [{ type: 'runBatch', action: 'pullFf', ids: ['file:///a', 'file:///b'] }],
    [{ type: 'runBatch', action: 'fetch', ids: [] }],
    [{ type: 'setSelection', ids: ['file:///a'] }],
    [{ type: 'switchBranch', ids: ['file:///a', 'file:///b'] }],
    [{ type: 'createBranch', ids: ['file:///a'] }],
    [{ type: 'fix', id: 'file:///a', fix: 'stashAndPull' }],
    [{ type: 'retryFailed' }],
    [{ type: 'closeBatchResult' }],
    [{ type: 'drawerSearchUsers', id: 'file:///a', field: 'reviewers', text: '@jhon' }],
    [{ type: 'drawerSearchUsers', id: 'file:///a', field: 'assignees', text: '' }],
  ])('accepts %j', (message) => {
    expect(parseViewMessage(message)).toEqual(message);
  });

  it.each([
    ['an unknown type', { type: 'refresh', repo: 42, extra: true }],
    ['a missing field', { type: 'loadDetails' }],
    ['an extra field', { type: 'ready', extra: true }],
    ['a mistyped field', { type: 'firstPaint', rows: '50' }],
    ['a negative count', { type: 'firstPaint', rows: -1 }],
    ['an unknown grouping mode', { type: 'setGrouping', mode: 'byColor' }],
    ['an empty string', { type: 'toggleGroup', group: '' }],
    ['an unknown sort column', { type: 'setSort', column: 'stashes', direction: 'asc' }],
    ['an unknown sort direction', { type: 'setSort', column: 'sync', direction: 'up' }],
    ['a sort with an extra key', { type: 'setSort', column: 'sync', direction: 'desc', groups: true }],
    ['a sort without a direction', { type: 'setSort', column: 'sync' }],
    ['a non-object', 'ready'],
    ['null', null],
    ['an array', [{ type: 'ready' }]],
    ['a prototype key as type', { type: 'constructor' }],
    ['an unknown action', { type: 'runAction', id: 'file:///a', action: 'forcePush' }],
    ['a non-string id', { type: 'runAction', id: 42, action: 'fetch' }],
    ['an unknown batch action', { type: 'runBatch', action: 'push', ids: ['file:///a'] }],
    ['a non-array ids', { type: 'runBatch', action: 'fetch', ids: 'file:///a' }],
    ['a non-string id in ids', { type: 'runBatch', action: 'fetch', ids: ['file:///a', 7] }],
    ['a switch run with runBatch, without a branch', { type: 'runBatch', action: 'switch', ids: ['file:///a'] }],
    ['an unknown fix button', { type: 'fix', id: 'file:///a', fix: 'forcePull' }],
    ['a fix button without a repository', { type: 'fix', fix: 'openScm' }],
    ['a user search without a field', { type: 'drawerSearchUsers', id: 'file:///a', text: 'jhon' }],
    ['a user search in Labels', { type: 'drawerSearchUsers', id: 'file:///a', field: 'labels', text: 'jhon' }],
    ['a user search with an extra key', { type: 'drawerSearchUsers', id: 'file:///a', field: 'reviewers', text: 'jhon', host: 'git.acme.com' }],
    ['a user search text over 256 characters', { type: 'drawerSearchUsers', id: 'file:///a', field: 'reviewers', text: 'j'.repeat(257) }],
    ['more than 10 000 ids', { type: 'setSelection', ids: Array.from({ length: 10_001 }, (_, i) => `file:///r${i}`) }],
  ])('rejects %s', (_name, message) => {
    expect(parseViewMessage(message)).toBeUndefined();
  });
});
