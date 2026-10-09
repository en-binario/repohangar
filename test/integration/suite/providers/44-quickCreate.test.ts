// mr-creation :: Quick create item matrix (R1–R6), with repohangar.mr.quickCreate "confirm" and the quick input
// answered by the test.

import * as assert from 'node:assert/strict';
import type { TestApi } from '../../../../src/extension';
import type { DrawerData } from '../../../../src/shared/drawer';
import { idOf, ready, setConfig, waitFor } from '../helpers';
import { startCreating, type CreateSession } from './support';

describe('Quick create input', () => {
  let api: TestApi;
  let session: CreateSession;
  let n = 0;

  const press = () => api.dashboard.receiveForTest({ type: 'runAction', id: idOf(api, 'billing-api'), action: 'createMr' });
  const sentTitles = () => session.creates().map((r) => (r.body as { title: string }).title);

  before(async () => {
    api = await ready(6);
    api.providers.focusOverride = true;
  });

  beforeEach(async () => {
    session = await startCreating(api);
    await setConfig('repohangar.mr.quickCreate', 'confirm');
    await setConfig('repohangar.mr.profiles', { default: {}, hotfix: { labels: ['hotfix'], squash: true } });
    await session.branch('billing-api', `feature/ABC-12-quick-${++n}`);
  });

  afterEach(async () => {
    await session.finish();
  });

  it('R1 Create with profile "default", title unchanged: created with the rendered title', async () => {
    let rendered = '';
    session.answers.push((model) => ((rendered = model.title), { kind: 'create', title: model.title }));
    await press();
    assert.ok(rendered.startsWith('feat: ABC-12'), rendered);
    assert.deepEqual(sentTitles(), [rendered]);
    assert.equal(session.quickInputs[0]?.title, rendered);
    assert.match(session.quickInputs[0]?.detail ?? '', /^main ← feature\/ABC-12-quick-\d+/);
  });

  it('R2 Create with profile "default", title typed: created with the typed title', async () => {
    session.answers.push({ kind: 'create', title: 'feat: ABC-12 Notes' });
    await press();
    assert.deepEqual(sentTitles(), ['feat: ABC-12 Notes']);
  });

  it('R3 Edit all fields…: the drawer with the typed title', async () => {
    session.answers.push({ kind: 'edit', title: 'feat: ABC-12 Notes' });
    await press();
    const drawer = await waitFor(
      () => api.dashboard.postedMessages.flatMap((m) => (m.type === 'drawer' && m.data ? [m.data as DrawerData] : []))[0],
      'the drawer',
    );
    assert.equal(drawer.title, 'feat: ABC-12 Notes');
    assert.deepEqual(sentTitles(), []);
  });

  it('R4 Use profile "hotfix": the input again with the values of hotfix', async () => {
    session.answers.push({ kind: 'profile', profile: 'hotfix' }, undefined);
    await press();
    assert.deepEqual(
      session.quickInputs.map((m) => [m.profile, m.otherProfiles]),
      [
        ['default', ['hotfix']],
        ['hotfix', ['default']],
      ],
    );
    assert.match(session.quickInputs[1]?.detail ?? '', / · squash/);
    assert.deepEqual(sentTitles(), []);
  });

  it('R5 Create as draft: created with draft true', async () => {
    session.answers.push((model) => ({ kind: 'draft', title: model.title }));
    await press();
    assert.equal(sentTitles().length, 1);
    assert.ok(sentTitles()[0]?.startsWith('Draft: feat: ABC-12'), sentTitles()[0]);
  });

  it('R6 Esc: no request', async () => {
    session.answers.push(undefined);
    await press();
    assert.equal(session.quickInputs.length, 1);
    assert.deepEqual(sentTitles(), []);
  });
});
