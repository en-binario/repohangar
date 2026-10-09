// Runs the integration suites in VS Code: one VS Code session per fixture.
// Usage: npm run test:integration [-- --session=<name>]

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';
import { createMainFixture, createManyFixture, type Fixture } from './fixtures/repos';

const sessions: Record<string, () => Fixture> = {
  main: () => createMainFixture(),
  gitDisabled: () => createManyFixture(2, { 'git.enabled': false }),
  perf: () => createManyFixture(50),
};

async function main(): Promise<void> {
  // Set when this runs from a VS Code terminal or extension host; it would start the test VS Code as plain Node.
  delete process.env.ELECTRON_RUN_AS_NODE;
  const only = process.argv.find((a) => a.startsWith('--session='))?.slice('--session='.length);
  const extensionDevelopmentPath = resolve(__dirname, '../../..');
  const vscodeExecutablePath = await downloadAndUnzipVSCode(process.env.VSCODE_VERSION ?? 'stable');
  let failed = false;
  for (const [name, create] of Object.entries(sessions)) {
    if (only && only !== name) continue;
    const fixture = create();
    const profile = mkdtempSync(join(tmpdir(), 'repohangar-profile-'));
    console.log(`\n=== Session ${name}: ${fixture.workspaceFile}`);
    try {
      await runTests({
        vscodeExecutablePath,
        extensionDevelopmentPath,
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
