// Wraps every Markdown table in a focusable, labelled region. Wide tables scroll sideways inside the region instead
// of widening the page, and keyboard users can focus the region to scroll it (WCAG 2.1.1, axe
// `scrollable-region-focusable`). No dependencies: a plain walk over the HAST tree.
export default function rehypeTableRegion() {
  return (tree) => {
    walk(tree);
  };
}

function walk(node) {
  if (!Array.isArray(node.children)) return;
  node.children = node.children.map((child) => {
    if (child.type === 'element' && child.tagName === 'table') {
      return {
        type: 'element',
        tagName: 'div',
        properties: { className: ['table-region'], role: 'region', tabIndex: 0, ariaLabel: label(child) },
        children: [child],
      };
    }
    walk(child);
    return child;
  });
}

/** "Table: <first header cell>", so screen readers can tell regions apart. */
function label(table) {
  const first = find(table, (n) => n.type === 'element' && n.tagName === 'th');
  const text = first ? textOf(first).trim() : '';
  return text ? `Table: ${text}` : 'Table';
}

function find(node, test) {
  if (test(node)) return node;
  for (const child of node.children ?? []) {
    const hit = find(child, test);
    if (hit) return hit;
  }
  return null;
}

function textOf(node) {
  if (node.type === 'text') return node.value;
  return (node.children ?? []).map(textOf).join('');
}
