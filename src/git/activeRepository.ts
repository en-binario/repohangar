// The repository a command acts on (git-operations: Active repository for commands, design D-7): its argument, the
// active editor's file, the Source Control selection, then a quick pick. Pure over a port; no vscode import.

export interface ListedRoot {
  id: string;
  name: string;
  /** Root path, `Uri.fsPath` */
  path: string;
}

/** A command argument: an Explorer folder or file, or a Source Control repository (by its root path). */
export type CommandArgument = { kind: 'folder'; path: string } | { kind: 'repository'; path: string };

export interface ActiveRepositoryPort {
  roots: readonly ListedRoot[];
  argument?: CommandArgument;
  /** Path of the active editor's file */
  editorPath?: string;
  /** Root path of the repository selected in the Source Control view */
  scmSelection?: string;
  /** Ids of the repositories RepoHangar last acted on in this window, most recent first */
  recent: readonly string[];
  /** Shows the quick pick with the roots in this order; resolves to the chosen id, or undefined when dismissed. */
  pick(roots: ListedRoot[]): Promise<string | undefined>;
}

export type Resolution = { kind: 'repository'; id: string } | { kind: 'notListed'; path: string } | { kind: 'none' };

function normalize(path: string, platform: string): string {
  const slashed = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return platform === 'win32' ? slashed.toLowerCase() : slashed;
}

/** The innermost listed root that contains the path, matched by path segments. */
export function containingRoot(roots: readonly ListedRoot[], path: string, platform: string): ListedRoot | undefined {
  const target = normalize(path, platform);
  let best: ListedRoot | undefined;
  let bestLength = -1;
  for (const root of roots) {
    const prefix = normalize(root.path, platform);
    if ((target === prefix || target.startsWith(`${prefix}/`)) && prefix.length > bestLength) {
      best = root;
      bestLength = prefix.length;
    }
  }
  return best;
}

function rootAt(roots: readonly ListedRoot[], path: string, platform: string): ListedRoot | undefined {
  const target = normalize(path, platform);
  return roots.find((root) => normalize(root.path, platform) === target);
}

/** The quick pick order: the repositories last acted on first, most recent first, then the others by name. */
export function quickPickOrder(roots: readonly ListedRoot[], recent: readonly string[]): ListedRoot[] {
  const rank = (root: ListedRoot) => {
    const i = recent.indexOf(root.id);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  return [...roots].sort((a, b) => {
    const byRecent = rank(a) - rank(b);
    if (byRecent !== 0 && !Number.isNaN(byRecent)) return byRecent;
    const x = a.name.toLowerCase();
    const y = b.name.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

export async function resolveActiveRepository(port: ActiveRepositoryPort, platform: string): Promise<Resolution> {
  const { roots, argument } = port;
  if (argument) {
    const root =
      argument.kind === 'folder' ? containingRoot(roots, argument.path, platform) : rootAt(roots, argument.path, platform);
    return root ? { kind: 'repository', id: root.id } : { kind: 'notListed', path: argument.path };
  }
  const editorRoot = port.editorPath === undefined ? undefined : containingRoot(roots, port.editorPath, platform);
  if (editorRoot) return { kind: 'repository', id: editorRoot.id };
  const selected = port.scmSelection === undefined ? undefined : rootAt(roots, port.scmSelection, platform);
  if (selected) return { kind: 'repository', id: selected.id };
  const picked = await port.pick(quickPickOrder(roots, port.recent));
  return picked === undefined ? { kind: 'none' } : { kind: 'repository', id: picked };
}

/** The notification for an argument outside every listed repository; `display` is the path relative to the workspace. */
export function notListedText(display: string): string {
  return `"${display}" is not in a repository RepoHangar lists.`;
}
