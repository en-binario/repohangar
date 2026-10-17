// Messages between the extension host and the dashboard webview, and the validator for messages from the webview
// (design D-4). No vscode import.

import { FIX_IDS, type BatchPanel, type FixId, type ResultLine } from './batchResult';
import { SAVE_TARGETS, type SaveTarget } from '../mr/saveDefaults';
import { USER_FIELDS, type UserAnswer, type UserField } from '../mr/users';
import { parseEdits, type DrawerData, type DrawerEdits } from './drawer';
import type { GraphVariant, NameClick } from './graph';
import {
  ROW_ACTIONS,
  type BatchAction,
  type DashboardState,
  type FirstRunPanel,
  type GroupingMode,
  type RowAction,
  type RowData,
  type RowDetails,
} from './model';
import { SORT_COLUMNS, SORT_DIRECTIONS, type SortColumn, type SortDirection } from './sort';

export interface Snapshot {
  type: 'snapshot';
  state: DashboardState;
  rows: RowData[];
  grouping: GroupingMode;
  collapsed: string[];
  /** The row order chosen for the workspace (dashboard: Sort by column) */
  sort: { column: SortColumn; direction: SortDirection };
  staleFetchHours: number;
  /** `process.platform` of the extension host */
  platform: string;
  /** How the graph entry points read (explorer-open-in-git-graph: Graph command variants) */
  graph: GraphVariant;
  /** `repohangar.dashboard.nameClick` */
  nameClick: NameClick;
  /** The first-run hosts panel, shown in place of the grid until dismissed (provider-auth) */
  firstRun: FirstRunPanel | null;
  /** The first-run decision waits for every listed repository's row */
  firstRunPending: boolean;
}

export type HostMessage =
  | Snapshot
  | { type: 'patch'; upserts: RowData[]; removals: string[] }
  | { type: 'details'; id: string; details: RowDetails }
  /** Show in RepoHangar: make the row visible and move the focus to it */
  | { type: 'reveal'; id: string }
  /** The Create MR drawer (mr-creation), or null to close it */
  | { type: 'drawer'; data: DrawerData | null }
  /** The answer to a search in the drawer's Reviewers or Assignees field (mr-creation: Find users …) */
  | { type: 'drawerUsers'; id: string; answer: UserAnswer }
  /** The result panel of the last batch, or null to close it (batch-operations: Batch result panel, design D-6) */
  | { type: 'batchResult'; panel: BatchPanel | null }
  /** One line of the result panel after a fix button or Retry failed */
  | { type: 'batchResultLine'; line: ResultLine; counts: string; canRetry: boolean };

export type ViewMessage =
  | { type: 'ready' }
  | { type: 'firstPaint'; rows: number }
  | { type: 'setGrouping'; mode: GroupingMode }
  | { type: 'toggleGroup'; group: string }
  /** A click on a column header or `Enter` on it (dashboard: Sort by column, Sort remembered per workspace) */
  | { type: 'setSort'; column: SortColumn; direction: SortDirection }
  | { type: 'loadDetails'; id: string }
  | { type: 'openSettings' }
  | { type: 'runAction'; id: string; action: RowAction }
  | { type: 'runBatch'; action: BatchAction; ids: string[] }
  /** `b` with rows selected, `n` and the toolbar buttons ⎇ Switch… and ＋ Branch… (batch-operations: Branch batch targets) */
  | { type: 'switchBranch'; ids: string[] }
  | { type: 'createBranch'; ids: string[] }
  /** `m` with rows selected and the toolbar button ⤴ Create MRs (mr-creation: Create merge requests on a selection) */
  | { type: 'createMrs'; ids: string[] }
  /** The result panel: a fix button, Retry failed, Copy all links and Close */
  | { type: 'fix'; id: string; fix: FixId }
  | { type: 'retryFailed' }
  | { type: 'copyAllLinks' }
  | { type: 'closeBatchResult' }
  /** The selected rows, which the batch commands act on (batch-operations: Batch targets) */
  | { type: 'setSelection'; ids: string[] }
  /** The focused row, whose repository and branch the profile editor's title preview uses */
  | { type: 'setFocus'; id: string }
  /** `⚙` in the toolbar and Set up a default profile / Edit profiles in the first-run panel (mr-profiles) */
  | { type: 'editProfiles' }
  /** A `Sign in` cell or a first-run button (provider-auth: Sign in to a host) */
  | { type: 'signIn'; host: string }
  /** The `?` cell (hosting-providers: Host choice for an unknown host) */
  | { type: 'chooseProvider'; host: string }
  | { type: 'skipHost'; host: string }
  | { type: 'firstRunDone' }
  /** The drawer: another profile or target, Create, Cancel or Esc, and user suggestions */
  | { type: 'drawerChange'; id: string; profile: string; edits: DrawerEdits }
  | { type: 'drawerCreate'; id: string; profile: string; edits: DrawerEdits }
  | { type: 'drawerClose' }
  | { type: 'drawerSearchUsers'; id: string; field: UserField; text: string }
  /** Save as defaults ▾ in the drawer (mr-profiles: Save as defaults) */
  | { type: 'drawerSaveDefaults'; id: string; profile: string; edits: DrawerEdits; target: SaveTarget };

