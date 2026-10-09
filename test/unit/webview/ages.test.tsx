// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, type VsCodeApi } from '../../../webview/App';
import type { Snapshot } from '../../../src/shared/protocol';
import { row } from '../rows';

const api: VsCodeApi = { postMessage: () => undefined, getState: () => undefined, setState: () => undefined };

describe('dashboard webview ages', () => {
  beforeEach(() => vi.useFakeTimers({ now: Date.UTC(2026, 9, 8, 12, 0, 0) }));
  afterEach(() => vi.useRealTimers());

  it('re-renders the Fetched cell after 60 seconds while visible', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(() => render(<App api={api} />, container));
    const snapshot: Snapshot = {
      type: 'snapshot',
      state: { kind: 'grid' },
      rows: [row({ name: 'ledger', lastFetch: Date.now() - 59 * 60_000 })],
      grouping: 'none',
      collapsed: [],
      staleFetchHours: 1,
      platform: 'win32',
      graph: 'gitGraph',
      nameClick: 'explorer',
    };
    await act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: snapshot }));
    });
    const cell = () => container.querySelector('[data-repo="ledger"] [data-col="fetched"]')?.textContent;
    expect(cell()).toBe('59 min');

    await act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(cell()).toBe('1 h ⚠');
  });
});
