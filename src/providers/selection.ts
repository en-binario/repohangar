// GraphQL selections as lists of field paths (hosting-providers design D-2), so a schema error removes one path and
// the query is rebuilt. No vscode import.

import type { Selection } from './provider';

/**
 * Builds a selection set from paths: `['iid', 'headPipeline.status']` → `iid headPipeline { status }`. A path segment
 * may carry arguments (`commits(last: 1).nodes.commit.statusCheckRollup.state`).
 */
export function selectionSet(paths: Selection): string {
  interface Node {
    children: Map<string, Node>;
  }
  const root: Node = { children: new Map() };
  for (const path of paths) {
    let node = root;
    for (const segment of splitPath(path)) {
      let child = node.children.get(segment);
      if (!child) {
        child = { children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
  }
  const render = (node: Node): string =>
    [...node.children.entries()].map(([name, child]) => (child.children.size ? `${name} { ${render(child)} }` : name)).join(' ');
  return render(root);
}

/** Path segments, split at dots outside parentheses. */
function splitPath(path: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of path) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === '.' && depth === 0) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

/** The field name of a segment, without its arguments. */
function fieldName(segment: string): string {
  return segment.replace(/\(.*$/, '');
}

/**
 * The selection without the paths that go through `field` on `type`, where `owners` maps each type to the path prefix
 * whose last segment has that type (`MergeRequest` → '', `Pipeline` → 'headPipeline'). Returns undefined when the field
 * is not in the selection.
 */
export function withoutField(paths: Selection, owners: Record<string, string>, type: string, field: string): Selection | undefined {
  const prefix = owners[type];
  if (prefix === undefined) return undefined;
  const depth = prefix === '' ? 0 : splitPath(prefix).length;
  const next = paths.filter((path) => {
    const segments = splitPath(path);
    const ownerMatches = prefix === '' || segments.slice(0, depth).map(fieldName).join('.') === splitPath(prefix).map(fieldName).join('.');
    return !(ownerMatches && segments.length > depth && fieldName(segments[depth] as string) === field);
  });
  return next.length === paths.length ? undefined : next;
}

/** The value at a path of a node, ignoring the arguments of segments. */
export function valueAt(node: unknown, path: string): unknown {
  let value: unknown = node;
  for (const segment of splitPath(path)) {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) value = value[value.length - 1];
    if (value === null || value === undefined) return value;
    value = (value as Record<string, unknown>)[fieldName(segment)];
  }
  return value;
}

export function has(paths: Selection, path: string): boolean {
  return paths.includes(path);
}
