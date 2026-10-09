import { describe, expect, it } from 'vitest';
import { dashboardState, emptyStateText } from '../../src/shared/format';
import type { GitApiState } from '../../src/shared/model';

// dashboard :: Dashboard state matrix
const rows: [string, boolean, GitApiState, number, string | null, string | undefined][] = [
  ['reports Git disabled by git.enabled', false, 'initialized', 3, 'The Git extension is disabled (git.enabled is false).', 'Open Settings'],
  ['reports loading before the Git API is initialized', true, 'uninitialized', 0, 'Loading repositories…', undefined],
  ['reports no repositories', true, 'initialized', 0, 'No Git repositories found in this workspace.', undefined],
  ['shows the grid with repositories', true, 'initialized', 2, null, undefined],
];

describe('dashboardState', () => {
  it.each(rows)('%s', (_name, enabled, apiState, count, text, button) => {
    const empty = emptyStateText(dashboardState(enabled, apiState, count));
    expect(empty?.text ?? null).toBe(text);
    expect(empty?.button).toBe(button);
  });
});
