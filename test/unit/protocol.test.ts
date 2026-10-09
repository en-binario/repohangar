import { describe, expect, it } from 'vitest';
import { parseViewMessage } from '../../src/shared/protocol';

describe('parseViewMessage', () => {
  it.each([
    [{ type: 'ready' }],
    [{ type: 'firstPaint', rows: 50 }],
    [{ type: 'setGrouping', mode: 'workspaceFolder' }],
    [{ type: 'toggleGroup', group: 'backend' }],
    [{ type: 'loadDetails', id: 'file:///home/dev/code/acme/backend/billing-api' }],
    [{ type: 'openSettings' }],
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
    ['a non-object', 'ready'],
    ['null', null],
    ['an array', [{ type: 'ready' }]],
    ['a prototype key as type', { type: 'constructor' }],
  ])('rejects %s', (_name, message) => {
    expect(parseViewMessage(message)).toBeUndefined();
  });
});
