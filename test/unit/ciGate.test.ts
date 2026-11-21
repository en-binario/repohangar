import { describe, expect, it } from 'vitest';
import { ciGate, runnerOf } from '../../scripts/ci-gate.mjs';

describe('scripts/ci-gate.mjs', () => {
  it('extracts runner names from matrix job names', () => {
    expect(runnerOf('test (windows-latest)')).toBe('windows-latest');
    expect(runnerOf('test (ubuntu-latest)')).toBe('ubuntu-latest');
    expect(runnerOf('lint')).toBe('lint');
  });

  it('passes when CI completed with all jobs succeeded or skipped', () => {
    const verdict = ciGate('1234567890abcdef', {
      status: 'completed',
      conclusion: 'success',
      jobs: [
        { name: 'test (ubuntu-latest)', conclusion: 'success' },
        { name: 'test (windows-latest)', conclusion: 'success' },
        { name: 'test (macos-latest)', conclusion: 'skipped' },
      ],
    });
    expect(verdict.ok).toBe(true);
  });

  it('fails when CI did not run, is still running, or failed on any runner', () => {
    expect(ciGate('1234567', undefined).ok).toBe(false);
    expect(ciGate('1234567', { status: 'in_progress', conclusion: null, jobs: [] }).ok).toBe(false);
    const failed = ciGate('1234567', {
      status: 'completed',
      conclusion: 'failure',
      jobs: [
        { name: 'test (ubuntu-latest)', conclusion: 'success' },
        { name: 'test (macos-latest)', conclusion: 'failure' },
      ],
    });
    expect(failed.ok).toBe(false);
    expect(failed.message).toContain('macos-latest');
  });
});
