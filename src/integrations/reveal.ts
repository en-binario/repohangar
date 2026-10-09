// Revealing a repository in the Explorer (explorer-reveal: Reveal in Explorer, Repositories outside the workspace
// folders). The workbench, the quick pick and the settings are behind a port; no vscode import.

import { revealLabel } from '../shared/rowMenu';

/** `repohangar.explorer.outsideWorkspace` */
export type OutsideWorkspace = 'ask' | 'addToWorkspace' | 'newWindow' | 'revealInOS';

export type OutsideChoice = Exclude<OutsideWorkspace, 'ask'>;

export interface PickItem {
  choice: OutsideChoice;
  label: string;
}

export interface ExplorerRevealPort {
  insideWorkspace(root: string): boolean;
  collapseBeforeReveal(): boolean;
  outsideWorkspace(): string;
  /** `workbench.files.action.collapseExplorerFolders` */
  collapseExplorerFolders(): Promise<void>;
  /** `revealInExplorer` with the root */
  revealInExplorer(root: string): Promise<void>;
  /** `workspace.updateWorkspaceFolders` adding the root as the last folder; resolves once the folder is added */
  addToWorkspace(root: string): Promise<void>;
  /** `vscode.openFolder` with the root and `forceNewWindow: true` */
  openInNewWindow(root: string): Promise<void>;
  /** `revealFileInOS` with the root */
  revealInOS(root: string): Promise<void>;
  /** Shows the quick pick; `always` is true when the item button Always do this was clicked. */
  pick(items: PickItem[], placeholder: string): Promise<{ choice: OutsideChoice; always: boolean } | undefined>;
  /** Writes `repohangar.explorer.outsideWorkspace` at user scope */
  writeOutsideWorkspace(value: OutsideChoice): Promise<void>;
}

export const ALWAYS_DO_THIS = 'Always do this';

export function outsidePickItems(platform: string): PickItem[] {
  return [
    { choice: 'addToWorkspace', label: 'Add to Workspace' },
    { choice: 'newWindow', label: 'Open in New Window' },
    { choice: 'revealInOS', label: revealLabel(platform) },
  ];
}

export type RevealOutcome = OutsideChoice | 'revealed' | 'dismissed';

export async function revealRepository(root: string, name: string, port: ExplorerRevealPort, platform: string): Promise<RevealOutcome> {
  if (port.insideWorkspace(root)) {
    if (port.collapseBeforeReveal()) await port.collapseExplorerFolders();
    await port.revealInExplorer(root);
    return 'revealed';
  }
  const setting = port.outsideWorkspace();
  let choice: OutsideChoice;
  if (setting === 'addToWorkspace' || setting === 'newWindow' || setting === 'revealInOS') {
    choice = setting;
  } else {
    const picked = await port.pick(outsidePickItems(platform), `${name} is not in a workspace folder`);
    if (!picked) return 'dismissed';
    if (picked.always) await port.writeOutsideWorkspace(picked.choice);
    choice = picked.choice;
  }
  switch (choice) {
    case 'addToWorkspace':
      await port.addToWorkspace(root);
      await port.revealInExplorer(root);
      break;
    case 'newWindow':
      await port.openInNewWindow(root);
      break;
    case 'revealInOS':
      await port.revealInOS(root);
      break;
  }
  return choice;
}
