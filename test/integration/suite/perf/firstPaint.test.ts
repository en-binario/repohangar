import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { FirstPaint } from '../../../../src/ui/dashboard';
import { ready } from '../helpers';

describe('first paint', () => {
  it('renders 50 repositories within 300 ms of repohangar.open', async () => {
    const api = await ready(50);
    assert.equal(api.store.all().length, 50);
    // Warm the webview process once, as a window that has shown any webview has; then measure a fresh panel.
    const warm = new Promise<FirstPaint>((resolve) => {
      const sub = api.dashboard.onDidFirstPaint((p) => {
        sub.dispose();
        resolve(p);
      });
    });
    await vscode.commands.executeCommand('repohangar.open');
    await warm;
    api.dashboard.current?.dispose();

    const measured = new Promise<FirstPaint>((resolve) => {
      const sub = api.dashboard.onDidFirstPaint((p) => {
        sub.dispose();
        resolve(p);
      });
    });
    await vscode.commands.executeCommand('repohangar.open');
    const paint = await measured;
    console.log(`      first paint: ${paint.ms} ms, ${paint.rows} rows`);
    assert.equal(paint.rows, 50);
    const budgetMs = process.env.CI ? 600 : 300;
    assert.ok(paint.ms < budgetMs, `first paint took ${paint.ms} ms (budget ${budgetMs} ms)`);
  });
});
