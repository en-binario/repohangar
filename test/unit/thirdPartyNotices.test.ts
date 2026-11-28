import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

/** SPDX licenses approved for runtime dependencies shipped in the MIT-licensed VSIX. */
const APPROVED_RUNTIME_LICENSES = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
  'CC-BY-4.0',
]);

interface LockPackage {
  version?: string;
  license?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function collectRuntimePackages(
  rootDeps: Record<string, string>,
  packages: Record<string, LockPackage>,
): Map<string, LockPackage> {
  const visited = new Map<string, LockPackage>();
  const queue = Object.keys(rootDeps);
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (visited.has(name)) continue;
    const entry = packages[`node_modules/${name}`];
    if (!entry) throw new Error(`Runtime dependency "${name}" not found in package-lock.json`);
    visited.set(name, entry);
    for (const transitive of Object.keys({ ...entry.dependencies, ...entry.optionalDependencies })) {
      if (!visited.has(transitive)) queue.push(transitive);
    }
  }
  return visited;
}

describe('packaged extension legal and compliance hygiene', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    icon?: string;
    license?: string;
    publisher?: string;
    dependencies?: Record<string, string>;
    capabilities?: { untrustedWorkspaces?: { supported?: boolean } };
  };
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as {
    packages: Record<string, LockPackage>;
  };
  const notices = readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  const license = readFileSync(join(ROOT, 'LICENSE'), 'utf8');
  const vscodeignore = readFileSync(join(ROOT, '.vscodeignore'), 'utf8');
  const gitDts = readFileSync(join(ROOT, 'src', 'git', 'git.d.ts'), 'utf8');
  const runtimePackages = collectRuntimePackages(pkg.dependencies ?? {}, lock.packages);

  it('documents every direct and transitive runtime dependency in THIRD_PARTY_NOTICES.md', () => {
    for (const dep of runtimePackages.keys()) {
      expect(notices, `missing notice heading for ${dep}`).toMatch(new RegExp(`^#{2,3} ${dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
    }
    expect(vscodeignore).toContain('!THIRD_PARTY_NOTICES.md');
  });

  it('allows only MIT-compatible or attributed asset licenses in bundled runtime dependencies', () => {
    for (const [dep, entry] of runtimePackages) {
      expect(entry.license, `missing license metadata for ${dep}`).toBeTruthy();
      expect(
        APPROVED_RUNTIME_LICENSES.has(entry.license!),
        `unapproved runtime license "${entry.license}" for ${dep}`,
      ).toBe(true);
    }
  });

  it('satisfies CC-BY-4.0 attribution, unmodified status and warranty notice for @vscode/codicons', () => {
    expect(notices).toContain('https://creativecommons.org/licenses/by/4.0/legalcode');
    expect(notices).toContain('Microsoft Corporation');
    expect(notices).toMatch(/distributed unmodified/i);
    expect(notices).toMatch(/disclaimer of warranties/i);
  });

  it('retains upstream copyright header on src/git/git.d.ts and attributes it in THIRD_PARTY_NOTICES.md', () => {
    expect(gitDts).toContain('Copyright (c) Microsoft Corporation');
    expect(gitDts).toContain('MIT License');
    expect(notices).toContain('src/git/git.d.ts');
    expect(notices).toContain('https://github.com/microsoft/vscode');
  });

  it('ships the MIT LICENSE file and declares consistent manifest metadata', () => {
    expect(pkg.license).toBe('MIT');
    expect(pkg.publisher).toBe('enbinario');
    expect(pkg.capabilities?.untrustedWorkspaces?.supported).toBe(false);
    expect(license).toContain('MIT License');
    expect(license).toContain('Copyright (c) 2026 Jhon Tapia - enbinario.com');
    expect(vscodeignore).toContain('!LICENSE');
  });

  it('ships the PNG extension icon declared in package.json', () => {
    expect(pkg.icon).toBeTruthy();
    expect(pkg.icon!.endsWith('.png')).toBe(true);
    expect(existsSync(join(ROOT, pkg.icon!))).toBe(true);
    expect(vscodeignore).toContain(`!${pkg.icon!}`);
  });
});
