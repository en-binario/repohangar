// The dashboard's action controls (git-operations design D-6, explorer-open-in-git-graph design D-8): the toolbar batch
// buttons, the hover buttons of a row, its more-actions menu and the action a click on the Sync cell runs.

import { Fragment } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { toolbarLabel } from '../src/shared/batch';
import { syncCell } from '../src/shared/format';
import { graphLabel, type GraphVariant } from '../src/shared/graph';
import type { BatchAction, RowAction, RowData } from '../src/shared/model';
import { rowMenu, type MenuItem } from '../src/shared/rowMenu';

/** Whether Push publishes the branch: HEAD on a branch without upstream. */
export function publishes(row: RowData): boolean {
  return row.head.kind === 'branch' && !row.head.upstream && !row.operation;
}

/** The action of a click on the Sync cell, by what it reads: `↓n`, `↑n`, `⇡ publish` or `↑a ↓b`. */
export function syncClickAction(row: RowData): RowAction | undefined {
  const text = syncCell(row).text;
  if (text === '⇡ publish') return 'push';
  const ahead = text.includes('↑');
  const behind = text.includes('↓');
  if (ahead && behind) return 'sync';
  if (behind) return 'pull';
  if (ahead) return 'push';
  return undefined;
}

export function BatchButtons({ selected, onRun }: { selected: number; onRun(action: BatchAction): void }) {
  return (
    <div class="batch-buttons">
      <button type="button" class="batch" data-batch="fetch" onClick={() => onRun('fetch')}>
        {toolbarLabel('fetch', selected)}
      </button>
      <button type="button" class="batch" data-batch="pullFf" onClick={() => onRun('pullFf')}>
        {toolbarLabel('pullFf', selected)}
      </button>
    </div>
  );
}

interface HoverProps {
  row: RowData;
  graph: GraphVariant;
  onAction(action: RowAction): void;
  onMenu(): void;
}

/** The buttons at the right edge of a hovered or focused row; out of the tab order, since keys cover them. */
export function HoverActions({ row, graph, onAction, onMenu }: HoverProps) {
  const push = publishes(row) ? 'Publish' : 'Push';
  const graphName = graphLabel(graph);
  const buttons: [string, string, () => void][] = [
    ['⟳', 'Fetch', () => onAction('fetch')],
    ['⇣', 'Pull', () => onAction('pull')],
    ['⇡', push, () => onAction('push')],
    ['⎇', 'Switch Branch…', () => onAction('switchBranch')],
    // mr-creation: Create entry points (the hover button)
    ...(row.provider === 'gitlab' || row.provider === 'github' ? [['⤴', 'Create MR', () => onAction('createMr')] as [string, string, () => void]] : []),
    ...(graphName ? [['◈', graphName, () => onAction('graph')] as [string, string, () => void]] : []),
    ['▤', 'Reveal in Explorer', () => onAction('revealInExplorer')],
    ['⋯', 'More Actions…', onMenu],
  ];
  return (
    <span class="row-actions">
      {buttons.map(([symbol, name, run]) => (
        <button
          type="button"
          key={name}
          class="row-action"
          tabIndex={-1}
          aria-label={name}
          title={name}
          onClick={(e) => {
            e.stopPropagation();
            run();
          }}
        >
          {symbol}
        </button>
      ))}
    </span>
  );
}

interface MenuProps {
  row: RowData;
  platform: string;
  graph: GraphVariant;
  onChoose(action: RowAction): void;
  onClose(): void;
}

/** The more-actions menu of a row, operable with ↑, ↓, Enter and Esc. */
export function RowMenu({ row, platform, graph, onChoose, onClose }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const groups = rowMenu(row, platform, graph);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, []);

  const onKey = (e: KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    e.stopPropagation();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        items[(index + 1) % items.length]?.focus();
        return;
      case 'ArrowUp':
        e.preventDefault();
        items[(index - 1 + items.length) % items.length]?.focus();
        return;
      case 'Escape':
        e.preventDefault();
        onClose();
        return;
      case 'Tab':
        e.preventDefault();
        return;
    }
  };

  const item = (entry: MenuItem) => (
    <div
      key={entry.action}
      role="menuitem"
      class="menu-item"
      tabIndex={-1}
      data-action={entry.action}
      aria-disabled={!entry.enabled}
      aria-keyshortcuts={entry.key}
      title={entry.enabled ? undefined : entry.reason}
      onClick={() => entry.enabled && onChoose(entry.action)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          if (entry.enabled) onChoose(entry.action);
        }
      }}
    >
      <span>{entry.label}</span>
      {entry.key && <kbd>{entry.key}</kbd>}
    </div>
  );

  return (
    <div
      ref={ref}
      class="row-menu"
      role="menu"
      aria-label={`Actions for ${row.name}`}
      onKeyDown={onKey}
      // A click in the menu is not a click on the cell under it.
      onClick={(e) => e.stopPropagation()}
    >
      {groups.map((group, i) => (
        <Fragment key={i}>
          {i > 0 && <div role="separator" class="menu-separator" />}
          {group.map(item)}
        </Fragment>
      ))}
    </div>
  );
}
