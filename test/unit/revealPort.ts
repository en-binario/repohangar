import type { ExplorerRevealPort, OutsideChoice, PickItem } from '../../src/integrations/reveal';

export interface FakeExplorer {
  port: ExplorerRevealPort;
  /** Port calls in order, as `name(argument)` */
  calls: string[];
  /** The items the quick pick offered, or undefined when it was not shown */
  offered: PickItem[] | undefined;
}

/** A reveal port that records its calls; `answer` is what the user does in the quick pick. */
export function fakeExplorer(options: {
  inside: boolean;
  collapse?: boolean;
  outsideWorkspace?: string;
  answer?: { choice: OutsideChoice; always: boolean };
}): FakeExplorer {
  const fake: FakeExplorer = { calls: [], offered: undefined, port: undefined as unknown as ExplorerRevealPort };
  const call = (name: string) => async (arg?: string) => {
    fake.calls.push(arg === undefined ? name : `${name}(${arg})`);
  };
  fake.port = {
    insideWorkspace: () => options.inside,
    collapseBeforeReveal: () => options.collapse ?? false,
    outsideWorkspace: () => options.outsideWorkspace ?? 'ask',
    collapseExplorerFolders: call('workbench.files.action.collapseExplorerFolders'),
    revealInExplorer: call('revealInExplorer'),
    addToWorkspace: call('workspace.updateWorkspaceFolders'),
    openInNewWindow: call('vscode.openFolder'),
    revealInOS: call('revealFileInOS'),
    pick: async (items) => {
      fake.offered = items;
      return options.answer;
    },
    writeOutsideWorkspace: async (value) => {
      fake.calls.push(`setting(${value})`);
    },
  };
  return fake;
}
