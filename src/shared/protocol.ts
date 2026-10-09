// Messages between the extension host and the dashboard webview, and the validator for messages from the webview
// (design D-4). No vscode import.

import type { DashboardState, GroupingMode, RowData, RowDetails } from './model';

export interface Snapshot {
  type: 'snapshot';
  state: DashboardState;
  rows: RowData[];
  grouping: GroupingMode;
  collapsed: string[];
  staleFetchHours: number;
  isMac: boolean;
}

export type HostMessage =
  | Snapshot
  | { type: 'patch'; upserts: RowData[]; removals: string[] }
  | { type: 'details'; id: string; details: RowDetails };

export type ViewMessage =
  | { type: 'ready' }
  | { type: 'firstPaint'; rows: number }
  | { type: 'setGrouping'; mode: GroupingMode }
  | { type: 'toggleGroup'; group: string }
  | { type: 'loadDetails'; id: string }
  | { type: 'openSettings' };

export const GROUPING_MODES: readonly GroupingMode[] = ['parentFolder', 'workspaceFolder', 'custom', 'none'];

const MAX_STRING = 4096;

type Field = 'string' | 'count' | 'grouping';

const SHAPES: Record<ViewMessage['type'], Record<string, Field>> = {
  ready: {},
  firstPaint: { rows: 'count' },
  setGrouping: { mode: 'grouping' },
  toggleGroup: { group: 'string' },
  loadDetails: { id: 'string' },
  openSettings: {},
};

function fieldValid(kind: Field, value: unknown): boolean {
  switch (kind) {
    case 'string':
      return typeof value === 'string' && value.length > 0 && value.length <= MAX_STRING;
    case 'count':
      return typeof value === 'number' && Number.isInteger(value) && value >= 0;
    case 'grouping':
      return typeof value === 'string' && (GROUPING_MODES as readonly string[]).includes(value);
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
