// provider-auth :: GitHub credential matrix (R1–R7), GitLab credential matrix (R1–R4).

import { describe, expect, it } from 'vitest';
import { findCredential, glabToken, type AuthPort, type Validation } from '../../src/providers/authOrder';

interface Setup {
  gheHost?: string;
  session?: { token: string; username: string };
  secret?: string;
  /** Output per command line; a missing entry means the command failed */
  cli?: Record<string, string>;
  validation?: Validation;
}

function port(setup: Setup) {
  const runs: string[] = [];
  const stored: [string, string][] = [];
  const announced: string[] = [];
  const sessions: string[] = [];
  const validated: string[] = [];
  const p: AuthPort = {
    gheHost: setup.gheHost,
    session: async (id) => {
      sessions.push(id);
      return setup.session;
    },
    secret: async () => setup.secret,
    storeSecret: async (host, token) => {
      stored.push([host, token]);
    },
    run: async (command, args) => {
      const line = [command, ...args].join(' ');
      runs.push(line);
      return setup.cli?.[line];
    },
    validate: async (token) => {
      validated.push(token);
      return setup.validation ?? { ok: true, username: 'ana.perez' };
    },
    announce: (text) => announced.push(text),
  };
  return { port: p, runs, stored, announced, sessions, validated };
}

describe('GitHub credential matrix', () => {
  it('R1 uses the VS Code github session on github.com and runs no gh', async () => {
    const t = port({ session: { token: 'gho_session', username: 'luisgomez' }, secret: 'ghp_stored' });
    expect(await findCredential('github.com', 'github', t.port)).toEqual({ token: 'gho_session', source: 'session', username: 'luisgomez' });
    expect(t.sessions).toEqual(['github']);
    expect(t.runs).toEqual([]);
    expect(t.stored).toEqual([]);
  });

  it('R2 finds no credential on github.com without a session and runs no gh', async () => {
    const t = port({ secret: 'ghp_stored', cli: { 'gh auth token --hostname github.com': 'gho_cli' } });
    expect(await findCredential('github.com', 'github', t.port)).toBeUndefined();
    expect(t.runs).toEqual([]);
  });

  it('R3 uses the github-enterprise session for the host of github-enterprise.uri', async () => {
    const t = port({ gheHost: 'github.acme.com', session: { token: 'gho_ghe', username: 'ana' } });
    expect(await findCredential('github.acme.com', 'github', t.port)).toMatchObject({ token: 'gho_ghe', source: 'session' });
    expect(t.sessions).toEqual(['github-enterprise']);
    expect(t.runs).toEqual([]);
  });

  it('R4 uses the stored token of another Enterprise host and runs no gh', async () => {
    const t = port({ secret: 'ghp_stored' });
    expect(await findCredential('github.acme.com', 'github', t.port)).toEqual({ token: 'ghp_stored', source: 'token' });
    expect(t.sessions).toEqual([]);
    expect(t.runs).toEqual([]);
  });

  it('R5 imports and stores the gh token when the host accepts it', async () => {
    const t = port({ cli: { 'gh auth token --hostname github.acme.com': 'gho_cli\n' } });
    expect(await findCredential('github.acme.com', 'github', t.port)).toMatchObject({ token: 'gho_cli', source: 'gh' });
    expect(t.stored).toEqual([['github.acme.com', 'gho_cli']]);
  });

  it('R6 finds no credential when the host answers the gh token with 401', async () => {
    const t = port({ cli: { 'gh auth token --hostname github.acme.com': 'gho_old' }, validation: { ok: false, status: 401 } });
    expect(await findCredential('github.acme.com', 'github', t.port)).toBeUndefined();
    expect(t.stored).toEqual([]);
  });

  it('R7 finds no credential when gh is not installed or fails', async () => {
    const t = port({});
    expect(await findCredential('github.acme.com', 'github', t.port)).toBeUndefined();
    expect(t.runs).toEqual(['gh auth token --hostname github.acme.com']);
    expect(t.stored).toEqual([]);
  });
});

