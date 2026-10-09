// The order in which RepoHangar looks for a credential per host (provider-auth: GitHub credentials, GitLab
// credentials; design D-6). Pure over a port; no vscode import.

export type CredentialSource = 'session' | 'token' | 'glab' | 'gh';

export interface FoundCredential {
  token: string;
  source: CredentialSource;
  /** The account name, when known without a request */
  username?: string;
}

export type Validation = { ok: true; username: string } | { ok: false; status?: number };

export interface AuthPort {
  /** The host of `github-enterprise.uri`, lower-cased, or undefined */
  gheHost: string | undefined;
  /** A VS Code session, looked up without prompting */
  session(providerId: 'github' | 'github-enterprise'): Promise<{ token: string; username: string } | undefined>;
  /** The token stored in `SecretStorage` under `repohangar.token.<host>` */
  secret(host: string): Promise<string | undefined>;
  storeSecret(host: string, token: string): Promise<void>;
  /** Runs `glab` or `gh` (execFile, no shell, 10 s); its standard output and error, or undefined when it fails */
  run(command: 'glab' | 'gh', args: string[]): Promise<string | undefined>;
  /** `GET /api/v4/user` (GitLab) or `GET /user` (GitHub) with the token */
  validate(token: string): Promise<Validation>;
  /** Shows a one-time information message */
  announce(text: string): void;
}

/** The VS Code authentication provider of a GitHub host, or undefined when it has none. */
export function sessionProvider(host: string, gheHost: string | undefined): 'github' | 'github-enterprise' | undefined {
  if (host === 'github.com') return 'github';
  if (gheHost !== undefined && host === gheHost) return 'github-enterprise';
  return undefined;
}

export async function findCredential(host: string, provider: 'gitlab' | 'github', port: AuthPort): Promise<FoundCredential | undefined> {
  return provider === 'github' ? findGitHub(host, port) : findGitLab(host, port);
}

async function findGitHub(host: string, port: AuthPort): Promise<FoundCredential | undefined> {
  const sessionId = sessionProvider(host, port.gheHost);
  if (sessionId) {
    const session = await port.session(sessionId);
    if (session) return { token: session.token, source: 'session', username: session.username };
    // github.com uses only the VS Code account; the Enterprise host of `github-enterprise.uri` falls through.
    if (host === 'github.com') return undefined;
  }
  const stored = await port.secret(host);
  if (stored) return { token: stored, source: 'token' };
  const output = await port.run('gh', ['auth', 'token', '--hostname', host]);
  const token = output?.trim().split(/\s+/)[0];
  return token ? imported(host, token, 'gh', port) : undefined;
}

async function findGitLab(host: string, port: AuthPort): Promise<FoundCredential | undefined> {
  const stored = await port.secret(host);
  if (stored) return { token: stored, source: 'token' };
  const token = await glabToken(host, port);
  if (!token) return undefined;
  const found = await imported(host, token, 'glab', port);
  if (found) port.announce(`Using your glab login for ${host}.`);
  return found;
}

/**
 * The token of a `glab` login: `glab config get token --host <host>`, else the `Token:` line of `glab auth status
 * --hostname <host> --show-token`, which newer releases need when the token lives in the OS keyring (design D-6).
 */
export async function glabToken(host: string, port: Pick<AuthPort, 'run'>): Promise<string | undefined> {
  const configured = (await port.run('glab', ['config', 'get', 'token', '--host', host]))?.trim();
  if (configured && !/\s/.test(configured)) return configured;
  const status = await port.run('glab', ['auth', 'status', '--hostname', host, '--show-token']);
  const match = status ? /Token:\s*(\S+)/.exec(status) : null;
  const token = match?.[1];
  return token && !token.startsWith('*') ? token : undefined;
}

/** A CLI token, stored after the host accepted it. */
async function imported(host: string, token: string, source: 'glab' | 'gh', port: AuthPort): Promise<FoundCredential | undefined> {
  const validation = await port.validate(token);
  if (!validation.ok) return undefined;
  await port.storeSecret(host, token);
  return { token, source, username: validation.username };
}
