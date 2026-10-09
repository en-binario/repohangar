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

export function runGit(gitPath: string, args: readonly string[], cwd: string): Promise<string> {
  gitProcessLog.push({ args, cwd, at: Date.now() });
  return new Promise((resolve, reject) => {
    execFile(
      gitPath,
      [...args],
      {
        cwd,
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}
