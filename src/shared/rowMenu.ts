// The items of a row's more-actions menu and whether each applies (git-operations: Row more-actions menu), and the
// buttons of the row details (explorer-open-in-git-graph, explorer-reveal, source-control-reveal; design D-8). Shared
// by the extension host and the webview; no vscode import.

import { isDirty } from './format';
import { graphLabel, type GraphVariant } from './graph';
import type { RowAction, RowData } from './model';
import { compareState } from './review';

export interface MenuItem {
  action: RowAction;
  label: string;
  /** The dashboard key of the action, shown next to the label */
  key?: string;
  enabled: boolean;
  /** Why a disabled item does not apply, as its tooltip */
  reason?: string;
}

/** The name of Reveal in File Explorer on each platform, as VS Code names it. */
export function revealLabel(platform: string): string {
  if (platform === 'darwin') return 'Reveal in Finder';
  if (platform === 'linux') return 'Open Containing Folder';
  return 'Reveal in File Explorer';
}

/** The graph, Explorer, Source Control and terminal actions, in the order of the menu and the row details (W3, W12). */
function navigationItems(graph: GraphVariant): MenuItem[] {
  const label = graphLabel(graph);
  return [
    ...(label ? [{ action: 'graph' as const, label, key: 'g', enabled: true }] : []),
    { action: 'revealInExplorer', label: 'Reveal in Explorer', key: 'e', enabled: true },
    { action: 'showInSourceControl', label: 'Show in Source Control', key: 's', enabled: true },
    { action: 'terminal', label: 'Open terminal', key: 't', enabled: true },
  ];
}

/** The menu in groups, separated by a line. */
export function rowMenu(
  row: Pick<RowData, 'counts' | 'stashes' | 'head'> & Partial<Pick<RowData, 'provider' | 'defaultBranch' | 'review'>>,
  platform: string,
  graph: GraphVariant,
): MenuItem[][] {
  const dirty = isDirty(row);
  const compare = compareState({ provider: row.provider ?? null, head: row.head, defaultBranch: row.defaultBranch ?? null, review: row.review }, undefined);
  return [
    navigationItems(graph),
    [
      { action: 'stash', label: 'Stash changes', enabled: dirty },
      { action: 'stashPop', label: 'Pop latest stash', enabled: row.stashes > 0 },
      { action: 'discardAll', label: 'Discard all changes…', enabled: dirty },
    ],
    [
      { action: 'revealInOS', label: revealLabel(platform), enabled: true },
      { action: 'copyPath', label: 'Copy path', enabled: true },
      { action: 'copyBranch', label: 'Copy branch name', enabled: row.head.kind === 'branch' },
      // hosting-providers: Compare page
      { action: 'openCompare', label: 'Open compare page ↗', enabled: compare.enabled, ...(compare.enabled ? {} : { reason: compare.reason }) },
    ],
  ];
}

/** The buttons of the row details: `[Open in Git Graph] [Reveal in Explorer] [Show in Source Control] [Open terminal]`. */
export function detailsButtons(graph: GraphVariant): { action: RowAction; label: string }[] {
  return navigationItems(graph).map(({ action, label }) => ({ action, label }));
}
