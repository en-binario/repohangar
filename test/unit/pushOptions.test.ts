// mr-creation :: Push option matrix (R1–R12); the `remote:` lines recorded from GitLab CE 17.10.0 (spike, task 1.1).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pushArguments, reportedMergeRequest, type PushOptionValues } from '../../src/mr/pushOptions';
import { pushedText } from '../../src/mr/result';

const values: PushOptionValues = {
  target: 'main',
  title: 'feat: ABC-12 Add billing notes',
  description: '',
  draft: false,
  labels: [],
  assignees: [],
  squash: false,
  deleteSourceBranch: false,
};

/** The `-o` options of the push, in order. */
function options(overrides: Partial<PushOptionValues>): string[] {
  const { args } = pushArguments('origin', 'feature/ABC-12-notes', { ...values, ...overrides });
  return args.flatMap((a, i) => (args[i - 1] === '-o' ? [a] : []));
}

describe('Push option matrix', () => {
  it('pushes with upstream and the options as arguments', () => {
    expect(pushArguments('origin', 'feature/ABC-12-notes', values).args.slice(0, 4)).toEqual(['push', '--set-upstream', 'origin', 'feature/ABC-12-notes']);
  });

  it.each<[string, Partial<PushOptionValues>, string[], string[]]>([
    ['R1 creates the merge request', {}, ['merge_request.create'], []],
    ['R2 sets the target', { target: 'main' }, ['merge_request.target=main'], []],
    ['R3 sets the title', {}, ['merge_request.title=feat: ABC-12 Add billing notes'], []],
    ['R4 sets a one-line description', { description: 'Ticket ABC-12' }, ['merge_request.description=Ticket ABC-12'], []],
    ['R5 leaves out a description with line breaks', { description: '## What\n- Add notes' }, [], ['merge_request.description=## What\n- Add notes']],
    ['R6 marks a draft', { draft: true }, ['merge_request.draft'], []],
    ['R7 adds one option per label', { labels: ['needs-review', 'payments'] }, ['merge_request.label=needs-review', 'merge_request.label=payments'], []],
    ['R8 assigns the first assignee only', { assignees: ['carla.ruiz', 'luis.gomez'] }, ['merge_request.assign=carla.ruiz'], ['merge_request.assign=luis.gomez']],
    ['R9 leaves out @me', { assignees: ['@me'] }, [], ['merge_request.assign=@me']],
    ['R10 squashes', { squash: true }, ['merge_request.squash'], []],
    ['R11 removes the source branch', { deleteSourceBranch: true }, ['merge_request.remove_source_branch'], []],
  ])('%s', (_name, overrides, present, absent) => {
    const got = options(overrides);
    for (const option of present) expect(got).toContain(option);
    for (const option of absent) expect(got).not.toContain(option);
  });

  it('R5 notes the description that was left out', () => {
    expect(pushArguments('origin', 'b', { ...values, description: 'a\nb' }).descriptionLeftOut).toBe(true);
  });

  it('R12 sends no reviewer option and names the reviewers in the result', () => {
    expect(options({}).some((o) => o.includes('reviewer'))).toBe(false);
    expect(pushedText(2, '!142', 'feature/ABC-12-notes', 'billing-api', ['ana.perez', 'luis.gomez'], false)).toContain('without reviewers (ana.perez, luis.gomez)');
  });
});

describe('remote: lines of GitLab CE 17.10.0', () => {
  const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', 'pushOptions', name), 'utf8');

  it('reads the merge request of a new merge request push', () => {
    expect(reportedMergeRequest(fixture('new-merge-request.txt'))).toEqual({ url: 'http://localhost:8929/payments/billing-api/-/merge_requests/3', iid: 3 });
  });

  it('reads the same merge request when it already existed', () => {
    expect(reportedMergeRequest(fixture('existing-merge-request.txt'))?.iid).toBe(3);
  });

  it('finds none when nothing was pushed', () => {
    expect(reportedMergeRequest(fixture('nothing-new.txt'))).toBeUndefined();
  });
});