export const GROUPING_MODES: readonly GroupingMode[] = ['parentFolder', 'workspaceFolder', 'custom', 'none'];

/** The batches the webview runs with `runBatch`; Switch and Create ask for a branch first. */
export const BATCH_ACTIONS: readonly BatchAction[] = ['fetch', 'pullFf'];

const MAX_STRING = 4096;
const MAX_IDS = 10_000;

type Field =
  | 'string'
  | 'count'
  | 'grouping'
  | 'sortColumn'
  | 'sortDirection'
  | 'rowAction'
  | 'batchAction'
  | 'ids'
  | 'edits'
  | 'text'
  | 'fix'
  | 'saveTarget'
  | 'userField';

const SHAPES: Record<ViewMessage['type'], Record<string, Field>> = {
  ready: {},
  firstPaint: { rows: 'count' },
  setGrouping: { mode: 'grouping' },
  toggleGroup: { group: 'string' },
  setSort: { column: 'sortColumn', direction: 'sortDirection' },
  loadDetails: { id: 'string' },
  openSettings: {},
  runAction: { id: 'string', action: 'rowAction' },
  runBatch: { action: 'batchAction', ids: 'ids' },
  switchBranch: { ids: 'ids' },
  createBranch: { ids: 'ids' },
  fix: { id: 'string', fix: 'fix' },
  createMrs: { ids: 'ids' },
  retryFailed: {},
  copyAllLinks: {},
  closeBatchResult: {},
  setSelection: { ids: 'ids' },
  setFocus: { id: 'string' },
  editProfiles: {},
  signIn: { host: 'string' },
  chooseProvider: { host: 'string' },
  skipHost: { host: 'string' },
  firstRunDone: {},
  drawerChange: { id: 'string', profile: 'string', edits: 'edits' },
  drawerCreate: { id: 'string', profile: 'string', edits: 'edits' },
  drawerClose: {},
  drawerSearchUsers: { id: 'string', field: 'userField', text: 'text' },
  drawerSaveDefaults: { id: 'string', profile: 'string', edits: 'edits', target: 'saveTarget' },
};

function fieldValid(kind: Field, value: unknown): boolean {
  switch (kind) {
    case 'string':
      return typeof value === 'string' && value.length > 0 && value.length <= MAX_STRING;
    case 'count':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0;
    case 'grouping':
      return typeof value === 'string' && (GROUPING_MODES as readonly string[]).includes(value);
    case 'sortColumn':
      return typeof value === 'string' && (SORT_COLUMNS as readonly string[]).includes(value);
    case 'sortDirection':
      return typeof value === 'string' && (SORT_DIRECTIONS as readonly string[]).includes(value);
    case 'rowAction':
      return typeof value === 'string' && (ROW_ACTIONS as readonly string[]).includes(value);
    case 'batchAction':
      return typeof value === 'string' && (BATCH_ACTIONS as readonly string[]).includes(value);
    case 'fix':
      return typeof value === 'string' && (FIX_IDS as readonly string[]).includes(value);
    case 'edits':
      return parseEdits(value) !== undefined;
    case 'saveTarget':
      return typeof value === 'string' && (SAVE_TARGETS as readonly string[]).includes(value);
    case 'userField':
      return typeof value === 'string' && (USER_FIELDS as readonly string[]).includes(value);
    case 'text':
      return typeof value === 'string' && value.length <= 256;
    case 'ids':
      return Array.isArray(value) && value.length <= MAX_IDS && value.every((id) => fieldValid('string', id));
  }
}

/** Returns the message when it matches the protocol exactly (no missing, extra or mistyped fields), else undefined. */
export function parseViewMessage(message: unknown): ViewMessage | undefined {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) return undefined;
  const record = message as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(SHAPES, type)) return undefined;
  const shape = SHAPES[type as ViewMessage['type']];
  const keys = Object.keys(record).filter((k) => k !== 'type');
  if (keys.length !== Object.keys(shape).length) return undefined;
  for (const key of keys) {
    const kind = shape[key];
    if (!kind || !fieldValid(kind, record[key])) return undefined;
  }
  return record as unknown as ViewMessage;
}
