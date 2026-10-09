// The items of a row's more-actions menu and whether each applies (git-operations: Row more-actions menu). Shared by
// the extension host and the webview; no vscode import.

import { isDirty } from './format';
import type { RowAction, RowData } from './model';

export interface MenuItem {
  action: RowAction;
  label: string;
  /** The dashboard key of the action, shown next to the label */
  key?: string;
  enabled: boolean;
}

/** The name of Reveal in File Explorer on each platform, as VS Code names it. */
export function revealLabel(platform: string): string {
  if (platform === 'darwin') return 'Reveal in Finder';
  if (platform === 'linux') return 'Open Containing Folder';
  return 'Reveal in File Explorer';
}

/** The menu in groups, separated by a line. */
export function rowMenu(row: Pick<RowData, 'counts' | 'stashes' | 'head'>, platform: string): MenuItem[][] {
  const dirty = isDirty(row);
  return [
    [{ action: 'terminal', label: 'Open terminal', key: 't', enabled: true }],
    [
      { action: 'stash', label: 'Stash changes', enabled: dirty },
      { action: 'stashPop', label: 'Pop latest stash', enabled: row.stashes > 0 },
      { action: 'discardAll', label: 'Discard all changes…', enabled: dirty },
    ],
    [
      { action: 'revealInOS', label: revealLabel(platform), enabled: true },
      { action: 'copyPath', label: 'Copy path', enabled: true },
      { action: 'copyBranch', label: 'Copy branch name', enabled: row.head.kind === 'branch' },
    ],
  ];
}
