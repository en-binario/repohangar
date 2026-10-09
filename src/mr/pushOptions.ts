// GitLab push options (mr-creation: Push options; design D-6): the `git push -o …` arguments from the resolved values,
// and the merge request URL from GitLab's `remote:` lines. No vscode import.

export interface PushOptionValues {
  target: string;
  title: string;
  description: string;
  draft: boolean;
  labels: string[];
  assignees: string[];
  squash: boolean;
  deleteSourceBranch: boolean;
}

export interface PushArguments {
  args: string[];
  /** The description had a line break and was left out (Git refuses line feeds in push options) */
  descriptionLeftOut: boolean;
}

export function pushArguments(remote: string, branch: string, v: PushOptionValues): PushArguments {
  const options = ['merge_request.create', `merge_request.target=${v.target}`, `merge_request.title=${oneLine(v.title)}`];
  const descriptionLeftOut = /[\r\n]/.test(v.description);
  if (v.description && !descriptionLeftOut) options.push(`merge_request.description=${v.description}`);
  if (v.draft) options.push('merge_request.draft');
  for (const label of v.labels) options.push(`merge_request.label=${label}`);
  // `@me` is unknown without a token; only the first assignee goes (one assignee on Free).
  const assignee = v.assignees.find((a) => a !== '@me');
  if (assignee) options.push(`merge_request.assign=${assignee}`);
  if (v.squash) options.push('merge_request.squash');
  if (v.deleteSourceBranch) options.push('merge_request.remove_source_branch');
  return { args: ['push', '--set-upstream', remote, branch, ...options.flatMap((o) => ['-o', o])], descriptionLeftOut };
}

function oneLine(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').trim();
}

/** The merge request GitLab reports in the `remote:` lines of a push, or undefined. */
export function reportedMergeRequest(output: string): { url: string; iid: number } | undefined {
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith('remote:')) continue;
    const match = /(https?:\/\/\S+\/-\/merge_requests\/(\d+))/.exec(line);
    if (match) return { url: match[1] as string, iid: Number(match[2]) };
  }
  return undefined;
}
