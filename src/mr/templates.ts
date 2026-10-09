// Title, description and target templates (mr-profiles: Title and description placeholders, Single-commit title,
// Description templates; design D-1, D-3). No vscode import; repository templates are read through a port.

import { join } from 'node:path';

export const DEFAULT_TICKET_PATTERN = '[A-Z][A-Z0-9]+-\\d+';
export const DEFAULT_TYPE_MAP: Readonly<Record<string, string>> = { feature: 'feat', bugfix: 'fix', hotfix: 'fix', chore: 'chore' };
export const BUILT_IN_DESCRIPTION = '## What\n{commits}';
export const MAX_COMMITS = 30;

export interface TemplateContext {
  branch: string;
  repo: string;
  defaultBranch: string;
  /** Subjects of the commits ahead of the target, oldest first */
  commits: string[];
  /** Branch names of the chosen remote, without the remote prefix (`release/2.10`) */
  remoteBranches: string[];
  /** The current user on the host; empty when unknown */
  me: string;
  ticketPattern?: string;
  typeMap?: Readonly<Record<string, string>>;
  /** What `{related}` renders as: the empty section markers in a selection batch, else nothing */
  related?: string;
}

export function ticketOf(branch: string, pattern = DEFAULT_TICKET_PATTERN): string {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    regex = new RegExp(DEFAULT_TICKET_PATTERN);
  }
  return regex.exec(branch)?.[0] ?? '';
}

export function typeOf(branch: string, typeMap: Readonly<Record<string, string>> = DEFAULT_TYPE_MAP): string {
  const i = branch.indexOf('/');
  if (i < 0) return '';
  const prefix = branch.slice(0, i);
  return typeMap[prefix] ?? prefix;
}

/** The branch without its prefix and ticket, words separated by spaces, the first letter upper-case. */
export function branchTitleOf(branch: string, ticket: string): string {
  let rest = branch.includes('/') ? branch.slice(branch.indexOf('/') + 1) : branch;
  if (ticket) rest = rest.replace(ticket, '');
  const words = rest.replace(/[-_/]+/g, ' ').trim().replace(/\s+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The highest `release/<version>` branch, by natural version order (`2.10` > `2.9`), or undefined. */
export function latestRelease(remoteBranches: readonly string[]): string | undefined {
  const versions = remoteBranches.filter((b) => b.startsWith('release/')).map((b) => b.slice('release/'.length));
  const parts = (v: string) => v.split(/[.\-_]/).map((p) => (/^\d+$/.test(p) ? Number(p) : p));
  versions.sort((a, b) => {
    const x = parts(a);
    const y = parts(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const p = x[i] ?? -1;
      const q = y[i] ?? -1;
      if (p === q) continue;
      if (typeof p === 'number' && typeof q === 'number') return p - q;
      return String(p) < String(q) ? -1 : 1;
    }
    return 0;
  });
  return versions[versions.length - 1];
}

export function commitsList(commits: readonly string[]): string {
  const shown = commits.slice(0, MAX_COMMITS).map((s) => `- ${s}`);
  if (commits.length > MAX_COMMITS) shown.push(`- … and ${commits.length - MAX_COMMITS} more`);
  return shown.join('\n');
}

/** The value of every known placeholder. */
export function placeholders(ctx: TemplateContext): Record<string, string> {
  const ticket = ticketOf(ctx.branch, ctx.ticketPattern);
  return {
    branch: ctx.branch,
    type: typeOf(ctx.branch, ctx.typeMap),
    ticket,
    branchTitle: branchTitleOf(ctx.branch, ticket),
    firstCommit: ctx.commits[0] ?? '',
    commits: commitsList(ctx.commits),
    repo: ctx.repo,
    defaultBranch: ctx.defaultBranch,
    latestRelease: latestRelease(ctx.remoteBranches) ?? '',
    me: ctx.me,
    related: ctx.related ?? '',
  };
}

/** Replaces known placeholders; an unknown one stays as written. */
export function render(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.prototype.hasOwnProperty.call(values, name) ? (values[name] as string) : whole));
}

/** The title: the single-commit rule, else the rendered template with spaces collapsed and a leading `: ` removed. */
export function renderTitle(template: string, ctx: TemplateContext, titleExplicit: boolean): string {
  if (ctx.commits.length === 1 && !titleExplicit) return ctx.commits[0] as string;
  return render(template, placeholders({ ...ctx, related: '' })).replace(/\s+/g, ' ').trim().replace(/^:\s*/, '');
}

export type TargetResult = { ok: true; target: string } | { ok: false; error: string };

/** The target branch; `{latestRelease}` without a `release/*` branch stops the creation (Release branch missing). */
export function renderTarget(template: string, ctx: TemplateContext, remote: string, profile: string): TargetResult {
  if (template.includes('{latestRelease}') && latestRelease(ctx.remoteBranches) === undefined) {
    return {
      ok: false,
      error: `No release/* branch of ${remote} is known in ${ctx.repo}. Fetch it, or change the target of the MR profile "${profile}".`,
    };
  }
  return { ok: true, target: render(template, placeholders(ctx)).trim() };
}

export interface TemplateFiles {
  readFile(path: string): Promise<string | undefined>;
  /** File names of a folder, or an empty list when it does not exist */
  list(path: string): Promise<string[]>;
}

/** The repository's own template for `template:default` or `template:<name>`, read from the working tree. */
export async function repositoryTemplate(
  provider: 'gitlab' | 'github',
  name: string,
  root: string,
  files: TemplateFiles,
): Promise<string | undefined> {
  const candidates: string[] = [];
  if (provider === 'gitlab') {
    candidates.push(join(root, '.gitlab', 'merge_request_templates', `${name === 'default' ? 'Default' : name}.md`));
  } else if (name === 'default') {
    candidates.push(join(root, '.github', 'pull_request_template.md'), join(root, '.github', 'PULL_REQUEST_TEMPLATE.md'));
    const folder = join(root, '.github', 'PULL_REQUEST_TEMPLATE');
    const first = (await files.list(folder)).filter((f) => f.toLowerCase().endsWith('.md')).sort()[0];
    if (first) candidates.push(join(folder, first));
  } else {
    candidates.push(join(root, '.github', 'PULL_REQUEST_TEMPLATE', `${name}.md`));
  }
  for (const path of candidates) {
    const content = await files.readFile(path);
    if (content !== undefined) return content;
  }
  return undefined;
}

/** The description and the drawer note (mr-profiles: Description templates). */
export async function renderDescription(
  description: string,
  ctx: TemplateContext,
  provider: 'gitlab' | 'github',
  root: string,
  files: TemplateFiles,
): Promise<{ text: string; note?: string }> {
  const values = placeholders(ctx);
  const match = /^template:(.+)$/.exec(description.trim());
  // `{related}` rendered as nothing leaves no trailing line (mr-profiles: Related placeholder).
  if (!match) return { text: description.includes('{related}') ? render(description, values).replace(/\s+$/, '') : render(description, values) };
  const name = match[1] as string;
  const own = await repositoryTemplate(provider, name, root, files);
  if (own === undefined) {
    const text = render(BUILT_IN_DESCRIPTION, values);
    return name === 'default' ? { text } : { text, note: `Template "${name}" not found; using the built-in one.` };
  }
  const body = own.replace(/\s+$/, '');
  if (body.includes('{commits}')) return { text: render(body, values) };
  return { text: `${render(body, values)}\n\n${values.commits}` };
}