describe('GitLab credential matrix', () => {
  it('R1 uses the stored token and runs no glab and sends no request', async () => {
    const t = port({ secret: 'glpat-stored' });
    expect(await findCredential('git.acme.com', 'gitlab', t.port)).toEqual({ token: 'glpat-stored', source: 'token' });
    expect(t.runs).toEqual([]);
    expect(t.validated).toEqual([]);
    expect(t.announced).toEqual([]);
  });

  it('R2 imports the glab token the host accepts, stores it and announces it', async () => {
    const t = port({ cli: { 'glab config get token --host git.acme.com': 'glpat-x1y2\n' } });
    expect(await findCredential('git.acme.com', 'gitlab', t.port)).toMatchObject({ token: 'glpat-x1y2', source: 'glab' });
    expect(t.stored).toEqual([['git.acme.com', 'glpat-x1y2']]);
    expect(t.announced).toEqual(['Using your glab login for git.acme.com.']);
  });

  it('R3 finds no credential when the host answers the glab token with 401', async () => {
    const t = port({ cli: { 'glab config get token --host git.acme.com': 'glpat-old' }, validation: { ok: false, status: 401 } });
    expect(await findCredential('git.acme.com', 'gitlab', t.port)).toBeUndefined();
    expect(t.stored).toEqual([]);
    expect(t.announced).toEqual([]);
  });

  it('R4 finds no credential and sends no request when glab is missing, prints nothing or fails', async () => {
    const t = port({ cli: { 'glab config get token --host git.acme.com': '' } });
    expect(await findCredential('git.acme.com', 'gitlab', t.port)).toBeUndefined();
    expect(t.validated).toEqual([]);
    expect(t.stored).toEqual([]);
  });
});

describe('glab token from the keyring', () => {
  it('reads the Token line of glab auth status when config get prints nothing', async () => {
    const t = port({
      cli: {
        'glab config get token --host git.acme.com': '',
        'glab auth status --hostname git.acme.com --show-token': 'git.acme.com\n  ✓ Logged in to git.acme.com as ana.perez\n  ✓ Token: glpat-keyring\n',
      },
    });
    expect(await glabToken('git.acme.com', t.port)).toBe('glpat-keyring');
  });

  it('reads the Token found line that glab 1.80 prints', async () => {
    const t = port({
      cli: {
        'glab auth status --hostname git.acme.com --show-token': 'git.acme.com\n  ✓ Logged in to git.acme.com as ana.perez (keyring)\n  ✓ Token found: glpat-keyring180\n',
      },
    });
    expect(await glabToken('git.acme.com', t.port)).toBe('glpat-keyring180');
  });

  it('reads the line that glab 1.121 prints for a token in the configuration file', async () => {
    const t = port({
      cli: {
        'glab auth status --hostname git.acme.com --show-token':
          '  ✓ Token found in configuration file (plaintext): glpat-plain121\n  ! To store this token more securely, run glab auth login --hostname git.acme.com to move it into the operating system keyring.\n',
      },
    });
    expect(await glabToken('git.acme.com', t.port)).toBe('glpat-plain121');
  });

  it('takes the first line of glab config get token, without the notices after it', async () => {
    const t = port({
      cli: { 'glab config get token --host git.acme.com': 'glpat-x1y2\n[glab] Update available: v1.121.0 → v1.122.0.\n' },
    });
    expect(await glabToken('git.acme.com', t.port)).toBe('glpat-x1y2');
    expect(t.runs).toEqual(['glab config get token --host git.acme.com']);
  });

  it('ignores a masked token', async () => {
    const t = port({ cli: { 'glab auth status --hostname git.acme.com --show-token': '  ✓ Token: **************************' } });
    expect(await glabToken('git.acme.com', t.port)).toBeUndefined();
  });
});
