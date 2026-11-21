import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

describe('packaged extension hygiene', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    icon?: string;
    dependencies?: Record<string, string>;
  };
  const notices = readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  const vscodeignore = readFileSync(join(ROOT, '.vscodeignore'), 'utf8');

  it('documents every runtime dependency in THIRD_PARTY_NOTICES.md', () => {
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      expect(notices, `missing notice for ${dep}`).toContain(`## ${dep}`);
    }
    expect(vscodeignore).toContain('!THIRD_PARTY_NOTICES.md');
  });

  it('ships the PNG extension icon declared in package.json', () => {
    expect(pkg.icon).toBeTruthy();
    expect(pkg.icon!.endsWith('.png')).toBe(true);
    expect(existsSync(join(ROOT, pkg.icon!))).toBe(true);
    expect(vscodeignore).toContain(`!${pkg.icon!}`);
  });
});
