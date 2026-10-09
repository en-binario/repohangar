import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { Repository } from '../../../../src/git/git';
import { ready, spyOnRepositories } from '../helpers';

describe('refresh command', () => {
  it('calls repository.status() once per repository and no network operation', async () => {
    const api = await ready(14);
    const repositories = api.registry.ids().map((id) => api.registry.repository(id) as Repository);
    const spy = spyOnRepositories(repositories);
    try {
      await vscode.commands.executeCommand('repohangar.refresh');
    } finally {
      spy.restore();
    }
    assert.equal(spy.calls.status, repositories.length);
    assert.equal(spy.calls.fetch, undefined);
    assert.equal(spy.calls.pull, undefined);
    assert.equal(spy.calls.push, undefined);
  });
});
