// Builds the extension host bundle, the dashboard and MR profile editor webview bundles and (with --tests) the
// integration tests.
import { context, build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { glob } from 'glob';

const args = new Set(process.argv.slice(2));
const production = args.has('--production');
const watch = args.has('--watch');
const tests = args.has('--tests');

const LICENSE_BANNER = '/* RepoHangar — MIT License. See LICENSE and THIRD_PARTY_NOTICES.md for copyright and third-party license notices. */';

/** @type {import('esbuild').BuildOptions} */
const extension = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  banner: { js: LICENSE_BANNER },
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const webview = {
  entryPoints: { webview: 'webview/main.tsx', profiles: 'webview/profiles.tsx' },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  outdir: 'dist',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  banner: { js: LICENSE_BANNER },
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

async function copyCodicons() {
  await mkdir('dist/codicons', { recursive: true });
  await cp('node_modules/@vscode/codicons/dist/codicon.css', 'dist/codicons/codicon.css');
  await cp('node_modules/@vscode/codicons/dist/codicon.ttf', 'dist/codicons/codicon.ttf');
}

async function buildTests() {
  await rm('out/test', { recursive: true, force: true });
  const entryPoints = [
    'test/integration/runTest.ts',
    'test/integration/suite/index.ts',
    ...(await glob('test/integration/suite/**/*.test.ts', { posix: true })),
  ];
  await build({
    entryPoints,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    outdir: 'out/test/integration',
    outbase: 'test/integration',
    external: ['vscode', 'mocha', '@vscode/test-electron', 'glob'],
    sourcemap: true,
    logLevel: 'warning',
  });
}

if (watch) {
  await copyCodicons();
  const contexts = await Promise.all([context(extension), context(webview)]);
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await rm('dist', { recursive: true, force: true });
  await Promise.all([build(extension), build(webview), copyCodicons()]);
  if (tests) await buildTests();
}
