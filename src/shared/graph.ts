// Which graph the graph entry points open and how they read (explorer-open-in-git-graph: Graph command variants,
// design D-2), and what a click on the repository name runs (explorer-reveal: Repository name click). Shared by the
// extension host and the webview; no vscode import.

import type { RowAction } from './model';

/** `repohangar.gitGraph.whenMissing` */
export type WhenMissing = 'sourceControlGraph' | 'offerInstall' | 'hide';

export type GraphVariant = 'gitGraph' | 'sourceControlGraph' | 'offerInstall' | 'hidden';

export const GIT_GRAPH_LABEL = 'Open in Git Graph';
export const SOURCE_CONTROL_GRAPH_LABEL = 'Open in Source Control Graph';

export function graphVariant(gitGraphInstalled: boolean, whenMissing: string): GraphVariant {
  if (gitGraphInstalled) return 'gitGraph';
  if (whenMissing === 'offerInstall') return 'offerInstall';
  if (whenMissing === 'hide') return 'hidden';
  return 'sourceControlGraph';
}

/** The label of the graph items, or undefined when they are hidden. */
export function graphLabel(variant: GraphVariant): string | undefined {
  switch (variant) {
    case 'gitGraph':
    case 'offerInstall':
      return GIT_GRAPH_LABEL;
    case 'sourceControlGraph':
      return SOURCE_CONTROL_GRAPH_LABEL;
    case 'hidden':
      return undefined;
  }
}

/** `repohangar.dashboard.nameClick` */
export type NameClick = 'explorer' | 'gitGraph' | 'sourceControl';

export function nameClickAction(nameClick: string): RowAction {
  if (nameClick === 'gitGraph') return 'graph';
  if (nameClick === 'sourceControl') return 'showInSourceControl';
  return 'revealInExplorer';
}
