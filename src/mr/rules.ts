// Profile rules (mr-profiles: Profile rules; design D-1): the first rule whose `repo` and `branch` globs match chooses
// the profile, with its `set`. No vscode import.

import { explicitValues, type ProfileValues } from './profiles';

export interface Rule {
  repo?: string;
  branch?: string;
  profile: string;
  set?: Partial<ProfileValues>;
}

export interface ChosenRule {
  profile: string;
  set: Partial<ProfileValues>;
  /** 1-based number of the rule in `repohangar.mr.rules`, or undefined when none matched */
  index?: number;
  /** The glob that matched, for the drawer (`(rule 2: git.acme.com/payments/**)`) */
  glob?: string;
}

/** The rules of the setting that have a profile name; malformed entries are skipped but keep their number. */
export function readRules(raw: unknown): (Rule | undefined)[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (typeof entry !== 'object' || entry === null) return undefined;
    const r = entry as Record<string, unknown>;
    if (typeof r.profile !== 'string') return undefined;
    return {
      profile: r.profile,
      ...(typeof r.repo === 'string' ? { repo: r.repo } : {}),
      ...(typeof r.branch === 'string' ? { branch: r.branch } : {}),
      ...(r.set === undefined ? {} : { set: explicitValues(r.set).values }),
    };
  });
}

/** A glob as a regular expression: `**` across `/`, `*` and `?` within one segment. */
export function globToRegExp(glob: string, ignoreCase: boolean): RegExp {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string;
    if (c === '*' && glob[i + 1] === '*') {
      // `**/` also matches nothing, so `a/**/b` matches `a/b`.
      if (glob[i + 2] === '/') {
        source += '(?:.*/)?';
        i += 2;
      } else {
        source += '.*';
        i += 1;
      }
    } else if (c === '*') source += '[^/]*';
    else if (c === '?') source += '[^/]';
    else source += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, ignoreCase ? 'i' : '');
}

/**
 * The first matching rule for `<host>/<project path>` and the branch: hosts compare case-insensitively, the project
 * path and the branch case-sensitively.
 */
export function chooseRule(rules: readonly (Rule | undefined)[], repo: string, branch: string): ChosenRule {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule) continue;
    if (rule.repo !== undefined && !matchRepo(rule.repo, repo)) continue;
    if (rule.branch !== undefined && !globToRegExp(rule.branch, false).test(branch)) continue;
    const glob = rule.repo ?? rule.branch;
    return { profile: rule.profile, set: rule.set ?? {}, index: i + 1, ...(glob === undefined ? {} : { glob }) };
  }
  return { profile: 'default', set: {} };
}

function matchRepo(glob: string, repo: string): boolean {
  const [globHost = '', ...globPath] = glob.split('/');
  const [host = '', ...path] = repo.split('/');
  return globToRegExp(globHost, true).test(host) && globToRegExp(globPath.join('/'), false).test(path.join('/'));
}

/** The notification of a rule that names a missing profile. */
export function missingProfileText(index: number, profile: string): string {
  return `MR rule ${index} uses the profile "${profile}", which does not exist.`;
}
