import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { batchTargets, branchTargets, type BatchTrigger, type BranchTrigger } from '../src/shared/batch';
import type { BatchPanel } from '../src/shared/batchResult';
import {
  CHIPS,
  branchCell,
  changesCell,
  chipMembership,
  detailsLines,
  emptyStateText,
  fetchedCell,
  repositoryCell,
  shownSyncCell,
  type CellText,
} from '../src/shared/format';
import { nameClickAction, type GraphVariant } from '../src/shared/graph';
import type { ChipId, FirstRunButton, FirstRunPanel, GroupingMode, RowAction, RowData, RowDetails } from '../src/shared/model';
import type { HostMessage, Snapshot, ViewMessage } from '../src/shared/protocol';
import type { DrawerData } from '../src/shared/drawer';
import { compareState, openReviewLabel, reviewDetails, rowReviewCell } from '../src/shared/review';
import { detailsButtons } from '../src/shared/rowMenu';
import { layout, rowKey, type GridItem } from './layout';
import { BatchResult } from './BatchResult';
import { Drawer } from './Drawer';
import { BatchButtons, HoverActions, RowMenu, syncClickAction } from './RowActions';

export interface VsCodeApi {
  postMessage(message: ViewMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

export interface PersistedView {
  filter: string;
  chips: ChipId[];
  selected: string[];
  expanded: string[];
  focus: string | null;
}

const EMPTY_VIEW: PersistedView = { filter: '', chips: [], selected: [], expanded: [], focus: null };

/**
 * The hints of the action keys (git-operations: Row action keys), then those of the graph, Explorer and Source Control
 * keys, `n branch` (batch-operations: Branch keys) and the merge request keys, shown before the navigation hints.
 */
export const ACTION_HINTS =
  'f fetch · p pull · P push · b switch · t terminal · . more · g graph · e explorer · s source control · n branch · m MR · M MR… · o open MR';
export const KEY_HINTS = '↑↓ move · Space select · / filter · ⏎ details · ? keys';

export const KEY_HELP: readonly [string, string][] = [
  ['↑ ↓ / j k', 'Move between rows and group headers'],
  ['Space', 'Select or clear the focused row'],
  ['Ctrl+A', 'Select every shown row'],
  ['/', 'Filter by repository, branch or group'],
  ['Enter', 'Open or close row details; collapse or expand a group'],
  ['1', 'All'],
  ['2', 'Dirty'],
  ['3', 'Behind'],
  ['4', 'Ahead'],
  ['5', 'Has MR'],
  ['6', 'Pipeline ✗'],
  ['7', 'No upstream'],
  ['Esc', 'Clear the filter, then the selection'],
  ['?', 'Show this help'],
  ['f', 'Fetch the focused row, or the selected rows'],
  ['F', 'Fetch all, or the selected rows'],
  ['p', 'Pull the focused row, or Pull (ff) the selected rows'],
  ['P', 'Push or publish the focused row'],
  ['b', 'Switch branch in the focused row, or in the selected rows'],
  ['n', 'Create a branch in the focused row, or in the selected rows'],
  ['t', 'Open a terminal in the focused row'],
  ['.', 'More actions for the focused row'],
  ['g', 'Open the focused row in the graph'],
  ['e', 'Reveal the focused row in the Explorer'],
  ['s', 'Show the focused row in Source Control'],
  ['m', 'Create the merge request of the focused row with its MR profile'],
  ['M', 'Create the merge request of the focused row in the drawer'],
  ['o', 'Open the merge request or pull request of the focused row'],
];

const GROUP_OPTIONS: readonly [GroupingMode, string][] = [
  ['parentFolder', 'Folder'],
  ['workspaceFolder', 'Workspace folder'],
  ['custom', 'Custom'],
  ['none', 'None'],
];

function readView(api: VsCodeApi): PersistedView {
  const saved = api.getState() as Partial<PersistedView> | undefined;
  return { ...EMPTY_VIEW, ...(saved ?? {}) };
}

function Symbol({ cell }: { cell: CellText }) {
  return (
    <span class="symbol" role="img" aria-label={cell.label} title={cell.label}>
      {cell.text}
    </span>
  );
}

export function App({ api, now: initialNow }: { api: VsCodeApi; now?: number }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [rows, setRows] = useState<Map<string, RowData>>(new Map());
  const [details, setDetails] = useState<Map<string, RowDetails>>(new Map());
  const [view, setView] = useState<PersistedView>(() => readView(api));
  const [now, setNow] = useState(initialNow ?? Date.now());
  const [helpOpen, setHelpOpen] = useState(false);
  /** The row whose more-actions menu is open */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  /** The row Show in RepoHangar asked to focus, until the grid shows it */
  const [revealId, setRevealId] = useState<string | null>(null);
  /** The Create MR drawer and the user suggestions for it (mr-creation: Create MR drawer) */
  const [drawer, setDrawer] = useState<DrawerData | null>(null);
  const [drawerUsers, setDrawerUsers] = useState<string[]>([]);
  /** The result panel of the last batch (batch-operations: Batch result panel) */
  const [batchPanel, setBatchPanel] = useState<BatchPanel | null>(null);
  const focusRequested = useRef(false);
  const filterRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const firstPaintSent = useRef(false);

  // Messages from the extension host.
  useEffect(() => {
    const onMessage = (event: MessageEvent<HostMessage>) => {
      const message = event.data;
      if (message.type === 'snapshot') {
        setSnapshot(message);
        setRows(new Map(message.rows.map((r) => [r.id, r])));
      } else if (message.type === 'patch') {
        setRows((current) => {
          const next = new Map(current);
          for (const id of message.removals) next.delete(id);
          for (const row of message.upserts) next.set(row.id, row);
          return next;
        });
        setDetails((current) => {
          if (!message.upserts.some((r) => current.has(r.id))) return current;
          const next = new Map(current);
          for (const row of message.upserts) next.delete(row.id);
          return next;
        });
      } else if (message.type === 'details') {
        setDetails((current) => new Map(current).set(message.id, message.details));
      } else if (message.type === 'reveal') {
        setRevealId(message.id);
      } else if (message.type === 'drawer') {
        setDrawer(message.data);
        setDrawerUsers([]);
      } else if (message.type === 'drawerUsers') {
        setDrawerUsers(message.users);
      } else if (message.type === 'batchResult') {
        setBatchPanel(message.panel);
      } else if (message.type === 'batchResultLine') {
        setBatchPanel((current) =>
          current && {
            ...current,
            counts: message.counts,
            canRetry: message.canRetry,
            lines: current.lines.map((line) => (line.id === message.line.id ? message.line : line)),
          },
        );
      }
    };
    window.addEventListener('message', onMessage);
    api.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, [api]);

  // Ages re-render every 60 s while the dashboard is visible.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    const timer = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  useEffect(() => api.setState(view), [api, view]);

  // The host runs the batch commands on the selected rows.
  useEffect(() => api.postMessage({ type: 'setSelection', ids: view.selected }), [api, view.selected]);

  const allRows = useMemo(() => [...rows.values()], [rows]);
  const items = useMemo(
    () => (snapshot ? layout(allRows, snapshot.grouping, snapshot.collapsed, view.filter, view.chips) : []),
    [allRows, snapshot, view.filter, view.chips],
  );

  // Details that are open after a reload or a patch need their data again.
  useEffect(() => {
    for (const id of view.expanded) {
      if (rows.has(id) && !details.has(id)) api.postMessage({ type: 'loadDetails', id });
    }
  }, [api, view.expanded, rows, details]);

  const focusKey = items.some((i) => i.key === view.focus) ? view.focus : (items[0]?.key ?? null);

  useLayoutEffect(() => {
    if (!focusRequested.current || !focusKey) return;
    focusRequested.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"] [data-focus]`)?.focus();
  });

  // The first rendered frame with rows, reported once for the first-paint target.
  useEffect(() => {
    if (firstPaintSent.current || snapshot?.state.kind !== 'grid' || allRows.length === 0) return;
    firstPaintSent.current = true;
    const rowsShown = allRows.length;
    const report = () => api.postMessage({ type: 'firstPaint', rows: rowsShown });
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(report);
    else setTimeout(report, 0);
  }, [api, snapshot, allRows]);

  const update = useCallback((patch: Partial<PersistedView>) => setView((v) => ({ ...v, ...patch })), []);

  const moveFocus = (key: string | null) => {
    focusRequested.current = true;
    update({ focus: key });
  };

  // Show in RepoHangar: the filter and chips are cleared when they hide the row; the host expands its group.
  useEffect(() => {
    if (revealId === null || !snapshot || !rows.has(revealId)) return;
    const key = rowKey(revealId);
    const inGrid = (filter: string, chips: ChipId[]) =>
      layout(allRows, snapshot.grouping, snapshot.collapsed, filter, chips).some((i) => i.key === key);
    if (!inGrid(view.filter, view.chips)) {
      if (!inGrid('', [])) return;
      update({ filter: '', chips: [] });
    }
    setRevealId(null);
    moveFocus(key);
  });

  const toggleChip = (chip: ChipId | 'all') => {
    if (chip === 'all') return update({ chips: [] });
    const chips = view.chips.includes(chip) ? view.chips.filter((c) => c !== chip) : [...view.chips, chip];
    update({ chips });
  };

  // From the latest state: two quick presses of Space can arrive before a render.
  const toggleSelected = (id: string) =>
    setView((v) => ({ ...v, selected: v.selected.includes(id) ? v.selected.filter((s) => s !== id) : [...v.selected, id] }));

  const toggleExpanded = (id: string) => {
    if (view.expanded.includes(id)) return update({ expanded: view.expanded.filter((e) => e !== id) });
    update({ expanded: [...view.expanded, id] });
    if (!details.has(id)) api.postMessage({ type: 'loadDetails', id });
  };

  const toggleGroup = (name: string) => api.postMessage({ type: 'toggleGroup', group: name });

  const runAction = (id: string, action: RowAction) => api.postMessage({ type: 'runAction', id, action });

  const runBatch = (trigger: BatchTrigger) => {
    const { action, ids } = batchTargets(trigger, view.selected, allRows.map((r) => r.id));
    api.postMessage({ type: 'runBatch', action, ids });
  };

  /** Switch or create a branch in the selected rows, the focused row (`n`) or every row; false when there is none. */
  const runBranch = (trigger: BranchTrigger, focused?: string): boolean => {
    const targets = branchTargets(trigger, view.selected, allRows.map((r) => r.id), focused);
    if (!targets || targets.ids.length === 0) return false;
    api.postMessage({ type: targets.action === 'switch' ? 'switchBranch' : 'createBranch', ids: targets.ids });
    return true;
  };

  const closeMenu = () => {
    setMenuFor(null);
    focusRequested.current = true;
    update({ focus: focusKey });
  };

  const activate = (item: GridItem | undefined, key: 'Enter' | ' ') => {
    if (!item) return;
    if (item.kind === 'group') {
      if (key === 'Enter') toggleGroup(item.name);
    } else if (key === 'Enter') {
      toggleExpanded(item.row.id);
    } else {
      toggleSelected(item.row.id);
    }
  };

  const onGridKey = (e: KeyboardEvent) => {
    const index = items.findIndex((i) => i.key === focusKey);
    const ctrl = snapshot?.platform === 'darwin' ? e.metaKey : e.ctrlKey;
    if (ctrl && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      const shown = items.flatMap((i) => (i.kind === 'row' ? [i.row.id] : []));
      return update({ selected: [...new Set([...view.selected, ...shown])] });
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const item = items[index];
    const focusedRow = item?.kind === 'row' ? item.row : undefined;
    const rowKeys: Record<string, RowAction> = {
      f: 'fetch',
      p: 'pull',
      P: 'push',
      b: 'switchBranch',
      t: 'terminal',
      g: 'graph',
      e: 'revealInExplorer',
      s: 'showInSourceControl',
      o: 'openReview',
      M: 'createMrEdit',
    };
    // m with rows selected is left to merge requests for a selection (roadmap phase 3).
    if (e.key === 'm' && view.selected.length === 0 && focusedRow) {
      e.preventDefault();
      return runAction(focusedRow.id, 'createMr');
    }
    if (e.key === 'F') {
      e.preventDefault();
      return runBatch('fetchAll');
    }
    if ((e.key === 'f' || e.key === 'p') && view.selected.length > 0) {
      e.preventDefault();
      return runBatch(e.key);
    }
    // b with rows selected and n (batch-operations: Branch keys); b alone switches the focused row below.
    if ((e.key === 'b' && view.selected.length > 0) || e.key === 'n') {
      if (runBranch(e.key, focusedRow?.id)) e.preventDefault();
      return;
    }
    if (focusedRow && (e.key === '.' || Object.prototype.hasOwnProperty.call(rowKeys, e.key))) {
      e.preventDefault();
      if (e.key === '.') return setMenuFor(focusedRow.id);
      return runAction(focusedRow.id, rowKeys[e.key] as RowAction);
    }
    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        if (index >= 0 && index < items.length - 1) moveFocus(items[index + 1]?.key ?? null);
        return;
      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        if (index > 0) moveFocus(items[index - 1]?.key ?? null);
        return;
      case ' ':
      case 'Enter':
        e.preventDefault();
        return activate(items[index], e.key);
      case '/':
        e.preventDefault();
        filterRef.current?.focus();
        return;
      case 'Escape':
        e.preventDefault();
        if (view.filter || view.chips.length > 0) return update({ filter: '', chips: [] });
        if (view.selected.length > 0) return update({ selected: [] });
        return;
      case '?':
        e.preventDefault();
        setHelpOpen(true);
        return;
      default: {
        const chip = CHIPS.find((c) => c.key === e.key);
        if (chip) {
          e.preventDefault();
          toggleChip(chip.id);
        }
      }
    }
  };

  const onFilterKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      update({ filter: '' });
      const first = layout(allRows, snapshot?.grouping ?? 'none', snapshot?.collapsed ?? [], '', view.chips).find(
        (i) => i.kind === 'row',
      );
      moveFocus(first?.key ?? null);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      moveFocus(items.find((i) => i.kind === 'row')?.key ?? null);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (helpOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setHelpOpen(false);
          focusRequested.current = true;
          update({ focus: focusKey });
        }
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest('input[type="text"], input[type="search"], select, [role="menu"], .batch-result')) return;
      onGridKey(e);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!snapshot) return <div class="empty">Loading repositories…</div>;
  if (snapshot.firstRun) return <FirstRun panel={snapshot.firstRun} api={api} />;
  // Until every row is computed it is not known whether the first-run panel replaces the grid; showing neither
  // keeps the grid from being swapped out under the user.
  if (snapshot.firstRunPending) {
    return (
      <div class="empty" role="status" data-first-run-pending="true">
        <p>Loading repositories…</p>
      </div>
    );
  }
  const empty = emptyStateText(snapshot.state);
  if (empty) {
    return (
      <div class="empty" role="status">
        <p>{empty.text}</p>
        {empty.button && (
          <button type="button" onClick={() => api.postMessage({ type: 'openSettings' })}>
            {empty.button}
          </button>
        )}
      </div>
    );
  }

  const memberships = allRows.map(chipMembership);
  const chipCount = (id: ChipId | 'all') => (id === 'all' ? allRows.length : memberships.filter((m) => m[id]).length);
  const chipActive = (id: ChipId | 'all') => (id === 'all' ? view.chips.length === 0 : view.chips.includes(id));

  return (
    <div class={drawer ? 'dashboard with-drawer' : 'dashboard'} data-graph={snapshot.graph} data-name-click={snapshot.nameClick} data-first-run-pending={snapshot.firstRunPending}>
      <div class="toolbar" role="toolbar" aria-label="Filters">
        <BatchButtons
          selected={view.selected.length}
          onRun={(action) => {
            if (action === 'switch' || action === 'createBranch') runBranch(action === 'switch' ? 'switchBranch' : 'createBranch');
            else runBatch(action === 'fetch' ? 'fetchAll' : 'pullAllFf');
          }}
        />
        <input
          ref={filterRef}
          type="search"
          class="filter"
          placeholder="Filter repositories (/)"
          aria-label="Filter repositories"
          value={view.filter}
          onInput={(e) => update({ filter: (e.currentTarget as HTMLInputElement).value })}
          onKeyDown={onFilterKey}
        />
        <div class="chips">
          {CHIPS.map((chip) => (
            <button
              type="button"
              key={chip.id}
              class={chipActive(chip.id) ? 'chip active' : 'chip'}
              aria-pressed={chipActive(chip.id)}
              data-chip={chip.id}
              onClick={() => toggleChip(chip.id)}
            >
              {`${chip.label} ${chipCount(chip.id)}`}
            </button>
          ))}
        </div>
        <label class="group-menu">
          Group
          <select
            value={snapshot.grouping}
            aria-label="Group"
            onChange={(e) => api.postMessage({ type: 'setGrouping', mode: (e.currentTarget as HTMLSelectElement).value as GroupingMode })}
          >
            {GROUP_OPTIONS.map(([mode, label]) => (
              <option key={mode} value={mode}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {batchPanel && (
        <BatchResult
          panel={batchPanel}
          onFix={(id, fix) => api.postMessage({ type: 'fix', id, fix })}
          onRetry={() => api.postMessage({ type: 'retryFailed' })}
          onClose={() => {
            setBatchPanel(null);
            api.postMessage({ type: 'closeBatchResult' });
          }}
        />
      )}

      <div class="grid" role="grid" aria-label="Repositories" aria-rowcount={items.length + 1} ref={gridRef}>
        <div class="row header" role="row">
          <span class="cell check" role="columnheader" aria-label="Selected" />
          <span class="cell" role="columnheader">Repository</span>
          <span class="cell" role="columnheader">Branch</span>
          <span class="cell" role="columnheader">Sync</span>
          <span class="cell" role="columnheader">Changes</span>
          <span class="cell" role="columnheader">Fetched</span>
          <span class="cell" role="columnheader">MR / PR</span>
        </div>
        {items.map((item) =>
          item.kind === 'group' ? (
            <div key={item.key} data-key={item.key} class="row group" role="row" aria-expanded={!item.collapsed}>
              <span
                class="cell"
                role="gridcell"
                aria-colspan={7}
                data-focus
                tabIndex={item.key === focusKey ? 0 : -1}
                onClick={() => {
                  update({ focus: item.key });
                  toggleGroup(item.name);
                }}
              >
                {`${item.collapsed ? '▸' : '▾'} ${item.name} (${item.count})`}
              </span>
            </div>
          ) : (
            <RowView
              key={item.key}
              row={item.row}
              itemKey={item.key}
              focused={item.key === focusKey}
              selected={view.selected.includes(item.row.id)}
              expanded={view.expanded.includes(item.row.id)}
              details={details.get(item.row.id)}
              now={now}
              staleFetchHours={snapshot.staleFetchHours}
              platform={snapshot.platform}
              graph={snapshot.graph}
              nameAction={nameClickAction(snapshot.nameClick)}
              menuOpen={menuFor === item.row.id}
              onFocus={() => update({ focus: item.key })}
              onToggleSelected={() => toggleSelected(item.row.id)}
              onAction={(action) => runAction(item.row.id, action)}
              onMenu={() => {
                update({ focus: item.key });
                setMenuFor(item.row.id);
              }}
              onMenuChoose={(action) => {
                closeMenu();
                runAction(item.row.id, action);
              }}
              onMenuClose={closeMenu}
              onSignIn={(host) => api.postMessage({ type: 'signIn', host })}
              onChooseProvider={(host) => api.postMessage({ type: 'chooseProvider', host })}
            />
          ),
        )}
      </div>

      <div class="footer">
        {view.selected.length > 0 && <span class="selected-count">{`${view.selected.length} selected`}</span>}
        <span class="hints">{`${ACTION_HINTS} · ${KEY_HINTS}`}</span>
      </div>

      {drawer && <Drawer data={drawer} users={drawerUsers} post={(m) => api.postMessage(m)} onClose={() => setDrawer(null)} />}

      {helpOpen && (
        <div class="help" role="dialog" aria-label="Keyboard shortcuts">
          <h2>Keyboard shortcuts</h2>
          <table>
            <tbody>
              {KEY_HELP.map(([key, action]) => (
                <tr key={key}>
                  <td>
                    <kbd>{key}</kbd>
                  </td>
                  <td>{action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Press Esc to close.</p>
        </div>
      )}
    </div>
  );
}

interface RowViewProps {
  row: RowData;
  itemKey: string;
  focused: boolean;
  selected: boolean;
  expanded: boolean;
  details: RowDetails | undefined;
  now: number;
  staleFetchHours: number;
  platform: string;
  graph: GraphVariant;
  /** What a click on the repository name runs (explorer-reveal: Repository name click) */
  nameAction: RowAction;
  menuOpen: boolean;
  onFocus(): void;
  onToggleSelected(): void;
  onAction(action: RowAction): void;
  onMenu(): void;
  onMenuChoose(action: RowAction): void;
  onMenuClose(): void;
  onSignIn(host: string): void;
  onChooseProvider(host: string): void;
}

function RowView(props: RowViewProps) {
  const { row } = props;
  const repo = repositoryCell(row);
  const branch = branchCell(row);
  const sync = shownSyncCell(row);
  const syncAction = syncClickAction(row);
  const changes = changesCell(row);
  const fetched = fetchedCell(row.lastFetch, props.now, props.staleFetchHours);
  return (
    <>
      <div
        data-key={props.itemKey}
        data-repo={row.name}
        class={`row repo${props.selected ? ' selected' : ''}${props.focused ? ' focused' : ''}`}
        role="row"
        aria-selected={props.selected}
        aria-expanded={props.expanded}
        onClick={props.onFocus}
      >
        <span class="cell check" role="gridcell">
          <input
            type="checkbox"
            tabIndex={-1}
            checked={props.selected}
            aria-label={`Select ${row.name}`}
            onClick={(e) => {
              e.stopPropagation();
              props.onToggleSelected();
            }}
          />
        </span>
        <span class="cell name" role="gridcell" data-focus data-col="repository" tabIndex={props.focused ? 0 : -1} title={repo.tooltip}>
          <button
            type="button"
            class="repo-name"
            tabIndex={-1}
            onClick={() => {
              props.onFocus();
              props.onAction(props.nameAction);
            }}
          >
            {repo.name}
          </button>
          {repo.badge && (
            <>
              {' '}
              <span class="badge">
                <Symbol cell={repo.badge} />
              </span>
            </>
          )}
        </span>
        <span class="cell clickable" role="gridcell" data-col="branch" onClick={() => props.onAction('switchBranch')}>
          <span class="branch-name">{branch.text}</span>
          {branch.badge && (
            <>
              {' '}
              <span class="badge upstream">
                <Symbol cell={branch.badge} />
              </span>
            </>
          )}
        </span>
        <span
          class={syncAction ? 'cell clickable' : 'cell'}
          role="gridcell"
          data-col="sync"
          data-job={row.job?.state}
          onClick={() => syncAction && props.onAction(syncAction)}
        >
          <span class="symbol" role="img" aria-label={sync.label} title={sync.tooltip ?? sync.label}>
            {sync.text}
          </span>
        </span>
        <span class="cell clickable" role="gridcell" data-col="changes" onClick={() => props.onAction('showInSourceControl')}>
          {changes.segments.length === 0 ? (
            <Symbol cell={changes} />
          ) : (
            changes.segments.map((s, i) => (
              <span key={s.text} class="segment">
                {i > 0 && ' '}
                <Symbol cell={s} />
              </span>
            ))
          )}
        </span>
        <span class="cell clickable" role="gridcell" data-col="fetched" onClick={() => props.onAction('fetch')}>
          {fetched.age}
          {fetched.stale && (
            <>
              {' '}
              <Symbol cell={fetched.stale} />
            </>
          )}
        </span>
        <span class="cell review" role="gridcell" data-col="review">
          <ReviewCellView row={row} now={props.now} onAction={props.onAction} onSignIn={props.onSignIn} onChooseProvider={props.onChooseProvider} />
        </span>
        <span class="cell actions" role="gridcell" aria-label="Actions">
          <HoverActions row={row} graph={props.graph} onAction={props.onAction} onMenu={props.onMenu} />
          {props.menuOpen && (
            <RowMenu
              row={row}
              platform={props.platform}
              graph={props.graph}
              onChoose={props.onMenuChoose}
              onClose={props.onMenuClose}
            />
          )}
        </span>
      </div>
      {props.expanded && (
        <div class="row details" role="row" data-details={row.name}>
          <span class="cell" role="gridcell" aria-colspan={7}>
            {props.details
              ? detailsLines(row, props.details, props.now).map((line) => <div class="detail-line">{line}</div>)
              : 'Loading…'}
            <ReviewDetailsView row={row} details={props.details} onAction={props.onAction} />
            <div class="detail-buttons">
              {detailsButtons(props.graph).map((button) => (
                <button
                  type="button"
                  key={button.action}
                  class="detail-button"
                  data-action={button.action}
                  tabIndex={-1}
                  onClick={() => props.onAction(button.action)}
                >
                  {button.label}
                </button>
              ))}
            </div>
          </span>
        </div>
      )}
    </>
  );
}

/** The MR / PR cell (hosting-providers: MR / PR cell). */
function ReviewCellView(props: {
  row: RowData;
  now: number;
  onAction(action: RowAction): void;
  onSignIn(host: string): void;
  onChooseProvider(host: string): void;
}) {
  const cell = rowReviewCell(props.row, props.now);
  if (cell.kind === 'create' || cell.kind === 'pushed') {
    const action: RowAction = cell.kind === 'create' ? 'createMrDirect' : 'openReview';
    return (
      <button
        type="button"
        class={cell.kind === 'create' ? 'review-button create' : 'review-ref'}
        tabIndex={-1}
        aria-label={cell.label}
        title={cell.tooltip ?? cell.label}
        data-review={cell.kind}
        onClick={(e) => {
          e.stopPropagation();
          props.onAction(action);
        }}
      >
        {cell.text}
      </button>
    );
  }
  if ((cell.kind === 'signIn' || cell.kind === 'unknownHost') && cell.host) {
    const host = cell.host;
    const run = cell.kind === 'signIn' ? () => props.onSignIn(host) : () => props.onChooseProvider(host);
    return (
      <button
        type="button"
        class="review-button"
        tabIndex={-1}
        aria-label={cell.label}
        title={cell.tooltip ?? cell.label}
        data-review={cell.kind}
        onClick={(e) => {
          e.stopPropagation();
          run();
        }}
      >
        {cell.text}
      </button>
    );
  }
  if (cell.kind !== 'review') {
    return (
      <span class={cell.stale ? 'symbol stale' : 'symbol'} role="img" aria-label={cell.label} title={cell.tooltip ?? cell.label} data-review={cell.kind}>
        {cell.text}
      </span>
    );
  }
  const [ref, ...rest] = cell.parts;
  return (
    <span class={cell.stale ? 'review-parts stale' : 'review-parts'} title={cell.tooltip} role="img" aria-label={cell.label} data-review="review">
      <button
        type="button"
        class="review-ref"
        tabIndex={-1}
        aria-label={ref?.label}
        onClick={(e) => {
          e.stopPropagation();
          props.onAction('openReview');
        }}
      >
        {ref?.text}
      </button>
      {rest.map((part) => (
        <span key={part.text} class="review-part" aria-hidden="true">
          {part.text}
        </span>
      ))}
    </span>
  );
}

/** The merge request lines and buttons of the row details (hosting-providers: Review lines in row details). */
function ReviewDetailsView(props: { row: RowData; details: RowDetails | undefined; onAction(action: RowAction): void }) {
  const review = reviewDetails(props.row);
  const provider = props.row.provider;
  if (!review || (provider !== 'gitlab' && provider !== 'github')) return null;
  const target = props.details?.compareTarget;
  const compare = compareState(props.row, target === null ? null : (target ?? undefined));
  const ready = compare.enabled && compare.target !== null;
  const labels: Record<string, [RowAction, string]> = {
    openReview: ['openReview', openReviewLabel(provider)],
    copyLink: ['copyReviewLink', 'Copy link'],
    compare: ['openCompare', (target ?? props.row.defaultBranch) ? `Compare with ${target ?? props.row.defaultBranch}` : 'Compare'],
  };
  return (
    <div class="review-details">
      {review.lines.map((line) => (
        <div class="detail-line" key={line.text}>
          {line.text}
          {line.button && (
            <>
              {' '}
              <button type="button" class="detail-button" tabIndex={-1} data-action="openPipeline" onClick={() => props.onAction('openPipeline')}>
                {line.button.label}
              </button>
            </>
          )}
        </div>
      ))}
      <div class="detail-buttons">
        {review.buttons.map((button) => {
          const [action, label] = labels[button] as [RowAction, string];
          const disabled = button === 'compare' && !ready;
          return (
            <button
              type="button"
              key={button}
              class="detail-button"
              data-action={action}
              tabIndex={-1}
              disabled={disabled}
              title={disabled ? (compare.enabled ? 'Default branch unknown' : compare.reason) : undefined}
              onClick={() => props.onAction(action)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const FIRST_RUN_BUTTONS: Record<FirstRunButton, string> = {
  signInGitHub: 'Sign in to GitHub',
  pasteToken: 'Paste a token…',
  skip: 'Skip — git only',
};

/** The first-run hosts panel (provider-auth: First-run hosts panel, W10). */
function FirstRun({ panel, api }: { panel: FirstRunPanel; api: VsCodeApi }) {
  return (
    <div class="first-run" role="region" aria-label="Connect your Git hosts">
      <p class="first-run-summary">{panel.summary}</p>
      {panel.hosts.map((host) => (
        <div class="first-run-host" key={host.host} data-host={host.host}>
          <span class="first-run-line">{host.line}</span>
          {host.buttons.map((button) => (
            <button
              type="button"
              key={button}
              data-button={button}
              onClick={() => api.postMessage(button === 'skip' ? { type: 'skipHost', host: host.host } : { type: 'signIn', host: host.host })}
            >
              {FIRST_RUN_BUTTONS[button]}
            </button>
          ))}
        </div>
      ))}
      <button type="button" class="first-run-done" onClick={() => api.postMessage({ type: 'firstRunDone' })}>
        Open dashboard →
      </button>
    </div>
  );
}

export { rowKey };
