// Selecting a repository in the Source Control Repositories view, ported from Git Graph Opener
// (source-control-selection-sync; design D-1). VS Code has no API for it, so the sync toggles the internal
// per-repository commands and confirms the result through `repository.ui`. No vscode import.

export const TOGGLE_COMMAND_PREFIX = 'workbench.scm.action.toggleRepositoryVisibility.scm';
export const CONFIRM_TIMEOUT_MS = 500;

export function parseToggleHandles(commandIds: readonly string[]): number[] {
  const handles: number[] = [];
  for (const id of commandIds) {
    if (!id.startsWith(TOGGLE_COMMAND_PREFIX)) continue;
    const suffix = id.slice(TOGGLE_COMMAND_PREFIX.length);
    if (/^\d+$/.test(suffix)) handles.push(Number(suffix));
  }
  return handles.sort((a, b) => a - b);
}

export const INPUT_BOX_SCHEME = 'vscode-scm';

/**
 * Reads the handle and repository root URI from a Source Control input box document, whose URI looks like
 * `vscode-scm:git/scm<handle>/input?rootUri=<uri>`. The query is the URI object's raw query, where `rootUri` is still
 * percent-encoded.
 */
export function parseInputBoxUri(scheme: string, uriPath: string, query: string): { handle: number; rootUri: string } | undefined {
  const match = /\/?scm(\d+)\/input$/.exec(uriPath);
  if (scheme !== INPUT_BOX_SCHEME || match === null) return undefined;
  const encoded = query
    .split('&')
    .find((part) => part.startsWith('rootUri='))
    ?.slice('rootUri='.length);
  if (!encoded) return undefined;
  try {
    return { handle: Number(match[1]), rootUri: decodeURIComponent(encoded) };
  } catch {
    return undefined;
  }
}

export interface CandidateInput {
  readonly handles: readonly number[];
  readonly repositoryRoots: readonly string[];
  readonly mappings: ReadonlyMap<number, string>;
  readonly target: string;
  readonly selected?: string;
}

export function orderCandidates({ handles, repositoryRoots, mappings, target, selected }: CandidateInput): number[] {
  const candidates: number[] = [];
  for (const handle of handles) {
    if (mappings.get(handle) === target) candidates.push(handle);
  }
  if (handles.length === repositoryRoots.length) {
    const ranked = handles[repositoryRoots.indexOf(target)];
    if (ranked !== undefined && !candidates.includes(ranked) && !mappings.has(ranked)) candidates.push(ranked);
  }
  // Toggling the selected repository's handle hides it and loses focus, which ends probing, so try its likely handle last.
  const selectedIndex = selected === undefined ? -1 : repositoryRoots.indexOf(selected);
  const likelySelected = selectedIndex === -1 ? undefined : handles[selectedIndex];
  for (const handle of handles) {
    if (handle !== likelySelected && !candidates.includes(handle) && !mappings.has(handle)) candidates.push(handle);
  }
  if (likelySelected !== undefined && !candidates.includes(likelySelected) && !mappings.has(likelySelected)) {
    candidates.push(likelySelected);
  }
  return candidates;
}

export interface SourceControlPort {
  listToggleHandles(): Promise<number[]>;
  revealSourceControlBriefly(): Promise<void>;
  /** Handles whose repository root is known from the Source Control input box documents. Empty when unavailable. */
  inputBoxHandles(): Map<number, string>;
  /** Runs the toggle command and resolves to whether a selection change was observed within the timeout. */
  toggle(handle: number, timeoutMs: number): Promise<boolean>;
  selectedRoot(): string | undefined;
  repositoryRoots(): string[];
}

export type SelectionResult = 'alreadySelected' | 'selected' | 'notConfirmed' | 'commandsUnavailable';

export class SourceControlSelection {
  private readonly mappings = new Map<number, string>();
  private revealed = false;

  constructor(private readonly log: (message: string) => void) {}

