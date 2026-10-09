// Parses a Git remote URL into host, project path and web URL (repo-registry: Remote URL parsing). No vscode import.

export type ParsedRemote =
  | {
      hosted: true;
      /** Lower-cased host name, without port */
      host: string;
      /** Port of an http(s) URL, kept in the web URL */
      port?: number;
      projectPath: string;
      webUrl: string;
      /** The remote URL with the user name and password of an http(s) URL removed */
      displayUrl: string;
    }
  | { hosted: false; displayUrl: string };

const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;
// user@host:path, without "://" and not a Windows drive path (C:/..., C:\...)
const SCP = /^(?:([^@/\\]+)@)?([^:/\\]+):(?!\/\/)(.+)$/;
const WINDOWS_DRIVE = /^[a-z]:[\\/]/i;

/** Removes `user:password@` from http(s) URLs. Other URLs are returned unchanged. */
export function stripCredentials(url: string): string {
  return url.replace(/^(https?:\/\/)[^@/]*@/i, '$1');
}

function cleanPath(path: string): string {
  return path
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
}

function hosted(host: string, rawPath: string, displayUrl: string, port?: number): ParsedRemote {
  const projectPath = cleanPath(rawPath);
  if (!host || !projectPath) return { hosted: false, displayUrl };
  const lowerHost = host.toLowerCase();
  const authority = port === undefined ? lowerHost : `${lowerHost}:${port}`;
  return {
    hosted: true,
    host: lowerHost,
    ...(port === undefined ? {} : { port }),
    projectPath,
    webUrl: `https://${authority}/${projectPath}`,
    displayUrl,
  };
}

export function parseRemoteUrl(url: string): ParsedRemote {
  const trimmed = url.trim();
  const displayUrl = stripCredentials(trimmed);

  if (WINDOWS_DRIVE.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('\\') || trimmed.startsWith('.')) {
    return { hosted: false, displayUrl };
  }

  const scheme = SCHEME.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme) {
    if (!['https', 'http', 'ssh', 'git'].includes(scheme)) return { hosted: false, displayUrl };
    let parsed: URL;
    try {
      parsed = new URL(trimmed.replace(SCHEME, 'http://'));
    } catch {
      return { hosted: false, displayUrl };
    }
    const keepPort = scheme === 'https' || scheme === 'http';
    const port = keepPort && parsed.port ? Number(parsed.port) : undefined;
    return hosted(parsed.hostname, decodeURIComponent(parsed.pathname), displayUrl, port);
  }

  const scp = SCP.exec(trimmed);
  if (scp) return hosted(scp[2] ?? '', scp[3] ?? '', displayUrl);

  return { hosted: false, displayUrl };
}
