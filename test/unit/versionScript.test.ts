import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bump, check, nextVersion, parseUnreleased } from '../../scripts/version.mjs';

const dirs: string[] = [];

function fixture(opts: { version: string; preview?: boolean; lockVersion?: string; changelog: string }): string {
  const dir = mkdtempSync(join(tmpdir(), 'repohangar-version-'));
  dirs.push(dir);
  const pkg: Record<string, unknown> = { name: 'repohangar', version: opts.version };
  if (opts.preview !== undefined) pkg.preview = opts.preview;
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  const lockVer = opts.lockVersion ?? opts.version;
  writeFileSync(
    join(dir, 'package-lock.json'),
    JSON.stringify({ name: 'repohangar', version: lockVer, packages: { '': { name: 'repohangar', version: lockVer } } }, null, 2) + '\n',
  );
  writeFileSync(join(dir, 'CHANGELOG.md'), opts.changelog);
  return dir;
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('scripts/version.mjs', () => {
  it('parses Unreleased entry kinds and flags invalid ones', () => {
    const ok = parseUnreleased('## Unreleased\n\n- **Added — thing.**\n- **Fixed:** bug.\n');
    expect(ok.errors).toEqual([]);
    expect(ok.entries.map((e) => e.kind)).toEqual(['Added', 'Fixed']);

    const bad = parseUnreleased('## Unreleased\n\n- **Oops:** unknown\n- plain bullet\n');
    expect(bad.errors).toHaveLength(2);
  });

  it('shifts computed levels down before 1.0.0 unless --level is explicit', () => {
    expect(nextVersion('0.0.0', 'minor')).toBe('0.0.1');
    expect(nextVersion('0.0.0', 'major')).toBe('0.1.0');
    expect(nextVersion('0.0.0', 'minor', { explicit: true })).toBe('0.1.0');
    expect(nextVersion('0.4.2', 'major', { explicit: true })).toBe('1.0.0');
    expect(nextVersion('1.2.3', 'minor')).toBe('1.3.0');
  });

  it('check succeeds when versions match and entries are valid', () => {
    const dir = fixture({
      version: '0.1.0',
      changelog: '# Changelog\n\n## Unreleased\n\n- **Added:** feature.\n\n## 0.1.0 — 2026-11-21\n',
    });
    const res = check(dir);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('next 0.1.1 before 1.0');
  });

  it('check fails on lockfile version mismatch', () => {
    const dir = fixture({
      version: '0.1.0',
      lockVersion: '0.0.0',
      changelog: '# Changelog\n\n## Unreleased\n\n## 0.1.0 — 2026-11-21\n',
    });
    const res = check(dir);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('package-lock.json');
  });

  it('bump updates package.json, package-lock.json and CHANGELOG, and removes preview at 1.0.0', () => {
    const dir = fixture({
      version: '0.0.0',
      preview: true,
      changelog: '# Changelog\n\n## Unreleased\n\n- **Added:** dashboard.\n',
    });
    const first = bump(dir, { level: 'minor', date: '2026-11-21' });
    expect(first.code).toBe(0);
    const pkg1 = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    expect(pkg1.version).toBe('0.1.0');
    expect(pkg1.preview).toBe(true);
    expect(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')).toContain('## 0.1.0 — 2026-11-21');

    // Add an entry and bump explicitly to 1.0.0 -> preview removed
    writeFileSync(
      join(dir, 'CHANGELOG.md'),
      readFileSync(join(dir, 'CHANGELOG.md'), 'utf8').replace('## Unreleased', '## Unreleased\n\n- **Added:** stable release.'),
    );
    const major = bump(dir, { level: 'major', date: '2026-12-01' });
    expect(major.code).toBe(0);
    const pkg2 = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    expect(pkg2.version).toBe('1.0.0');
    expect('preview' in pkg2).toBe(false);
    const lock2 = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
    expect(lock2.version).toBe('1.0.0');
    expect(lock2.packages[''].version).toBe('1.0.0');
  });

  it('refuses a requested --level lower than what Unreleased entries require', () => {
    const dir = fixture({
      version: '1.0.0',
      changelog: '# Changelog\n\n## Unreleased\n\n- **Added:** feature.\n\n## 1.0.0 — 2026-11-21\n',
    });
    const res = bump(dir, { level: 'patch', date: '2026-11-21' });
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('below the required minor');
  });
});
