// The Create MR drawer's data and edits (mr-creation: Create MR drawer; design D-7). Shared by the extension host and
// the webview; no vscode import.

export interface DrawerData {
  id: string;
  /** `Create merge request — billing-api` or `Create pull request — web-shop` */
  heading: string;
  provider: 'gitlab' | 'github';
  profiles: string[];
  profile: string;
  /** `(rule 2: git.acme.com/payments/**)`, or empty */
  ruleNote: string;
  /** `feature/ABC-12-notes  ↑2 · will push first` */
  source: string;
  targets: string[];
  target: string;
  /** `2 commits ahead of main` */
  aheadNote: string;
  title: string;
  description: string;
  reviewers: string[];
  assignees: string[];
  labels: string[];
  squash: boolean;
  deleteSourceBranch: boolean;
  draft: boolean;
  /** The squash policy note and a missing named template */
  notes: string[];
  /** `3 uncommitted files are not in the merge request.` */
  warnings: string[];
  /** A guard that stopped Create, shown at the top */
  error: string;
}

/** The fields the drawer can edit. */
export interface DrawerEdits {
  title?: string;
  description?: string;
  target?: string;
  reviewers?: string[];
  assignees?: string[];
  labels?: string[];
  squash?: boolean;
  deleteSourceBranch?: boolean;
  draft?: boolean;
}

export const EDIT_STRINGS = ['title', 'description', 'target'] as const;
export const EDIT_LISTS = ['reviewers', 'assignees', 'labels'] as const;
export const EDIT_FLAGS = ['squash', 'deleteSourceBranch', 'draft'] as const;

const MAX_TEXT = 100_000;
const MAX_ITEMS = 100;

/** The edits of a webview message when every key is known and has the right type, else undefined. */
export function parseEdits(value: unknown): DrawerEdits | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const out: DrawerEdits = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if ((EDIT_STRINGS as readonly string[]).includes(key)) {
      if (typeof v !== 'string' || v.length > MAX_TEXT) return undefined;
      (out as Record<string, unknown>)[key] = v;
    } else if ((EDIT_LISTS as readonly string[]).includes(key)) {
      if (!Array.isArray(v) || v.length > MAX_ITEMS || !v.every((s) => typeof s === 'string' && s.length > 0 && s.length <= 256)) return undefined;
      (out as Record<string, unknown>)[key] = v;
    } else if ((EDIT_FLAGS as readonly string[]).includes(key)) {
      if (typeof v !== 'boolean') return undefined;
      (out as Record<string, unknown>)[key] = v;
    } else {
      return undefined;
    }
  }
  return out;
}
