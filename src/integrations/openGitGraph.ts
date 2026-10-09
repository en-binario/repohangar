// Opening Git Graph on the repository of a folder (explorer-open-in-git-graph: Open Git Graph, design D-2). Git Graph
// and the notifications are behind a port; no vscode import.

export const GIT_GRAPH_EXTENSION = 'mhutchie.git-graph';
export const GIT_GRAPH_VIEW_COMMAND = 'git-graph.view';

export interface OpenGitGraphPort {
  /** The repository root of a folder, or null outside every repository */
  findRepoRoot(path: string): Promise<string | null>;
  /** Activates Git Graph; Git Graph may still be activating when its command is needed. */
  activateGitGraph(): Promise<void>;
  registeredCommands(): Promise<string[]>;
  /** Runs `git-graph.view`, with `{ rootUri }` of `root` when given. */
  view(root?: string): Promise<void>;
  /** A path as the notifications show it, relative to the workspace */
  display(path: string): string;
  warn(text: string): void;
  error(text: string): void;
  log(message: string): void;
}

export type OpenGitGraphResult =
  | { opened: false; reason: 'notInRepository' | 'gitGraphMissing' }
  | { opened: true; root: string; switched: boolean };

export function notInRepositoryText(display: string): string {
  return `Cannot open Git Graph: "${display}" is not in a Git repository.`;
}

export const GIT_GRAPH_REQUIRED_TEXT = `The Git Graph extension (${GIT_GRAPH_EXTENSION}) is required to open Git Graph.`;

/** Opens Git Graph switched to the repository that contains `target`. */
export async function openGitGraph(target: string, port: OpenGitGraphPort): Promise<OpenGitGraphResult> {
  const root = await port.findRepoRoot(target);
  if (root === null) {
    port.warn(notInRepositoryText(port.display(target)));
    return { opened: false, reason: 'notInRepository' };
  }
  try {
    await port.activateGitGraph();
  } catch (error) {
    port.log(`Activating Git Graph failed: ${describe(error)}`);
  }
  if (!(await port.registeredCommands()).includes(GIT_GRAPH_VIEW_COMMAND)) {
    port.error(GIT_GRAPH_REQUIRED_TEXT);
    return { opened: false, reason: 'gitGraphMissing' };
  }
  try {
    await port.view(root);
    return { opened: true, root, switched: true };
  } catch (error) {
    port.log(
      `Git Graph did not accept the repository "${root}" (${describe(error)}); it opens on its last repository, and the ` +
        "repository must be picked in Git Graph's Repo dropdown.",
    );
  }
  await port.view();
  return { opened: true, root, switched: false };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
