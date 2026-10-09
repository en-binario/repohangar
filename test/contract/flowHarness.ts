// A create flow against msw: rows, a Git port that records pushes, in-memory user stores and settings.

import { CreateFlow, type CreateFlowPort, type MrSettings } from '../../src/mr/create';
import { mergeScopes, type RawProfiles } from '../../src/mr/profiles';
import { readRules } from '../../src/mr/rules';
import { Http } from '../../src/providers/http';
import { ProviderFactory, type ProjectInfo, type UserStores } from '../../src/providers/provider';
import type { RowData } from '../../src/shared/model';
import { row } from '../unit/rows';

export const GL_TOKEN = 'glpat-x1y2';
export const GH_TOKEN = 'gho_abc';

export function billing(overrides: Partial<RowData> = {}): RowData {
  return row({
    id: 'billing',
    name: 'billing-api',
    provider: 'gitlab',
    hosted: { host: 'git.acme.com', projectPath: 'payments/billing-api', webUrl: 'https://git.acme.com/payments/billing-api' },
    head: { kind: 'branch', name: 'feature/ABC-12-notes' },
    headSha: 'c3d4e5f',
    defaultBranch: 'main',
    ...overrides,
  });
}

export function webShop(overrides: Partial<RowData> = {}): RowData {
  return row({
    id: 'web',
    name: 'web-shop',
    provider: 'github',
    hosted: { host: 'github.com', projectPath: 'acme/web-shop', webUrl: 'https://github.com/acme/web-shop' },
    head: { kind: 'branch', name: 'feature/ABC-12-notes', upstream: 'origin/feature/ABC-12-notes', ahead: 0, behind: 0 },
    headSha: 'c3d4e5f',
    defaultBranch: 'main',
    ...overrides,
  });
}

export function memoryStores(singleReviewerHosts: string[] = []): UserStores & { ids: Map<string, number>; single: Set<string> } {
  const ids = new Map<string, number>();
  const single = new Set(singleReviewerHosts);
  return {
    ids,
    single,
    userId: (host, name) => ids.get(`${host} ${name}`),
    setUserId: (host, name, id) => void ids.set(`${host} ${name}`, id),
    singleReviewer: (host) => single.has(host),
    setSingleReviewer: (host) => void single.add(host),
  };
}

export interface Harness {
  flow: CreateFlow;
  pushes: { id: string; publish: boolean }[];
  pushOptionArgs: string[][];
  stores: ReturnType<typeof memoryStores>;
}

export function harness(
  rows: RowData[],
  options: {
    user?: RawProfiles;
    rules?: unknown;
    credentials?: Record<string, string>;
    commits?: string[] | undefined;
    remoteBranches?: string[];
    me?: string;
    pushError?: Error;
    pushOutput?: string;
    usePushOptions?: MrSettings['usePushOptions'];
    stores?: ReturnType<typeof memoryStores>;
  } = {},
): Harness {
  const http = new Http();
  const factory = new ProviderFactory(http);
  const pushes: Harness['pushes'] = [];
  const pushOptionArgs: string[][] = [];
  const stores = options.stores ?? memoryStores();
  const credentials = options.credentials ?? { 'git.acme.com': GL_TOKEN, 'github.com': GH_TOKEN };
  const apiHost = (host: string) => (host === 'github.com' ? 'api.github.com' : host);
  const infos = new Map<string, ProjectInfo | undefined>();
  const port: CreateFlowPort = {
    row: (id) => rows.find((r) => r.id === id),
    root: () => '/nowhere',
    settings: () => ({
      profiles: mergeScopes(options.user ?? {}, undefined),
      rules: readRules(options.rules ?? []),
      usePushOptions: options.usePushOptions ?? 'whenNoToken',
    }),
    credential: async (host) => (credentials[host] ? { token: credentials[host] as string, apiHost: apiHost(host) } : undefined),
    provider: (kind, host, webUrl) => factory.get(kind, host, new URL(webUrl).origin),
    projectInfo: async (id) => {
      if (infos.has(id)) return infos.get(id);
      const r = rows.find((x) => x.id === id);
      if (!r?.hosted || (r.provider !== 'gitlab' && r.provider !== 'github')) return undefined;
      const token = credentials[r.hosted.host];
      const info = await factory
        .get(r.provider, r.hosted.host, new URL(r.hosted.webUrl).origin)
        .projectInfo(r.hosted.projectPath, { token: token as string, apiHost: apiHost(r.hosted.host) })
        .catch(() => undefined);
      infos.set(id, info);
      return info;
    },
    me: async () => options.me ?? 'ana.perez',
    stores,
    files: { readFile: async () => undefined, list: async () => [] },
    git: {
      remoteBranches: async () => options.remoteBranches ?? ['main'],
      commitsAhead: async () => ('commits' in options ? options.commits : ['Add notes field to invoice', 'Expose notes in PDF']),
      push: async (id, publish) => {
        pushes.push({ id, publish });
        if (options.pushError) throw options.pushError;
      },
      pushWithOptions: async (_id, args) => {
        pushOptionArgs.push(args);
        if (options.pushError) throw options.pushError;
        return options.pushOutput ?? '';
      },
    },
  };
  return { flow: new CreateFlow(port), pushes, pushOptionArgs, stores };
}
