// Showing Source Control after Open in Git Graph, ported from Git Graph Opener (source-control-reveal; design D-1).
// No vscode import: the workbench is behind a port and failures go to the RepoHangar log.

export const SHOW_SOURCE_CONTROL_COMMAND = 'workbench.view.scm';
export const SHOW_EXPLORER_COMMAND = 'workbench.view.explorer';
export const FOCUS_ACTIVE_EDITOR_GROUP_COMMAND = 'workbench.action.focusActiveEditorGroup';

export interface RevealPort {
  /** Shows the Source Control view in the sidebar, which also moves focus into it. */
  showSourceControl(): Promise<void>;
  /** Moves focus back to the active editor group, which holds the Git Graph panel. */
  focusGitGraph(): Promise<void>;
}

export type RevealResult = 'gitGraphNotOpened' | 'disabled' | 'revealed' | 'failed';

export async function revealSourceControl(
  gitGraphOpened: boolean,
  enabled: boolean,
  port: RevealPort,
  log: (message: string) => void,
): Promise<RevealResult> {
  if (!gitGraphOpened) return 'gitGraphNotOpened';
  if (!enabled) return 'disabled';
  let result: RevealResult = 'revealed';
  try {
    await port.showSourceControl();
  } catch (error) {
    log(`Showing the Source Control view failed: ${describe(error)}`);
    result = 'failed';
  }
  // Showing may have moved focus before failing, so give it back to Git Graph either way.
  try {
    await port.focusGitGraph();
  } catch (error) {
    log(`Returning focus to Git Graph failed: ${describe(error)}`);
  }
  return result;
}

/** Commands the selection sync runs when it has to show Source Control so VS Code creates its selection commands. */
export function briefRevealCommands(revealEnabled: boolean): string[] {
  return revealEnabled
    ? [SHOW_SOURCE_CONTROL_COMMAND, FOCUS_ACTIVE_EDITOR_GROUP_COMMAND]
    : [SHOW_SOURCE_CONTROL_COMMAND, SHOW_EXPLORER_COMMAND];
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