  async select(target: string, port: SourceControlPort): Promise<SelectionResult> {
    if (port.selectedRoot() === target) return 'alreadySelected';

    let handles = await port.listToggleHandles();
    if (handles.length === 0 && !this.revealed) {
      this.revealed = true;
      await port.revealSourceControlBriefly();
      handles = await port.listToggleHandles();
    }
    if (handles.length === 0) {
      this.log('Source Control selection commands are not registered; cannot select the repository.');
      return 'commandsUnavailable';
    }

    for (const handle of [...this.mappings.keys()]) {
      if (!handles.includes(handle)) this.mappings.delete(handle);
    }

    // Input box documents name each handle's repository, so the target's handle can be toggled without guessing.
    const exact = new Set<number>();
    for (const [handle, root] of port.inputBoxHandles()) {
      if (handles.includes(handle)) {
        this.remember(handle, root);
        exact.add(handle);
      }
    }

    const candidates = orderCandidates({
      handles,
      repositoryRoots: port.repositoryRoots(),
      mappings: this.mappings,
      target,
      selected: port.selectedRoot(),
    });
    for (const handle of candidates) {
      const previous = port.selectedRoot();
      if (await port.toggle(handle, CONFIRM_TIMEOUT_MS)) {
        const current = port.selectedRoot();
        if (current !== undefined) this.remember(handle, current);
        if (current === target) return 'selected';
        continue;
      }
      if (exact.has(handle)) {
        // The handle is known to be the target's, so no repository had focus to report the change. Toggling again could undo it.
        this.log(`Selecting "${target}" in Source Control was not confirmed (no selection change after toggling its handle ${handle}).`);
        return 'notConfirmed';
      }
      // No focus change: the handle most likely belonged to the selected repository, which is now hidden.
      if (previous !== undefined) this.remember(handle, previous);
      await port.toggle(handle, 0);
      this.log(`Selecting "${target}" in Source Control was not confirmed (no selection change after toggling handle ${handle}).`);
      return 'notConfirmed';
    }

    this.log(`Selecting "${target}" in Source Control was not confirmed (no remaining selection command matched).`);
    return 'notConfirmed';
  }

  private remember(handle: number, root: string): void {
    for (const [otherHandle, otherRoot] of this.mappings) {
      if (otherRoot === root && otherHandle !== handle) this.mappings.delete(otherHandle);
    }
    this.mappings.set(handle, root);
  }
}

export interface SyncEnvironment {
  readonly syncEnabled: boolean;
  readonly selectionMode: string;
  readonly gitAvailable: boolean;
  /** Opens the repository in the Git extension if needed and returns its root as the Git extension reports it. */
  openRepository(root: string): Promise<string | undefined>;
  readonly port: SourceControlPort;
  log(message: string): void;
}

export type SyncResult =
  | SelectionResult
  | 'gitGraphNotOpened'
  | 'disabled'
  | 'notSingleMode'
  | 'gitUnavailable'
  | 'repositoryNotOpened'
  | 'failed';

/**
 * Selects `root` in Source Control after a graph action opened the graph. `force` syncs whatever
 * `repohangar.gitGraph.syncSourceControlSelection` is: Show in Source Control and the Source Control Graph use it.
 */
export async function syncSourceControlSelection(
  graphOpened: boolean,
  root: string,
  env: SyncEnvironment,
  selection: SourceControlSelection,
  force = false,
): Promise<SyncResult> {
  if (!graphOpened) return 'gitGraphNotOpened';
  if (!env.syncEnabled && !force) return 'disabled';
  if (env.selectionMode !== 'single') return 'notSingleMode';
  if (!env.gitAvailable) {
    env.log('The built-in Git extension is unavailable or disabled; Source Control selection not synced.');
    return 'gitUnavailable';
  }
  try {
    const gitRoot = await env.openRepository(root);
    if (gitRoot === undefined) {
      env.log(`The Git extension could not open "${root}"; Source Control selection not synced.`);
      return 'repositoryNotOpened';
    }
    return await selection.select(gitRoot, env.port);
  } catch (error) {
    env.log(`Syncing the Source Control selection failed: ${error instanceof Error ? error.message : String(error)}`);
    return 'failed';
  }
}
