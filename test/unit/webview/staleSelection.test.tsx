// @vitest-environment jsdom
// dashboard :: a persisted selection naming repositories that are no longer listed is neither counted nor acted on.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { App, type VsCodeApi } from '../../../webview/App';
import type { Snapshot, ViewMessage } from '../../../src/shared/protocol';
import { row } from '../rows';

const ledger = row({ id: 'file:///code/ledger', name: 'ledger', path: '/code/ledger' });
const billing = row({ id: 'file:///code/billing-api', name: 'billing-api', path: '/code/billing-api' });

const snapshot: Snapshot = {
  type: 'snapshot',
  state: { kind: 'grid' },
  rows: [ledger, billing],
  grouping: 'none',
  collapsed: [],
  sort: { column: 'repository', direction: 'asc' },
  staleFetchHours: 1,
  platform: 'win32',
  graph: 'gitGraph',
  nameClick: 'explorer',
  firstRun: null,
  firstRunPending: false,
};

async function open(selected: string[]) {
  const posted: ViewMessage[] = [];
  const api: VsCodeApi = {
    postMessage: (m) => posted.push(m),
    getState: () => ({ filter: '', chips: [], selected, expanded: [], focus: null }),
    setState: () => undefined,
  };
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(() => render(<App api={api} />, container));
  await act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: snapshot }));
  });
  return { container, posted };
}

const lastSelection = (posted: ViewMessage[]) =>
  posted.filter((m): m is Extract<ViewMessage, { type: 'setSelection' }> => m.type === 'setSelection').at(-1)?.ids;

describe('dashboard selection restored from an earlier session', () => {
  it('shows no count and acts on no row when no selected id is listed', async () => {
    const { container, posted } = await open(['file:///code/removed-a', 'file:///code/removed-b']);
    expect(container.querySelector('.selected-count')).toBeNull();
    expect(container.textContent).toContain('Fetch all');
    expect(lastSelection(posted)).toEqual([]);
  });

  it('counts only the selected ids that are listed', async () => {
    const { container, posted } = await open(['file:///code/removed-a', ledger.id]);
    expect(container.querySelector('.selected-count')?.textContent).toBe('1 selected');
    expect(lastSelection(posted)).toEqual([ledger.id]);
  });
});
