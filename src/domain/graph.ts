import type { RelationNode, RelationEdge } from './relations';

export type Graph = { nodes: RelationNode[]; edges: RelationEdge[] };
export type Point = { x: number; y: number };

export function graphLabels(
  nodes: RelationNode[],
  positions: Map<string, Point>,
  priority?: string,
) {
  const result = new Map<
    string,
    { text: string; x: number; y: number; anchor: 'middle' | 'start' | 'end' }
  >();
  const occupied: { left: number; right: number; top: number; bottom: number }[] = [];
  for (const n of [...nodes].sort(
    (a, b) => Number(b.id === priority) - Number(a.id === priority),
  )) {
    const p = positions.get(n.id)!;
    const text = n.label.length > 18 ? n.label.slice(0, 18) + '…' : n.label;
    const width = [...text].reduce((sum, c) => sum + (c.charCodeAt(0) > 255 ? 14 : 8), 8);
    const candidates = [
      { x: 0, y: 29, anchor: 'middle' as const },
      { x: 0, y: -21, anchor: 'middle' as const },
      { x: 20, y: 5, anchor: 'start' as const },
      { x: -20, y: 5, anchor: 'end' as const },
    ];
    for (const [index, candidate] of candidates.entries()) {
      const left =
        p.x +
        candidate.x -
        (candidate.anchor === 'middle' ? width / 2 : candidate.anchor === 'end' ? width : 0);
      const rect = {
        left,
        right: left + width,
        top: p.y + candidate.y - 15,
        bottom: p.y + candidate.y + 5,
      };
      const collision =
        occupied.some(
          (r) =>
            rect.left < r.right &&
            rect.right > r.left &&
            rect.top < r.bottom &&
            rect.bottom > r.top,
        ) ||
        [...positions].some(
          ([id, q]) =>
            id !== n.id &&
            q.x + 12 > rect.left &&
            q.x - 12 < rect.right &&
            q.y + 12 > rect.top &&
            q.y - 12 < rect.bottom,
        );
      if (!collision || (n.id === priority && index === candidates.length - 1)) {
        result.set(n.id, { text, ...candidate });
        occupied.push(rect);
        break;
      }
    }
  }
  return result;
}

export function graphSlice(
  graph: Graph,
  focus: string,
  depth: number,
  global: boolean,
  query: string,
  hidden: Set<string>,
  limit = 160,
) {
  const distances = new Map([[focus, 0]]);
  if (!global) {
    const adjacent = new Map<string, Set<string>>();
    for (const e of graph.edges) {
      if (!adjacent.has(e.source)) adjacent.set(e.source, new Set());
      if (!adjacent.has(e.target)) adjacent.set(e.target, new Set());
      adjacent.get(e.source)!.add(e.target);
      adjacent.get(e.target)!.add(e.source);
    }
    let frontier = [focus];
    for (let d = 1; d <= depth; d++) {
      const next: string[] = [];
      for (const id of frontier)
        for (const other of adjacent.get(id) ?? [])
          if (!distances.has(other)) {
            distances.set(other, d);
            next.push(other);
          }
      frontier = next;
    }
  }
  const search = query.trim().toLocaleLowerCase();
  const matches = graph.nodes
    .filter(
      (n) =>
        (global || distances.has(n.id)) &&
        !hidden.has(n.kind) &&
        `${n.label} ${n.meta}`.toLocaleLowerCase().includes(search),
    )
    .sort(
      (a, b) =>
        (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity) ||
        a.id.localeCompare(b.id),
    );
  const nodes = matches.slice(0, limit);
  const ids = new Set(nodes.map((n) => n.id));
  // Multiple roles between two objects stay readable as a single connection.
  const pairs = new Map<string, RelationEdge>();
  for (const e of graph.edges)
    if (ids.has(e.source) && ids.has(e.target) && e.source !== e.target) {
      const key = [e.source, e.target].sort().join('\0');
      const previous = pairs.get(key);
      if (previous)
        previous.label = [...new Set([...previous.label.split(' / '), e.label])].join(' / ');
      else pairs.set(key, { ...e });
    }
  return { nodes, edges: [...pairs.values()], total: matches.length };
}

/** Settled once; moving a node never changes its business relationships. */
export function graphLayout(graph: Graph, width: number, height: number): Map<string, Point> {
  const positions = new Map<string, Point>();
  const count = graph.nodes.length;
  graph.nodes.forEach((n, i) => {
    const angle = i * 2.399963;
    const radius = Math.sqrt((i + 0.5) / Math.max(count, 1));
    positions.set(n.id, {
      x: width / 2 + Math.cos(angle) * radius * width * 0.35,
      y: height / 2 + Math.sin(angle) * radius * height * 0.35,
    });
  });
  for (let step = 0; step < 220; step++) {
    const forces = new Map(graph.nodes.map((n) => [n.id, { x: 0, y: 0 }]));
    for (let i = 0; i < count; i++)
      for (let j = i + 1; j < count; j++) {
        const a = positions.get(graph.nodes[i].id)!,
          b = positions.get(graph.nodes[j].id)!;
        const dx = a.x - b.x,
          dy = a.y - b.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const strength = Math.min(12, 7000 / (distance * distance));
        const f = forces.get(graph.nodes[i].id)!,
          g = forces.get(graph.nodes[j].id)!;
        f.x += (dx / distance) * strength;
        f.y += (dy / distance) * strength;
        g.x -= (dx / distance) * strength;
        g.y -= (dy / distance) * strength;
        if (Math.abs(dy) < 34 && Math.abs(dx) < 125) {
          const direction = dy >= 0 ? 1 : -1;
          f.y += direction * 2;
          g.y -= direction * 2;
        }
      }
    for (const e of graph.edges) {
      const a = positions.get(e.source),
        b = positions.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const strength = (distance - 135) * 0.025;
      const f = forces.get(e.source)!,
        g = forces.get(e.target)!;
      f.x += (dx / distance) * strength;
      f.y += (dy / distance) * strength;
      g.x -= (dx / distance) * strength;
      g.y -= (dy / distance) * strength;
    }
    for (const n of graph.nodes) {
      const p = positions.get(n.id)!,
        f = forces.get(n.id)!;
      f.x += (width / 2 - p.x) * 0.004;
      f.y += (height / 2 - p.y) * 0.004;
      const cooling = 1 - step / 280;
      p.x += Math.max(-5, Math.min(5, f.x)) * cooling;
      p.y += Math.max(-5, Math.min(5, f.y)) * cooling;
    }
  }
  if (!count) return positions;
  const xs = [...positions.values()].map((p) => p.x),
    ys = [...positions.values()].map((p) => p.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const scale = Math.min(
    3,
    Math.max(1, width - 150) / Math.max(1, maxX - minX),
    Math.max(1, height - 90) / Math.max(1, maxY - minY),
  );
  for (const p of positions.values()) {
    p.x = width / 2 + (p.x - (minX + maxX) / 2) * scale;
    p.y = height / 2 + (p.y - (minY + maxY) / 2) * scale;
  }
  return positions;
}
