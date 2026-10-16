// mr-creation :: Find users in the Reviewers and Assignees fields (search text constraint) and the username as sent.

import { describe, expect, it } from 'vitest';
import { searchText, userName } from '../../src/mr/users';

describe('searchText', () => {
  it.each([
    ['', undefined],
    ['@', undefined],
    [' @jhon ', 'jhon'],
    ['team:sre', undefined],
    ['jhon', 'jhon'],
  ])('%j searches %j', (text, expected) => {
    expect(searchText(text)).toBe(expected);
  });
});

describe('userName', () => {
  it.each([
    ['@jtapiap', 'jtapiap'],
    [' jtapiap ', 'jtapiap'],
    ['@me', '@me'],
    ['team:sre', 'team:sre'],
  ])('%j is sent as %j', (entry, expected) => {
    expect(userName(entry)).toBe(expected);
  });
});
