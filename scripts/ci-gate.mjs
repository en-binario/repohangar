// Stops a release whose commit did not pass CI on every system: reads the `ci` workflow run of the tagged commit
// with the GitHub CLI and fails unless every job of it concluded `success` (or `skipped`).
//   node scripts/ci-gate.mjs --sha <commit>
// Plain Node, no dependencies; `gh` reads GH_TOKEN.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const CI_WORKFLOW = 'ci.yml';

/** The runner of a job, from its matrix name such as `test (windows-latest)`; the name itself otherwise. */
export function runnerOf(jobName) {
  return /\b(?:ubuntu|windows|macos)-[\w.]+/.exec(jobName)?.[0] ?? jobName;
}

/**
 * The verdict on a commit's CI run: `run` is the latest `ci` run of the commit (undefined when there is none) with its
 * jobs, as `gh run view --json status,conclusion,jobs` prints them.
 */
export function ciGate(sha, run) {
  const short = sha.slice(0, 7);
  if (!run) return { ok: false, message: `CI did not run on ${short}` };
  if (run.status !== 'completed') return { ok: false, message: `CI is still running on ${short}` };
  const failed = (run.jobs ?? []).filter((j) => j.conclusion !== 'success' && j.conclusion !== 'skipped');
  if (run.conclusion === 'success' && failed.length === 0) return { ok: true, message: `CI passed on ${short}` };
  const runners = [...new Set(failed.map((j) => runnerOf(j.name)))];
  return { ok: false, message: `CI did not pass on ${short} (${runners.join(', ') || run.conclusion})` };
}

/** The latest `ci` run of a commit, with its jobs, through the GitHub CLI. */
export function latestRun(sha, gh = (args) => execFileSync('gh', args, { encoding: 'utf8' })) {
  const runs = JSON.parse(gh(['run', 'list', '--workflow', CI_WORKFLOW, '--commit', sha, '--limit', '1', '--json', 'databaseId']));
  if (runs.length === 0) return undefined;
  return JSON.parse(gh(['run', 'view', String(runs[0].databaseId), '--json', 'status,conclusion,jobs']));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { values } = parseArgs({ options: { sha: { type: 'string' } } });
  if (!values.sha) {
    console.error('usage: node scripts/ci-gate.mjs --sha <commit>');
    process.exit(2);
  }
  const verdict = ciGate(values.sha, latestRun(values.sha));
  (verdict.ok ? console.log : console.error)(verdict.message);
  process.exitCode = verdict.ok ? 0 : 1;
}
