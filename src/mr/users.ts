// Reviewers and assignees before they are sent (mr-creation: Reviewers and assignees; design D-4): `@me`, the author
// removed from the reviewers, `team:<slug>` entries, and the notices about what was not applied. No vscode import.

export interface Notice {
  text: string;
  button?: 'Open Settings' | 'Sign In…';
}

export interface PreparedUsers {
  reviewers: string[];
  teams: string[];
  assignees: string[];
  notices: Notice[];
}

/** Replaces `@me`, removes the author from the reviewers and splits off `team:<slug>` (GitHub only). */
export function prepareUsers(
  provider: 'gitlab' | 'github',
  host: string,
  reviewers: readonly string[],
  assignees: readonly string[],
  me: string,
): PreparedUsers {
  const notices: Notice[] = [];
  const replace = (name: string) => (name === '@me' ? me : name);
  const unique = (names: string[]) => [...new Set(names.filter((n) => n.length > 0))];
  const people: string[] = [];
  const teams: string[] = [];
  for (const entry of reviewers.map(replace)) {
    if (entry.startsWith('team:')) {
      if (provider === 'github') teams.push(entry.slice('team:'.length));
      else notices.push({ text: `${entry} is a GitHub team and was not added on ${host}.` });
    } else if (entry !== me) {
      people.push(entry);
    }
  }
  return { reviewers: unique(people), teams: unique(teams), assignees: unique(assignees.map(replace)), notices };
}

/** `GitLab Free allows one reviewer: ana.perez added, luis.gomez not added.` */
export function limitNotice(kind: 'reviewer' | 'assignee', added: readonly string[], notAdded: readonly string[]): Notice {
  return { text: `GitLab Free allows one ${kind}: ${added.join(', ') || 'none'} added, ${notAdded.join(', ')} not added.` };
}

export function notFoundNotice(kind: 'Reviewer' | 'Assignee', name: string, host: string): Notice {
  return { text: `${kind} ${name} not found on ${host}.`, button: 'Open Settings' };
}

/** Whether a GitLab error is about the number of reviewers or assignees (design D-4). */
export function isLimitError(status: number | undefined, message: string): boolean {
  if (status !== 400 && status !== 422) return false;
  return /(reviewer|assignee)/i.test(message) && /(one|1|single|multiple|more than)/i.test(message);
}
