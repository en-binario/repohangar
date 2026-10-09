// Chooses the remote that stands for a repository (repo-registry: Remote chosen for a repository). No vscode import.

export interface RemoteEntry {
  name: string;
  fetchUrl?: string;
  pushUrl?: string;
}

export interface ChosenRemote {
  name: string;
  url: string;
}

/**
 * The remote of the current branch's upstream when it is one of the remotes, else `origin`, else the first remote.
 * The fetch URL is used, or the push URL when there is no fetch URL.
 */
export function chooseRemote(remotes: readonly RemoteEntry[], upstreamRemote: string | undefined): ChosenRemote | null {
  const remote =
    (upstreamRemote === undefined ? undefined : remotes.find((r) => r.name === upstreamRemote)) ??
    remotes.find((r) => r.name === 'origin') ??
    remotes[0];
  if (!remote) return null;
  const url = remote.fetchUrl ?? remote.pushUrl;
  if (url === undefined) return null;
  return { name: remote.name, url };
}
