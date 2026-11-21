// Versioning for RepoHangar (docs/versioning.md):
//   node scripts/version.mjs check
//   node scripts/version.mjs bump [--level major|minor|patch] [--date YYYY-MM-DD]
// Plain Node with no dependencies, so it runs before `npm ci`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CHANGELOG = 'CHANGELOG.md';
/** The extension manifest, whose `preview` flag the bump removes at 1.0.0. */
export const EXTENSION_MANIFEST = 'package.json';
export const MANIFESTS = ['package.json'];
export const LOCKFILE = 'package-lock.json';

/** Entry kinds and the level each one requires. */
export const KINDS = {
  Breaking: 'major',
  Removed: 'major',
  Added: 'minor',
  Changed: 'minor',
  Deprecated: 'minor',
  Fixed: 'patch',
  Security: 'patch',
};

const LEVELS = ['patch', 'minor', 'major'];
const rank = (level) => LEVELS.indexOf(level);
const ENTRY = /^- \*\*([^*:.\s—]+)(?::| — |\.)/;
const RELEASE = /^## (\d+\.\d+\.\d+)\b/;

/** Parses the bullets under `## Unreleased`; indented lines continue the entry above. */
export function parseUnreleased(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.trim() === '## Unreleased');
  const entries = [];
  const errors = [];
  if (start < 0) return { entries, errors: [`${CHANGELOG}: no "## Unreleased" section`] };
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
    const line = lines[i];
    if (!line.startsWith('- ')) continue;
    const m = ENTRY.exec(line);
    if (!m) errors.push(`${CHANGELOG}:${i + 1}: entry has no kind`);
    else if (!(m[1] in KINDS)) errors.push(`${CHANGELOG}:${i + 1}: unknown entry kind "${m[1]}"`);
    else entries.push({ kind: m[1], line: i + 1 });
  }
  return { entries, errors };
}

/** The highest level among the entries, or null when nothing is pending. */
export function requiredLevel(entries) {
  let level = null;
  for (const e of entries) if (level === null || rank(KINDS[e.kind]) > rank(level)) level = KINDS[e.kind];
  return level;
}

