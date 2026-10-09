// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it } from 'vitest';
import { App, type VsCodeApi } from '../../../webview/App';
import type { Snapshot } from '../../../src/shared/protocol';
import { row } from '../rows';

function fakeApi(): VsCodeApi & { sent: unknown[] } {
  const sent: unknown[] = [];
  let state: unknown;
  return {
    sent,
    postMessage: (m) => sent.push(m),
    getState: () => state,
    setState: (s) => (state = s),
  };
}

describe('dashboard webview escaping', () => {
  it('renders a repository name with markup as text', async () => {
    const markup = '<img src=x onerror=alert(1)>';
    const container = document.createElement('div');
    document.body.appendChild(container);
    const api = fakeApi();
    await act(() => render(<App api={api} now={Date.now()} />, container));

    const snapshot: Snapshot = {
      type: 'snapshot',
      state: { kind: 'grid' },
      rows: [row({ id: 'file:///weird', name: markup, path: `/home/dev/code/${markup}` })],
      grouping: 'none',
      collapsed: [],
      staleFetchHours: 1,
      platform: 'win32',
      graph: 'gitGraph',
      nameClick: 'explorer',
      firstRun: null,
      firstRunPending: false,
    };
    await act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: snapshot }));
    });

    const cell = container.querySelector('[data-col="repository"]');
    expect(cell?.querySelector('.repo-name')?.textContent).toBe(markup);
    expect(cell?.querySelector('img')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});
