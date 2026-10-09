import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

// The keybinding conflict check of design D-13 (PROPOSAL.md §10.3) for the platform the tests run on: no default
// VS Code binding shares the key of repohangar.open.
describe('default keybinding conflicts', () => {
  it('finds no other default binding on the open key', async () => {
    await vscode.commands.executeCommand('workbench.action.openDefaultKeybindingsFile');
    const lines = (vscode.window.activeTextEditor?.document.getText() ?? '').split(/\r?\n/);
    assert.ok(lines.length > 1000, 'the default keybindings file is open');
    const key = process.platform === 'darwin' ? 'ctrl+cmd+h' : 'ctrl+alt+h';
    const bindings = lines
      .map((line, i) => ({ line, next: lines.slice(i, i + 3).join(' ') }))
      .filter(({ line }) => line.includes(`"key": "${key}"`))
      .map(({ next }) => /"command": "([^"]+)"/.exec(next)?.[1]);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    assert.deepEqual(bindings, ['repohangar.open']);
  });
});