/** Bumps a version. Before 1.0.0 a computed level shifts down one step; an explicit `--level` never does. */
export function nextVersion(version, level, { explicit = false } = {}) {
  const [major, minor, patch] = version.split('.').map(Number);
  let effective = level;
  if (major < 1 && !explicit) effective = level === 'major' ? 'minor' : 'patch';
  if (effective === 'major') return `${major + 1}.0.0`;
  if (effective === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function readJson(root, path) {
  const file = join(root, path);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
}

/** The version of every place that holds one, in a fixed order. */
export function readVersions(root) {
  const found = [];
  for (const path of MANIFESTS) {
    const json = readJson(root, path);
    if (json) found.push({ path, version: json.version });
  }
  const lock = readJson(root, LOCKFILE);
  if (lock) {
    found.push({ path: LOCKFILE, version: lock.version });
    if (lock.packages?.[''] && 'version' in lock.packages['']) {
      found.push({ path: `${LOCKFILE} (packages[""])`, version: lock.packages[''].version });
    }
  }
  const changelog = join(root, CHANGELOG);
  if (existsSync(changelog)) {
    const heading = readFileSync(changelog, 'utf8')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((l) => RELEASE.exec(l))
      .find(Boolean);
    if (heading) found.push({ path: CHANGELOG, version: heading[1] });
  }
  return found;
}

/** Runs every check and computes the pending release. */
export function inspect(root) {
  const errors = [];
  const changelog = join(root, CHANGELOG);
  const { entries, errors: entryErrors } = existsSync(changelog)
    ? parseUnreleased(readFileSync(changelog, 'utf8'))
    : { entries: [], errors: [`${CHANGELOG} not found`] };
  errors.push(...entryErrors);
  const versions = readVersions(root);
  const version = versions[0]?.version ?? '0.0.0';
  for (const v of versions.slice(1)) {
    if (v.version !== version) errors.push(`${v.path} version ${v.version} differs from ${version}`);
  }
  const level = requiredLevel(entries);
  return { version, entries, level, next: level ? nextVersion(version, level) : null, errors };
}

function summary({ version, entries, level, next }) {
  const count = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
  if (!level) return `repohangar ${version}; Unreleased: ${count} → no release pending`;
  const pre = version.split('.')[0] === '0' ? ' before 1.0' : '';
  return `repohangar ${version}; Unreleased: ${count} → ${level} (next ${next}${pre})`;
}

/** `version:check`: exit code and output. */
export function check(root) {
  const result = inspect(root);
  if (result.errors.length) return { code: 1, stdout: '', stderr: result.errors.join('\n') + '\n' };
  return { code: 0, stdout: summary(result) + '\n', stderr: '' };
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function writeJson(root, path, update) {
  const file = join(root, path);
  const text = readFileSync(file, 'utf8');
  const indent = /^[ \t]+(?=")/m.exec(text)?.[0] ?? '  ';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const json = JSON.parse(text);
  update(json);
  writeFileSync(file, (JSON.stringify(json, null, indent) + '\n').replace(/\n/g, eol));
}

/** `version:bump`: writes the next version everywhere, or changes nothing when a check fails. */
export function bump(root, { level: requested, date = today() } = {}) {
  const result = inspect(root);
  if (result.errors.length) return { code: 1, stdout: '', stderr: result.errors.join('\n') + '\n' };
  if (requested && !LEVELS.includes(requested)) {
    return { code: 1, stdout: '', stderr: `unknown level "${requested}"; use major, minor or patch\n` };
  }
  if (!result.level && !requested) return { code: 1, stdout: '', stderr: 'nothing to release\n' };
  if (requested && result.level && rank(requested) < rank(result.level)) {
    return { code: 1, stdout: '', stderr: `level ${requested} is below the required ${result.level}\n` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { code: 1, stdout: '', stderr: `invalid date "${date}"; use YYYY-MM-DD\n` };
  }
  const version = requested ? nextVersion(result.version, requested, { explicit: true }) : result.next;

  for (const path of MANIFESTS) {
    if (!existsSync(join(root, path))) continue;
    writeJson(root, path, (j) => {
      j.version = version;
      // Marketplace shows a "Preview" badge while major version is 0; remove it at 1.0.0.
      if (path === EXTENSION_MANIFEST && 'preview' in j && Number(version.split('.')[0]) >= 1) delete j.preview;
    });
  }
  if (existsSync(join(root, LOCKFILE))) {
    writeJson(root, LOCKFILE, (lock) => {
      lock.version = version;
      if (lock.packages?.[''] && 'version' in lock.packages['']) lock.packages[''].version = version;
    });
  }
  const file = join(root, CHANGELOG);
  const text = readFileSync(file, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  writeFileSync(file, text.replace(/^## Unreleased[ \t]*$/m, `## Unreleased${eol}${eol}## ${version} — ${date}`));
  return {
    code: 0,
    stdout: `repohangar ${version} — ${date}. Review the diff, then run:\n  git commit -am "chore(release): ${version}" && git tag v${version}\n`,
    stderr: '',
  };
}

function parseArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--level') opts.level = args[++i];
    else if (args[i] === '--date') opts.date = args[++i];
    else if (args[i].startsWith('--level=')) opts.level = args[i].slice(8);
    else if (args[i].startsWith('--date=')) opts.date = args[i].slice(7);
  }
  return opts;
}

export function main(argv, root = process.cwd()) {
  const [command, ...rest] = argv;
  if (command === 'check') return check(root);
  if (command === 'bump') return bump(root, parseArgs(rest));
  return {
    code: 2,
    stdout: '',
    stderr: 'usage: node scripts/version.mjs check | bump [--level major|minor|patch] [--date YYYY-MM-DD]\n',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { code, stdout, stderr } = main(process.argv.slice(2));
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exitCode = code;
}
