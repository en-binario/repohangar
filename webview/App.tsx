import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { batchTargets, type BatchTrigger } from '../src/shared/batch';
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
import type { ChipId, GroupingMode, RowAction, RowData, RowDetails } from '../src/shared/model';
import type { HostMessage, Snapshot, ViewMessage } from '../src/shared/protocol';
import { detailsButtons } from '../src/shared/rowMenu';
import { layout, rowKey, type GridItem } from './layout';
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
 * keys, shown before the navigation hints.
 */
export const ACTION_HINTS = 'f fetch · p pull · P push · b switch · t terminal · . more · g graph · e explorer · s source control';
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
  ['7', 'No upstream'],
  ['Esc', 'Clear the filter, then the selection'],
  ['?', 'Show this help'],
  ['f', 'Fetch the focused row, or the selected rows'],
  ['F', 'Fetch all, or the selected rows'],
  ['p', 'Pull the focused row, or Pull (ff) the selected rows'],
  ['P', 'Push or publish the focused row'],
  ['b', 'Switch branch in the focused row'],
  ['t', 'Open a terminal in the focused row'],
  ['.', 'More actions for the focused row'],
  ['g', 'Open the focused row in the graph'],
  ['e', 'Reveal the focused row in the Explorer'],
  ['s', 'Show the focused row in Source Control'],
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
    };
    if (e.key === 'F') {
      e.preventDefault();
      return runBatch('fetchAll');
    }
    if ((e.key === 'f' || e.key === 'p') && view.selected.length > 0) {
      e.preventDefault();
      return runBatch(e.key);
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
      if (target?.closest('input[type="text"], input[type="search"], select, [role="menu"]')) return;
      onGridKey(e);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!snapshot) return <div class="empty">Loading repositories…</div>;
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
    <div class="dashboard" data-graph={snapshot.graph} data-name-click={snapshot.nameClick}>
      <div class="toolbar" role="toolbar" aria-label="Filters">
        <BatchButtons selected={view.selected.length} onRun={(action) => runBatch(action === 'fetch' ? 'fetchAll' : 'pullAllFf')} />
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

      <div class="grid" role="grid" aria-label="Repositories" aria-rowcount={items.length + 1} ref={gridRef}>
        <div class="row header" role="row">
          <span class="cell check" role="columnheader" aria-label="Selected" />
          <span class="cell" role="columnheader">Repository</span>
          <span class="cell" role="columnheader">Branch</span>
          <span class="cell" role="columnheader">Sync</span>
          <span class="cell" role="columnheader">Changes</span>
          <span class="cell" role="columnheader">Fetched</span>
        </div>
        {items.map((item) =>
          item.kind === 'group' ? (
            <div key={item.key} data-key={item.key} class="row group" role="row" aria-expanded={!item.collapsed}>
              <span
                class="cell"
                role="gridcell"
                aria-colspan={6}
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
            />
          ),
        )}
      </div>

      <div class="footer">
        {view.selected.length > 0 && <span class="selected-count">{`${view.selected.length} selected`}</span>}
        <span class="hints">{`${ACTION_HINTS} · ${KEY_HINTS}`}</span>
      </div>

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
          <span class="cell" role="gridcell" aria-colspan={6}>
            {props.details
              ? detailsLines(row, props.details, props.now).map((line) => <div class="detail-line">{line}</div>)
              : 'Loading…'}
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

export { rowKey };
