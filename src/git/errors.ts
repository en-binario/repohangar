// The message of a failed Git operation, as shown in a row's tooltip and in notifications. Pure; no vscode import.

const PREFIX = /^(?:fatal|error|remote):\s*|^[^\s:@]+@[^\s:]+:\s+/i;
// user:password@ (or user@) inside any URL, which Git may echo in its error output.
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi;

/** Removes the user name and password from every URL in a text. */
export function redactUrls(text: string): string {
  return text.replace(URL_CREDENTIALS, '$1');
}

/**
 * `pre-push hook failed: <its first line>` when a push was stopped by the local pre-push hook, else undefined. Git
 * does not name the hook: its stderr is the hook's own output, then `error: failed to push some refs`, with no
 * `To <url>` status (nothing reached the remote) and no Git-prefixed line of its own before it (`error: src refspec …`).
 */
export function pushHookFailure(stderr: string): string | undefined {
  const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const end = lines.findIndex((l) => /^error: failed to push some refs\b/.test(l));
  if (end < 0 || lines.some((l) => /^(To |! \[|remote:)/.test(l))) return undefined;
  const first = lines[0] as string;
  if (end === 0) return 'pre-push hook failed';
  if (/^(?:fatal|error|warning|hint):/i.test(first)) return undefined;
  return redactUrls(`pre-push hook failed: ${first.replace(/\.$/, '')}`);
}

/**
 * The first line of Git's error output (`stderr` of the Git API's errors) without its `fatal:` or `git@host:` prefix
 * and final period, else the first line of the error message; URL credentials are removed. A push stopped by the
 * pre-push hook says so (`pushHookFailure`).
 */
export function gitErrorMessage(error: unknown): string {
  const record = (typeof error === 'object' && error !== null ? error : {}) as { stderr?: unknown; message?: unknown };
  const hook = typeof record.stderr === 'string' ? pushHookFailure(record.stderr) : undefined;
  if (hook) return hook;
  const sources = [record.stderr, record.message, typeof error === 'string' ? error : undefined];
  for (const source of sources) {
    if (typeof source !== 'string') continue;
    const line = source.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
    if (line) return redactUrls(line.replace(PREFIX, '').replace(/\.$/, ''));
  }
  return 'unknown error';
}
