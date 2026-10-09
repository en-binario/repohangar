// Runs the integration suites in VS Code: one VS Code session per fixture.
// Usage: npm run test:integration [-- --session=<name>]

import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';
import { createMainFixture, createManyFixture, type Fixture } from './fixtures/repos';

interface Session {
  fixture: Fixture;
  /** Written to the user settings.json before VS Code starts */
  userSettings?: Record<string, unknown>;
}

const ROOT = resolve(__dirname, '../../..');

/** The Git Graph Opener release the gitGraph session installs (git-graph-opener-migration: Git Graph Opener installed). */
export const LEGACY_OPENER_VSIX = join(ROOT, 'test', 'integration', 'fixtures', 'git-graph-opener-0.1.0.vsix');

/** The Git Graph release the gitGraph session installs (the contract tests pin its `git-graph.view` argument). */
const GIT_GRAPH_VERSION = '1.30.0';

/**
 * Downloads the Git Graph VSIX once into .vscode-test. The suites install it from the file, because VS Code asks
 * whether to trust a Marketplace publisher in a dialog that tests cannot answer.
 */
async function gitGraphVsix(): Promise<string> {
  const file = join(ROOT, '.vscode-test', `mhutchie.git-graph-${GIT_GRAPH_VERSION}.vsix`);
  if (existsSync(file)) return file;
  const url = `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/mhutchie/vsextensions/git-graph/${GIT_GRAPH_VERSION}/vspackage`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Downloading Git Graph failed: ${response.status} ${response.statusText}`);
  mkdirSync(join(ROOT, '.vscode-test'), { recursive: true });
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

const sessions: Record<string, () => Session> = {
  main: () => ({ fixture: createMainFixture() }),
  gitDisabled: () => ({ fixture: createManyFixture(2, { 'git.enabled': false }) }),
  perf: () => ({ fixture: createManyFixture(50) }),
  // Starts without Git Graph; the suites install the mhutchie.git-graph and Git Graph Opener VSIXs into this session's
  // extensions folder while the window is open.
  gitGraph: () => ({ fixture: createMainFixture() }),
  // The old gitGraphOpener.* keys at user, workspace and workspace folder (acme) scope before the first activation.
  migration: () => {
    const fixture = createManyFixture(2, {
      'gitGraphOpener.contextMenu.showOn': 'allFolders',
      'gitGraphOpener.sourceControl.syncSelection': false,
    });
    mkdirSync(join(fixture.workspace, '.vscode'), { recursive: true });
    writeFileSync(join(fixture.workspace, '.vscode', 'settings.json'), JSON.stringify({ 'gitGraphOpener.sourceControl.reveal': false }, null, 2));
    return {
      fixture,
      userSettings: { 'gitGraphOpener.repositoryScanDepth': 5, 'gitGraphOpener.sourceControl.syncSelection': false },
    };
  },
};

async function main(): Promise<void> {
  // Set when this runs from a VS Code terminal or extension host; it would start the test VS Code as plain Node.
  delete process.env.ELECTRON_RUN_AS_NODE;
  const only = process.argv.find((a) => a.startsWith('--session='))?.slice('--session='.length);
  const vscodeExecutablePath = await downloadAndUnzipVSCode(process.env.VSCODE_VERSION ?? 'stable');
  const gitGraph = !only || only === 'gitGraph' ? await gitGraphVsix() : '';
  let failed = false;
  for (const [name, create] of Object.entries(sessions)) {
    if (only && only !== name) continue;
    const { fixture, userSettings } = create();
    const profile = mkdtempSync(join(tmpdir(), 'repohangar-profile-'));
    if (userSettings) {
      mkdirSync(join(profile, 'user-data', 'User'), { recursive: true });
      writeFileSync(join(profile, 'user-data', 'User', 'settings.json'), JSON.stringify(userSettings, null, 2));
    }
    console.log(`\n=== Session ${name}: ${fixture.workspaceFile}`);
    try {
      await runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath: ROOT,
        extensionTestsPath: resolve(__dirname, 'suite/index.js'),
        launchArgs: [
          fixture.workspaceFile,
          '--disable-workspace-trust',
          '--skip-welcome',
          '--skip-release-notes',
          `--user-data-dir=${join(profile, 'user-data')}`,
          `--extensions-dir=${join(profile, 'extensions')}`,
        ],
        extensionTestsEnv: {
          REPOHANGAR_SESSION: name,
          REPOHANGAR_FIXTURE_ROOT: fixture.root,
          REPOHANGAR_WORKSPACE: fixture.workspace,
          REPOHANGAR_REMOTES: fixture.remotes,
          REPOHANGAR_LEGACY_OPENER_VSIX: LEGACY_OPENER_VSIX,
          REPOHANGAR_GIT_GRAPH_VSIX: gitGraph,
        },
      });
    } catch (error) {
      console.error(`Session ${name} failed: ${String(error)}`);
      failed = true;
    }
  }
  if (failed) process.exit(1);
}

void main();
