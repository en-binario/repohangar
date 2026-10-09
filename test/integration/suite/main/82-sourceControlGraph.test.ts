// explorer-open-in-git-graph :: Source Control Graph on a repository, in single selection mode without Git Graph.

import * as assert from 'node:assert/strict';
import type { TestApi } from '../../../../src/extension';
import { commandIds, idOf, ready, recordIntegrations, rootOf, scmSelected, setConfig, waitFor } from '../helpers';

describe('Source Control Graph', () => {
  let api: TestApi;
  let stop: () => void;

  before(async () => {
    api = await ready(14);
    await setConfig('scm.repositories.selectionMode', 'single');
  });
  after(async () => {
    await setConfig('scm.repositories.selectionMode', undefined);
  });
  beforeEach(() => {
    stop = recordIntegrations(api);
  });
  afterEach(() => stop());

  it('shows Source Control, selects the repository and focuses the Source Control Graph', async () => {
    // Another repository is selected first.
    await api.sourceControl.sync(rootOf(api, 'billing-api').fsPath, { force: true, briefReveal: ['workbench.view.scm'] });
    await waitFor(() => scmSelected(api).join() === 'billing-api', 'billing-api to be selected');
    api.commands.executed.length = 0;

    await api.dashboard.receiveForTest({ type: 'runAction', id: idOf(api, 'ledger'), action: 'graph' });

    assert.deepEqual(scmSelected(api), ['ledger']);
    const ids = commandIds(api);
    assert.equal(ids[0], 'workbench.view.scm');
    assert.ok(ids.some((id) => id.startsWith('workbench.scm.action.toggleRepositoryVisibility.scm')), 'a selection command ran');
    assert.equal(ids.at(-1), 'workbench.scm.history.focus');
    assert.ok(api.log.lines.some((l) => l.level === 'debug' && l.message.includes(': selected')), JSON.stringify(api.log.lines));
  });
});
