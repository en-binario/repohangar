// The user search behind the Reviewers and Assignees lists of the drawer and the profile editor (mr-creation: Find users
// in the Reviewers and Assignees fields; add-user-picker design D-1). No vscode import.

import type { Credential } from '../providers/http';
import type { UserMatch } from '../providers/provider';
import { searchText, type UserAnswer, type UserField } from './users';

/** The repository a search runs on. */
export interface SearchRepo {
  host: string;
  projectPath: string;
  search(projectPath: string, text: string, credential: Credential): Promise<UserMatch[]>;
}

export interface UserSearchPort {
  /** The hosted GitLab or GitHub repository with this id, else undefined */
  repo(id: string): SearchRepo | undefined;
  credential(host: string): Promise<Credential | undefined>;
  log(message: string): void;
}

export const SEARCH_DELAY_MS = 300;

export class UserSearch {
  /** One timer per surface and field (`drawer:reviewers`, `profiles:assignees`) */
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** The latest text per key: an answer for older text is dropped, whatever order the answers arrive in */
  private readonly latest = new Map<string, string>();

  constructor(private readonly port: UserSearchPort) {}

  /** Searches `text` 300 ms after the last call with the same key; posts nothing for text that does not search. */
  search(key: string, repoId: string, field: UserField, text: string, post: (answer: UserAnswer) => void): void {
    const earlier = this.timers.get(key);
    if (earlier) clearTimeout(earlier);
    this.latest.set(key, text);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void this.answer(repoId, field, text).then((answer) => {
          if (answer && this.latest.get(key) === text) post(answer);
        });
      }, SEARCH_DELAY_MS),
    );
  }

  private async answer(repoId: string, field: UserField, typed: string): Promise<UserAnswer | undefined> {
    const text = searchText(typed);
    const repo = this.port.repo(repoId);
    if (text === undefined || !repo) return undefined;
    const answer = { field, text, host: repo.host, users: [] as UserMatch[], message: '' };
    const credential = await this.port.credential(repo.host);
    if (!credential) return { ...answer, state: 'signedOut' };
    try {
      return { ...answer, state: 'users', users: (await repo.search(repo.projectPath, text, credential)).slice(0, 10) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.port.log(`User search on ${repo.host} failed: ${message}`);
      return { ...answer, state: 'failed', message };
    }
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
