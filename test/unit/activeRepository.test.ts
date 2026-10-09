import { describe, expect, it, vi } from 'vitest';
import {
  containingRoot,
  notListedText,
  resolveActiveRepository,
  type ActiveRepositoryPort,
  type ListedRoot,
} from '../../src/git/activeRepository';

const at = (name: string, path: string): ListedRoot => ({ id: `file://${path}`, name, path });
const billing = at('billing-api', '/home/dev/code/acme/backend/billing-api');
const ledger = at('ledger', '/home/dev/code/acme/backend/ledger');
const webShop = at('web-shop', '/home/dev/code/acme/frontend/web-shop');
const core = at('core', '/home/dev/code/acme/platform/core');
const proto = at('shared-proto', '/home/dev/code/acme/platform/core/vendor/shared-proto');
const roots = [webShop, ledger, billing, core, proto];

function port(overrides: Partial<ActiveRepositoryPort> = {}): ActiveRepositoryPort {
  return { roots, recent: [], pick: vi.fn(async () => undefined), ...overrides };
}

// git-operations :: Active repository matrix
describe('resolveActiveRepository', () => {
  it('R1 resolves an Explorer folder to the repository that contains it', async () => {
    const p = port({ argument: { kind: 'folder', path: '/home/dev/code/acme/backend/billing-api/src' }, editorPath: `${webShop.path}/a.ts`, scmSelection: ledger.path });
    expect(await resolveActiveRepository(p, 'linux')).toEqual({ kind: 'repository', id: billing.id });
  });

  it('R2 reports an Explorer folder in no listed repository', async () => {
    const p = port({ argument: { kind: 'folder', path: '/home/dev/code/acme/docs' }, editorPath: `${webShop.path}/a.ts` });
    expect(await resolveActiveRepository(p, 'linux')).toEqual({ kind: 'notListed', path: '/home/dev/code/acme/docs' });
    expect(notListedText('acme/docs')).toBe('"acme/docs" is not in a repository RepoHangar lists.');
    expect(p.pick).not.toHaveBeenCalled();
  });

  it('R3 uses a Source Control repository as is', async () => {
    const p = port({ argument: { kind: 'repository', path: ledger.path }, editorPath: `${webShop.path}/a.ts` });
    expect(await resolveActiveRepository(p, 'linux')).toEqual({ kind: 'repository', id: ledger.id });
  });

  it('R4 uses the repository of the active editor file', async () => {
    const p = port({ editorPath: `${webShop.path}/src/cart.ts`, scmSelection: ledger.path });
    expect(await resolveActiveRepository(p, 'linux')).toEqual({ kind: 'repository', id: webShop.id });
  });

  it('R5 uses the Source Control selection when the editor file is in no listed repository', async () => {
    expect(await resolveActiveRepository(port({ scmSelection: ledger.path }), 'linux')).toEqual({ kind: 'repository', id: ledger.id });
    const outside = port({ editorPath: '/tmp/notes.md', scmSelection: ledger.path });
    expect(await resolveActiveRepository(outside, 'linux')).toEqual({ kind: 'repository', id: ledger.id });
  });

  it('R6 asks with a quick pick, the repository last acted on first', async () => {
    const pick = vi.fn(async (items: ListedRoot[]) => items[0]?.id);
    const p = port({ recent: [ledger.id, webShop.id], pick });
    expect(await resolveActiveRepository(p, 'linux')).toEqual({ kind: 'repository', id: ledger.id });
    expect(pick.mock.calls[0]?.[0].map((r) => r.name)).toEqual(['ledger', 'web-shop', 'billing-api', 'core', 'shared-proto']);
  });

  it('R7 resolves to nothing when the quick pick is dismissed', async () => {
    expect(await resolveActiveRepository(port(), 'linux')).toEqual({ kind: 'none' });
  });
});

describe('containingRoot', () => {
  it('chooses the innermost root', () => {
    expect(containingRoot(roots, `${proto.path}/proto/a.proto`, 'linux')).toBe(proto);
    expect(containingRoot(roots, `${core.path}/vendor`, 'linux')).toBe(core);
  });

  it('matches whole path segments only', () => {
    expect(containingRoot(roots, '/home/dev/code/acme/backend/billing-api-old/src', 'linux')).toBeUndefined();
  });

  it('ignores case and separators on Windows only', () => {
    const win = at('billing-api', 'C:\\Code\\acme\\billing-api');
    expect(containingRoot([win], 'c:\\code\\ACME\\billing-api\\src', 'win32')).toBe(win);
    expect(containingRoot([billing], '/home/dev/code/acme/backend/Billing-API/src', 'linux')).toBeUndefined();
  });
});
