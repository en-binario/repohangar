// The message of a failed Git operation, as shown in a row's tooltip and in notifications. Pure; no vscode import.

const PREFIX = /^(?:fatal|error|remote):\s*|^[^\s:@]+@[^\s:]+:\s+/i;
// user:password@ (or user@) inside any URL, which Git may echo in its error output.
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi;

/** Removes the user name and password from every URL in a text. */
export function redactUrls(text: string): string {
  return text.replace(URL_CREDENTIALS, '$1');
}

/**
 * The first line of Git's error output (`stderr` of the Git API's errors) without its `fatal:` or `git@host:` prefix
 * and final period, else the first line of the error message; URL credentials are removed.
 */
export function gitErrorMessage(error: unknown): string {
  const record = (typeof error === 'object' && error !== null ? error : {}) as { stderr?: unknown; message?: unknown };
  const sources = [record.stderr, record.message, typeof error === 'string' ? error : undefined];
  for (const source of sources) {
    if (typeof source !== 'string') continue;
    const line = source.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0);
    if (line) return redactUrls(line.replace(PREFIX, '').replace(/\.$/, ''));
  }
  return 'unknown error';
}
