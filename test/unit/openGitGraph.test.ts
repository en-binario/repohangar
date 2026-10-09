// explorer-open-in-git-graph :: Open Git Graph matrix (R1–R4).

import { describe, expect, it } from 'vitest';
import { GIT_GRAPH_VIEW_COMMAND, openGitGraph, type OpenGitGraphPort } from '../../src/integrations/openGitGraph';

const LEDGER = '/ws/acme/backend/ledger';

interface Recorded {
  views: (string | undefined)[];
  warnings: string[];
  errors: string[];
  logs: string[];
  activated: number;
}

function port(options: { registered: boolean; rootAccepted: boolean }): [OpenGitGraphPort, Recorded] {
  const recorded: Recorded = { views: [], warnings: [], errors: [], logs: [], activated: 0 };
  let registered = false;
  return [
    {
      findRepoRoot: async (path) => (path.startsWith(LEDGER) ? LEDGER : null),
      activateGitGraph: async () => {
        recorded.activated++;
        registered = options.registered;
      },
      registeredCommands: async () => (registered ? ['git.fetch', GIT_GRAPH_VIEW_COMMAND] : ['git.fetch']),
      view: async (root) => {
        if (root !== undefined && !options.rootAccepted) throw new Error('Cannot read properties of undefined');
        recorded.views.push(root);
      },
      display: (path) => path.replace('/ws/', ''),
      warn: (text) => recorded.warnings.push(text),
      error: (text) => recorded.errors.push(text),
      log: (message) => recorded.logs.push(message),
    },
    recorded,
  ];
}

describe('Open Git Graph matrix', () => {
  it('R1 a folder outside every repository opens nothing and warns', async () => {
    const [p, r] = port({ registered: true, rootAccepted: true });
    expect(await openGitGraph('/ws/acme/docs', p)).toEqual({ opened: false, reason: 'notInRepository' });
    expect(r.views).toEqual([]);
    expect(r.warnings).toEqual(['Cannot open Git Graph: "acme/docs" is not in a Git repository.']);
    expect(r.errors).toEqual([]);
  });

  it('R2 git-graph.view not registered after activation opens nothing and shows the error', async () => {
    const [p, r] = port({ registered: false, rootAccepted: true });
    expect(await openGitGraph(LEDGER, p)).toEqual({ opened: false, reason: 'gitGraphMissing' });
    expect(r.activated).toBe(1);
    expect(r.views).toEqual([]);
    expect(r.errors).toEqual(['The Git Graph extension (mhutchie.git-graph) is required to open Git Graph.']);
  });

  it.each([
    ['the repository root', LEDGER],
    ['a subfolder', `${LEDGER}/src/main`],
  ])('R3 opens Git Graph on the repository root from %s', async (_name, target) => {
    const [p, r] = port({ registered: true, rootAccepted: true });
    expect(await openGitGraph(target, p)).toEqual({ opened: true, root: LEDGER, switched: true });
    expect(r.views).toEqual([LEDGER]);
    expect([...r.warnings, ...r.errors, ...r.logs]).toEqual([]);
  });

  it('R4 falls back to git-graph.view without arguments and logs that the repository must be picked', async () => {
    const [p, r] = port({ registered: true, rootAccepted: false });
    expect(await openGitGraph(LEDGER, p)).toEqual({ opened: true, root: LEDGER, switched: false });
    expect(r.views).toEqual([undefined]);
    expect([...r.warnings, ...r.errors]).toEqual([]);
    expect(r.logs).toHaveLength(1);
    expect(r.logs[0]).toContain("must be picked in Git Graph's Repo dropdown");
  });
});
