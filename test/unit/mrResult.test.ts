// mr-creation :: Result text matrix (R1–R3); the push-options result and the Undo texts.

import { describe, expect, it } from 'vitest';
import { closedText, createdText, pushedText, resultPlan, undoExpiredText } from '../../src/mr/result';

const none = { reviewers: [], labels: [], squash: false, deleteBranch: false, draft: false };

describe('Result text matrix', () => {
  it('R1 lists the pushed commits and the applied values, with Open MR, Copy link and Undo', () => {
    const text = createdText('!142', 'billing-api', 2, { ...none, reviewers: ['ana.perez', 'carla.ruiz'], squash: true, deleteBranch: true });
    expect(resultPlan('gitlab', text, '!142', 'billing-api', 'notify')).toEqual({
      notification: {
        text: 'Created !142 in billing-api (pushed 2 commits): reviewers ana.perez, carla.ruiz · squash · delete branch',
        buttons: ['Open MR', 'Copy link', 'Undo'],
      },
      openBrowser: false,
    });
  });

  it('R2 opens the pull request in the browser too with openAfterCreate browser', () => {
    const text = createdText('#311', 'web-shop', 0, { ...none, draft: true });
    expect(resultPlan('github', text, '#311', 'web-shop', 'browser')).toEqual({
      notification: { text: 'Created #311 in web-shop: draft', buttons: ['Open PR', 'Copy link', 'Undo'] },
      openBrowser: true,
    });
  });

  it('R3 shows only a status bar message with openAfterCreate none', () => {
    const text = createdText('!143', 'ledger', 0, none);
    expect(resultPlan('gitlab', text, '!143', 'ledger', 'none')).toEqual({ statusBar: 'Created !143 in ledger', openBrowser: false });
  });

  it('lists labels, as GitHub follow-ups apply them', () => {
    expect(createdText('#311', 'web-shop', 0, { ...none, reviewers: ['luis.gomez', 'team:frontend'], labels: ['frontend'] })).toBe(
      'Created #311 in web-shop: reviewers luis.gomez, team:frontend · labels frontend',
    );
  });
});

describe('Push options and Undo texts', () => {
  it('reports what push options could not set', () => {
    expect(pushedText(2, '!142', 'feature/ABC-12-notes', 'billing-api', ['ana.perez', 'luis.gomez'], false)).toBe(
      'Pushed 2 commits; GitLab reports !142 for feature/ABC-12-notes in billing-api without reviewers (ana.perez, luis.gomez)',
    );
    expect(pushedText(1, '!142', 'f', 'r', [], true)).toBe('Pushed 1 commit; GitLab reports !142 for f in r · description not set (push options take one line)');
  });

  it('confirms Undo and its expiry', () => {
    expect(closedText('!142', 'feature/ABC-12-notes')).toBe('Closed !142. The branch feature/ABC-12-notes was kept.');
    expect(undoExpiredText('#311')).toBe('Undo is no longer available for #311.');
  });
});
