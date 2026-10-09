// The probe of hosts that static detection leaves `unknown`, and the GitLab version check (hosting-providers: Unknown
// host probe, GitLab version warning). No vscode import; storage through a port.

import { HttpError, type Http } from './http';

export const PROBE_TIMEOUT_MS = 5_000;
export const MIN_GITLAB = '17.10.0';

export type ProbedProvider = 'gitlab' | 'github';

/** The provider a host answers as, without credentials, or undefined when neither answer identifies it. */
export async function probeHost(http: Http, origin: string): Promise<ProbedProvider | undefined> {
  try {
    await http.request({ url: `${origin}/api/v4/version`, timeoutMs: PROBE_TIMEOUT_MS });
    return 'gitlab';
  } catch (error) {
    if (error instanceof HttpError && error.kind === 'status' && error.status === 401) return 'gitlab';
  }
  try {
    const answer = await http.request<{ installed_version?: unknown }>({ url: `${origin}/api/v3/meta`, timeoutMs: PROBE_TIMEOUT_MS });
    if (answer.json && typeof answer.json === 'object' && 'installed_version' in answer.json) return 'github';
  } catch {
    // Not GitHub Enterprise either.
  }
  return undefined;
}

export interface ProbeStore {
  get(host: string): ProbedProvider | undefined;
  set(host: string, provider: ProbedProvider): Promise<void>;
}

/** One probe sequence per host at a time; unidentified hosts wait for `forget()` (`repohangar.refresh`). */
export class Prober {
  private readonly running = new Map<string, Promise<ProbedProvider | undefined>>();
  private readonly unidentified = new Set<string>();

  constructor(
    private readonly http: Http,
    private readonly store: ProbeStore,
  ) {}

  known(host: string): ProbedProvider | undefined {
    return this.store.get(host);
  }

  /** Probes the host unless its answer is stored or it was probed in this session without an answer. */
  probe(host: string, origin: string): Promise<ProbedProvider | undefined> {
    const stored = this.store.get(host);
    if (stored) return Promise.resolve(stored);
    if (this.unidentified.has(host)) return Promise.resolve(undefined);
    let running = this.running.get(host);
    if (!running) {
      running = probeHost(this.http, origin).then(async (result) => {
        this.running.delete(host);
        if (result) await this.store.set(host, result);
        else this.unidentified.add(host);
        return result;
      });
      this.running.set(host, running);
    }
    return running;
  }

  /** `repohangar.refresh`: unidentified hosts are probed again. */
  forget(): void {
    this.unidentified.clear();
  }
}

/** -1, 0 or 1; compares the leading `major.minor.patch` numbers (`18.2.1-ee` is 18.2.1). */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => (/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(v.trim()) ?? []).slice(1, 4).map((n) => Number(n ?? 0));
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export interface VersionPort {
  /** The version from `GET /api/v4/version`, or undefined when it cannot be read */
  read(host: string): Promise<string | undefined>;
  /** Whether the warning for this host and version was shown before (`globalState`) */
  warned(host: string, version: string): boolean;
  markWarned(host: string, version: string): Promise<void>;
  warn(text: string): void;
}

/** Reads each GitLab host's version once per session and warns once per host and version below 17.10.0. */
export class VersionCheck {
  private readonly versions = new Map<string, Promise<string>>();

  constructor(private readonly port: VersionPort) {}

  /** The host's version, 17.10.0 when it cannot be read. */
  version(host: string): Promise<string> {
    let running = this.versions.get(host);
    if (!running) {
      running = this.port.read(host).then(async (version) => {
        if (version === undefined) return MIN_GITLAB;
        if (compareVersions(version, MIN_GITLAB) < 0 && !this.port.warned(host, version)) {
          await this.port.markWarned(host, version);
          this.port.warn(`${host} runs GitLab ${version}. RepoHangar supports GitLab 17.10 or later; some merge request details can be missing.`);
        }
        return version;
      });
      this.versions.set(host, running);
    }
    return running;
  }
}
