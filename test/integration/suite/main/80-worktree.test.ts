import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { changesCell } from '../../../../src/shared/format';
import { ready, repoPath, rowNamed, waitFor } from '../helpers';

describe('worktree', () => {
  it('shares the stash count of its main repository', async () => {
    const api = await ready(14);
    if (!rowNamed(api, 'stashed-hotfix')) {
      // The Git extension does not open worktrees in every version; open it the way it would.
      await api.git.current?.openRepository(vscode.Uri.file(repoPath('backend/stashed-hotfix')));
    }
    const worktree = await waitFor(() => rowNamed(api, 'stashed-hotfix'), 'the worktree row');
    const main = rowNamed(api, 'stashed');
    assert.ok(main);
    assert.match(changesCell(main).text, /≡2$/);
    assert.match(changesCell(worktree).text, /≡2$/);
  });
});
