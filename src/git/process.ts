// The only way RepoHangar starts a `git` process: execFile, argument array, no shell, 10 s timeout and
// GIT_TERMINAL_PROMPT=0, so it can never hang on a prompt (PROPOSAL.md §5.3).

import { execFile } from 'node:child_process';

export interface GitProcessCall {
  args: readonly string[];
  cwd: string;
  at: number;
}

/** Every call made in this extension host, newest last. Read by the integration tests. */
export const gitProcessLog: GitProcessCall[] = [];

export const GIT_TIMEOUT_MS = 10_000;

/** `timeoutMs` is 10 s unless given (git push with push options uses the fetch timeout). */
export function runGit(gitPath: string, args: readonly string[], cwd: string, timeoutMs = GIT_TIMEOUT_MS): Promise<string> {
  gitProcessLog.push({ args, cwd, at: Date.now() });
  return new Promise((resolve, reject) => {
    execFile(
      gitPath,
      [...args],
      {
        cwd,
        timeout: timeoutMs,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
      // The error carries Git's error output, for the message shown to the user.
      (error, stdout, stderr) => (error ? reject(Object.assign(error, { stderr })) : resolve(stdout)),
    );
  });
}
