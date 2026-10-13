import { describe, expect, it } from 'vitest';
import { gitErrorMessage, pushHookFailure } from '../../src/git/errors';

const failed = "error: failed to push some refs to 'https://gitlab.example.com/payments/billing-api.git'";

describe('pushHookFailure', () => {
  it('names the pre-push hook and gives its first line', () => {
    const stderr = `python.exe: can't open file 'C:\\\\hooks\\\\check.py': [Errno 2] No such file or directory\n${failed}\n`;
    expect(pushHookFailure(stderr)).toBe("pre-push hook failed: python.exe: can't open file 'C:\\\\hooks\\\\check.py': [Errno 2] No such file or directory");
  });

  it('reports a hook that printed nothing', () => {
    expect(pushHookFailure(`${failed}\n`)).toBe('pre-push hook failed');
  });

  it('ignores a push the remote rejected', () => {
    const stderr = `To https://gitlab.example.com/payments/billing-api.git\n ! [rejected]        main -> main (fetch first)\n${failed}\nhint: Updates were rejected`;
    expect(pushHookFailure(stderr)).toBeUndefined();
  });

  it('ignores a server-side hook rejection', () => {
    const stderr = `remote: GitLab: You are not allowed to push code to protected branches on this project.\nTo https://gitlab.example.com/payments/billing-api.git\n ! [remote rejected] main -> main (pre-receive hook declined)\n${failed}`;
    expect(pushHookFailure(stderr)).toBeUndefined();
  });

  it("ignores Git's own errors before the failure line", () => {
    expect(pushHookFailure(`error: src refspec feature/x does not match any\n${failed}`)).toBeUndefined();
  });

  it('ignores errors that are not a failed push', () => {
    expect(pushHookFailure("fatal: Authentication failed for 'https://gitlab.example.com/x.git/'")).toBeUndefined();
  });
});

describe('gitErrorMessage', () => {
  it('says the pre-push hook stopped the push', () => {
    const error = Object.assign(new Error('Failed to execute git'), { stderr: `check-docs-boundary: 2 finding(s).\n${failed}\n` });
    expect(gitErrorMessage(error)).toBe('pre-push hook failed: check-docs-boundary: 2 finding(s)');
  });

  it('keeps the first line of other Git errors', () => {
    const error = Object.assign(new Error('Failed to execute git'), { stderr: 'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.\n' });
    expect(gitErrorMessage(error)).toBe('Permission denied (publickey)');
  });
});
