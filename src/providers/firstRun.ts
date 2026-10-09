// The first-run hosts panel (provider-auth: First-run hosts panel, W10). Pure; no vscode import.

import { compareNames } from '../shared/format';
import type { FirstRunButton, FirstRunPanel, RowData } from '../shared/model';
import type { CredentialSource } from './authOrder';
import type { HostState } from './reviewInfo';

export interface HostAccount {
  state: HostState;
  account?: { username: string; source: CredentialSource };
}

const SOURCE: Record<CredentialSource, string> = {
  session: 'VS Code account',
  glab: 'glab login',
  gh: 'gh login',
  token: 'token',
};

/** The panel, or undefined when no listed repository is on a GitLab or GitHub host. */
export function firstRunModel(rows: readonly RowData[], accounts: (host: string) => HostAccount): FirstRunPanel | undefined {
  const hosts = new Map<string, { provider: 'gitlab' | 'github'; count: number }>();
  let local = 0;
  for (const row of rows) {
    if ((row.provider === 'gitlab' || row.provider === 'github') && row.hosted) {
      const entry = hosts.get(row.hosted.host) ?? { provider: row.provider, count: 0 };
      entry.count++;
      hosts.set(row.hosted.host, entry);
    } else if (row.provider === null) {
      local++;
    }
  }
  if (hosts.size === 0) return undefined;
  const ordered = [...hosts.entries()].sort((a, b) => b[1].count - a[1].count || compareNames(a[0], b[0]));
  const parts = ordered.map(([host, e]) => `${e.count} on ${host} (${e.provider === 'gitlab' ? 'GitLab' : 'GitHub'})`);
  if (local > 0) parts.push(`${local} local only`);
  const n = rows.length;
  return {
    summary: `Found ${n} ${n === 1 ? 'repository' : 'repositories'}: ${parts.join(' · ')}`,
    hosts: ordered.map(([host, e]) => hostLine(host, e.provider, accounts(host))),
  };
}

export function hostLine(host: string, provider: 'gitlab' | 'github', account: HostAccount): FirstRunPanel['hosts'][number] {
  if (account.state === 'credential' && account.account) {
    return { host, line: `${host}  ✓ Signed in as ${account.account.username} (${SOURCE[account.account.source]})`, buttons: [] };
  }
  if (account.state === 'pending') return { host, line: `${host}  … Checking`, buttons: [] };
  if (account.state === 'skipped') return { host, line: `${host}  — Skipped (git only)`, buttons: [] };
  const buttons: FirstRunButton[] = host === 'github.com' && provider === 'github' ? ['signInGitHub', 'skip'] : ['pasteToken', 'skip'];
  return { host, line: `${host}  ○ Not connected`, buttons };
}
