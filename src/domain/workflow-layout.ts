import type { Proceeding } from './types';
/** A forest: branches share their real predecessor; independent flows stay separate. */
export function workflowLayout(programs: Proceeding[]) {
  const width = 210,
    height = 156,
    stepX = 278,
    stepY = 184;
  const nodes: Array<{ program: Proceeding; x: number; y: number }> = [];
  const known = new Set(programs.map((p) => p.id));
  const visited = new Set<string>();
  let row = 0;
  function place(p: Proceeding, depth: number): number {
    if (visited.has(p.id)) return row * stepY;
    visited.add(p.id);
    const node = { program: p, x: depth * stepX, y: row * stepY };
    nodes.push(node);
    const children = programs.filter((c) => c.parentId === p.id && !visited.has(c.id));
    if (children.length) {
      const ys = children.map((c) => place(c, depth + 1));
      node.y = (ys[0] + ys[ys.length - 1]) / 2;
    } else row++;
    return node.y;
  }
  programs.filter((p) => !p.parentId || !known.has(p.parentId)).forEach((p) => place(p, 0));
  programs.filter((p) => !visited.has(p.id)).forEach((p) => place(p, 0));
  return {
    nodes,
    width: nodes.length ? Math.max(...nodes.map((n) => n.x)) + width : 0,
    height: nodes.length ? Math.max(...nodes.map((n) => n.y)) + height : 0,
    nodeWidth: width,
    nodeHeight: height,
  };
}
