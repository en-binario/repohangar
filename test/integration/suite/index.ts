// Mocha entry point inside VS Code: runs the test files of the session named by REPOHANGAR_SESSION.

import { resolve } from 'node:path';
import { glob } from 'glob';
import Mocha from 'mocha';

export async function run(): Promise<void> {
  const session = process.env.REPOHANGAR_SESSION ?? 'main';
  const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 60_000 });
  const files = await glob(`${session}/**/*.test.js`, { cwd: __dirname, posix: true });
  // By number: 120-… runs after 95-….
  for (const file of files.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) mocha.addFile(resolve(__dirname, file));
  await new Promise<void>((done, fail) => {
    mocha.run((failures) => (failures > 0 ? fail(new Error(`${failures} tests failed.`)) : done()));
  });
}
