// Static provider detection (repo-registry: Provider from static detection). No vscode import.
// The probe of unknown hosts belongs to the hosting-providers capability.

import type { Provider } from '../shared/model';

export type HostsSetting = Readonly<Record<string, unknown>>;

function hostOf(value: string): string {
  return value.trim().toLowerCase().replace(/:\d+$/, '');
}

function gheHost(gheUri: string | undefined): string | undefined {
  if (!gheUri) return undefined;
  try {
    return new URL(gheUri.includes('://') ? gheUri : `https://${gheUri}`).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Provider of a hosted remote's host: `repohangar.hosts`, then github.com and gitlab.com, then the host of
 * `github-enterprise.uri`, else `unknown`. A repository without a hosted remote (host undefined) has no provider.
 */
export function detectProvider(host: string | undefined, hosts: HostsSetting, gheUri: string | undefined): Provider | null {
  if (host === undefined) return null;
  const h = hostOf(host);
  for (const [key, value] of Object.entries(hosts)) {
    if (hostOf(key) === h && (value === 'gitlab' || value === 'github')) return value;
  }
  if (h === 'github.com') return 'github';
  if (h === 'gitlab.com') return 'gitlab';
  if (gheHost(gheUri) === h) return 'github';
  return 'unknown';
}
