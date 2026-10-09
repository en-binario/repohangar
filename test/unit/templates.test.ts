// mr-profiles :: Placeholder matrix (R1–R11), Title rendering matrix (R1–R5), Single-commit title matrix (R1–R3),
// Description template matrix (R1–R6), Release branch missing.

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { placeholders, render, renderDescription, renderTarget, renderTitle, type TemplateContext, type TemplateFiles } from '../../src/mr/templates';

const ctx: TemplateContext = {
  branch: 'feature/ABC-123-add-billing-notes',
  repo: 'billing-api',
  defaultBranch: 'main',
  commits: ['Add notes field to invoice', 'Expose notes in PDF'],
  remoteBranches: ['main', 'release/2.9', 'release/2.10', 'feature/ABC-123-add-billing-notes'],
  me: 'ana.perez',
};

describe('Placeholder matrix', () => {
  it.each<[string, string, string]>([
    ['R1 branch', '{branch}', 'feature/ABC-123-add-billing-notes'],
    ['R2 type', '{type}', 'feat'],
    ['R3 ticket', '{ticket}', 'ABC-123'],
    ['R4 branchTitle', '{branchTitle}', 'Add billing notes'],
    ['R5 firstCommit', '{firstCommit}', 'Add notes field to invoice'],
    ['R6 commits', '{commits}', '- Add notes field to invoice\n- Expose notes in PDF'],
    ['R7 repo', '{repo}', 'billing-api'],
    ['R8 defaultBranch', '{defaultBranch}', 'main'],
    ['R9 latestRelease', '{latestRelease}', '2.10'],
    ['R10 me', '{me}', 'ana.perez'],
    ['R11 keeps an unknown placeholder', '{nope}', '{nope}'],
  ])('%s', (_name, template, value) => {
    expect(render(template, placeholders(ctx))).toBe(value);
  });

  it('lists at most 30 commits, then the rest as a count', () => {
    const many = Array.from({ length: 33 }, (_, i) => `Commit ${i + 1}`);
    const lines = render('{commits}', placeholders({ ...ctx, commits: many })).split('\n');
    expect(lines).toHaveLength(31);
    expect(lines[30]).toBe('- … and 3 more');
  });
});

describe('Title rendering matrix', () => {
  it.each<[string, string, Record<string, string> | undefined, string, string]>([
    ['R1 renders the built-in title', 'feature/ABC-123-add-billing-notes', undefined, '{type}: {ticket} {branchTitle}', 'feat: ABC-123 Add billing notes'],
    ['R2 drops an empty ticket and humanizes underscores', 'bugfix/login_timeout', undefined, '{type}: {ticket} {branchTitle}', 'fix: Login timeout'],
    ['R3 keeps a prefix the map does not know', 'docs/ABC-7-readme', undefined, '{type}: {ticket} {branchTitle}', 'docs: ABC-7 Readme'],
    ['R4 removes the leading colon without a prefix', 'add-billing-notes', undefined, '{type}: {ticket} {branchTitle}', 'Add billing notes'],
    ['R5 uses another template and type map', 'feature/ABC-123-add-billing-notes', { feature: 'feature' }, '[{ticket}] {branchTitle}', '[ABC-123] Add billing notes'],
  ])('%s', (_name, branch, typeMap, template, title) => {
    expect(renderTitle(template, { ...ctx, branch, ...(typeMap ? { typeMap } : {}) }, true)).toBe(title);
  });
});

describe('Single-commit title matrix', () => {
  const one = { ...ctx, commits: ['Fix rounding in invoice totals'] };
  it('R1 uses the commit subject when no profile sets the title', () => {
    expect(renderTitle('{type}: {ticket} {branchTitle}', one, false)).toBe('Fix rounding in invoice totals');
  });
  it('R2 renders the template a profile sets', () => {
    expect(renderTitle('{type}: {branchTitle}', one, true)).toBe('feat: Add billing notes');
  });
  it('R3 renders the built-in template with two commits', () => {
    expect(renderTitle('{type}: {ticket} {branchTitle}', ctx, false)).toBe('feat: ABC-123 Add billing notes');
  });
});

function files(contents: Record<string, string>): TemplateFiles {
  return {
    readFile: async (path) => contents[path],
    list: async (folder) =>
      Object.keys(contents)
        .filter((p) => p.startsWith(folder + (folder.includes('\\') ? '\\' : '/')))
        .map((p) => p.slice(folder.length + 1)),
  };
}

const ROOT = join('/home/dev/code/acme/backend/billing-api');
const at = (...parts: string[]) => join(ROOT, ...parts);

describe('Description template matrix', () => {
  it('R1 uses the GitLab Default template and appends the commits', async () => {
    const result = await renderDescription('template:default', ctx, 'gitlab', ROOT, files({ [at('.gitlab', 'merge_request_templates', 'Default.md')]: '## Summary\n' }));
    expect(result).toEqual({ text: '## Summary\n\n- Add notes field to invoice\n- Expose notes in PDF' });
  });

  it('R2 uses the built-in template without a repository template', async () => {
    expect(await renderDescription('template:default', ctx, 'gitlab', ROOT, files({}))).toEqual({
      text: '## What\n- Add notes field to invoice\n- Expose notes in PDF',
    });
  });

  it('R3 renders placeholders of the GitHub template and does not append commits it places', async () => {
    const result = await renderDescription('template:default', ctx, 'github', ROOT, files({ [at('.github', 'pull_request_template.md')]: 'Closes {ticket}\n{commits}' }));
    expect(result).toEqual({ text: 'Closes ABC-123\n- Add notes field to invoice\n- Expose notes in PDF' });
  });

  it('R4 uses the first template by name in .github/PULL_REQUEST_TEMPLATE', async () => {
    const result = await renderDescription(
      'template:default',
      ctx,
      'github',
      ROOT,
      files({ [at('.github', 'PULL_REQUEST_TEMPLATE', 'feature.md')]: 'Feature', [at('.github', 'PULL_REQUEST_TEMPLATE', 'bug.md')]: 'Bug report' }),
    );
    expect(result.text).toBe('Bug report\n\n- Add notes field to invoice\n- Expose notes in PDF');
  });

  it('R5 uses the built-in template with a note for a missing named template', async () => {
    expect(await renderDescription('template:security', ctx, 'gitlab', ROOT, files({}))).toEqual({
      text: '## What\n- Add notes field to invoice\n- Expose notes in PDF',
      note: 'Template "security" not found; using the built-in one.',
    });
  });

  it('R6 renders any other description as a template', async () => {
    expect((await renderDescription('Ticket: {ticket}', ctx, 'github', ROOT, files({}))).text).toBe('Ticket: ABC-123');
  });
});

describe('Release branch missing', () => {
  it('stops with the notification when no release/* branch is known', () => {
    expect(renderTarget('release/{latestRelease}', { ...ctx, remoteBranches: ['main'] }, 'origin', 'hotfix')).toEqual({
      ok: false,
      error: 'No release/* branch of origin is known in billing-api. Fetch it, or change the target of the MR profile "hotfix".',
    });
  });

  it('renders release/2.10 when release branches exist', () => {
    expect(renderTarget('release/{latestRelease}', ctx, 'origin', 'hotfix')).toEqual({ ok: true, target: 'release/2.10' });
  });
});
