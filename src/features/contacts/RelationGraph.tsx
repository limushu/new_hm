import { useMemo, useState } from 'react';
import { Minus, Plus, RotateCcw, ArrowUpRight } from 'lucide-react';
import type { Workspace } from '../../domain/types';
import { workspaceGraph, type RelationNode } from '../../domain/relations';
export default function RelationGraph({
  data,
  focusId,
  onContact,
  onCase,
}: {
  data: Workspace;
  focusId: string;
  onContact?: (id: string) => void;
  onCase: (id: string) => void;
}) {
  const [focus, setFocus] = useState(focusId);
  const [depth, setDepth] = useState(2);
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; origin: typeof pan } | null>(null);
  const graph = useMemo(() => workspaceGraph(data), [data]);
  const visible = useMemo(() => {
    const distances = new Map([[focus, 0]]);
    for (let d = 0; d < depth; d++)
      for (const e of graph.edges) {
        if (distances.get(e.source) === d && !distances.has(e.target))
          distances.set(e.target, d + 1);
        if (distances.get(e.target) === d && !distances.has(e.source))
          distances.set(e.source, d + 1);
      }
    const nodes = graph.nodes
      .filter((n) => distances.has(n.id))
      .sort(
        (a, b) =>
          distances.get(a.id)! - distances.get(b.id)! || a.label.localeCompare(b.label, 'zh-CN'),
      )
      .slice(0, 40);
    const edges = graph.edges.filter(
      (e) => nodes.some((n) => n.id === e.source) && nodes.some((n) => n.id === e.target),
    );
    const positions = new Map<string, { x: number; y: number }>();
    for (let d = 0; d <= depth; d++) {
      const ring = nodes.filter((n) => distances.get(n.id) === d);
      ring.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / Math.max(ring.length, 1) - 0.65 + d * 0.38;
        positions.set(
          n.id,
          d === 0
            ? { x: 450, y: 260 }
            : {
                x: 450 + Math.cos(angle) * (d === 1 ? 175 : 335),
                y: 260 + Math.sin(angle) * (d === 1 ? 125 : 210),
              },
        );
      });
    }
    // Settle a small, deterministic local graph; keep the focused object anchored.
    for (let step = 0; step < 160; step++) {
      const force = new Map(nodes.map((n) => [n.id, { x: 0, y: 0 }]));
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = positions.get(nodes[i].id)!;
          const b = positions.get(nodes[j].id)!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distance = Math.max(12, Math.hypot(dx, dy));
          const strength = 30000 / (distance * distance);
          const f = force.get(nodes[i].id)!;
          const g = force.get(nodes[j].id)!;
          f.x += (dx / distance) * strength;
          f.y += (dy / distance) * strength;
          g.x -= (dx / distance) * strength;
          g.y -= (dy / distance) * strength;
        }
      for (const e of edges) {
        const a = positions.get(e.source)!;
        const b = positions.get(e.target)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const strength = (distance - 205) * 0.025;
        const f = force.get(e.source)!;
        const g = force.get(e.target)!;
        f.x += (dx / distance) * strength;
        f.y += (dy / distance) * strength;
        g.x -= (dx / distance) * strength;
        g.y -= (dy / distance) * strength;
      }
      for (const n of nodes)
        if (n.id !== focus) {
          const p = positions.get(n.id)!;
          const f = force.get(n.id)!;
          p.x = Math.max(115, Math.min(785, p.x + Math.max(-5, Math.min(5, f.x))));
          p.y = Math.max(65, Math.min(445, p.y + Math.max(-5, Math.min(5, f.y))));
        }
    }
    return { nodes, edges, positions, total: distances.size };
  }, [graph, focus, depth]);
  const selected = graph.nodes.find((n) => n.id === focus);
  const lit = hover
    ? new Set([
        hover,
        ...visible.edges.flatMap((e) =>
          e.source === hover ? [e.target] : e.target === hover ? [e.source] : [],
        ),
      ])
    : null;
  function choose(n: RelationNode) {
    setFocus(n.id);
    setPan({ x: 0, y: 0 });
    if (n.id.startsWith('contact:')) onContact?.(n.entityId);
  }
  return (
    <div className="local-graph">
      <div className="graph-controls">
        <span>
          {selected?.label}{' '}
          <small>
            · {visible.nodes.length} 个关联节点
            {visible.total > 40 ? ` / 共 ${visible.total} 个` : ''}
          </small>
        </span>
        <div>
          <label>
            层级
            <select
              aria-label="关系图层级"
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
            >
              <option value={1}>1 层</option>
              <option value={2}>2 层</option>
              <option value={3}>3 层</option>
            </select>
          </label>
          <button
            type="button"
            aria-label="缩小关系图"
            onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
          >
            <Minus />
          </button>
          <button
            type="button"
            aria-label="放大关系图"
            onClick={() => setZoom((z) => Math.min(2, z + 0.2))}
          >
            <Plus />
          </button>
          <button
            type="button"
            aria-label="重置关系图"
            onClick={() => {
              setFocus(focusId);
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            <RotateCcw />
          </button>
        </div>
      </div>
      <svg
        viewBox="0 0 900 530"
        role="group"
        aria-label="案件、办理程序、法院和法官的局部关系图"
        onPointerDown={(e) => {
          if ((e.target as Element).closest('[role="button"]')) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ x: e.clientX, y: e.clientY, origin: pan });
        }}
        onPointerMove={(e) => {
          if (drag) {
            const scale = 900 / e.currentTarget.getBoundingClientRect().width;
            setPan({
              x: drag.origin.x + (e.clientX - drag.x) * scale,
              y: drag.origin.y + (e.clientY - drag.y) * scale,
            });
          }
        }}
        onPointerUp={() => setDrag(null)}
      >
        <g
          transform={`translate(${450 * (1 - zoom) + pan.x} ${260 * (1 - zoom) + pan.y}) scale(${zoom})`}
        >
          {visible.edges.map((e, i) => {
            const a = visible.positions.get(e.source)!;
            const b = visible.positions.get(e.target)!;
            const highlighted = hover === e.source || hover === e.target;
            return (
              <g
                key={i}
                className={`graph-edge ${highlighted ? 'is-lit' : ''}`}
                style={{ opacity: lit && !highlighted ? 0.15 : 1 }}
              >
                <path
                  d={`M${a.x} ${a.y} Q${(a.x + b.x) / 2 + 18} ${(a.y + b.y) / 2 - 16} ${b.x} ${b.y}`}
                />
                <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8} textAnchor="middle">
                  {e.label}
                </text>
              </g>
            );
          })}
          {visible.nodes.map((n) => {
            const p = visible.positions.get(n.id)!;
            return (
              <g
                key={n.id}
                role="button"
                tabIndex={0}
                aria-label={`查看${n.label}`}
                className={`graph-node kind-${n.kind} ${focus === n.id ? 'is-focused' : ''}`}
                style={{ opacity: lit && !lit.has(n.id) ? 0.3 : 1 }}
                transform={`translate(${p.x} ${p.y})`}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => choose(n)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    choose(n);
                  }
                }}
              >
                <rect x={-105} y={-20} width={210} height={60} fill="transparent" />
                <circle r={focus === n.id ? 13 : 7} />
                <text y={28} textAnchor="middle">
                  {n.label.length > 16 ? n.label.slice(0, 16) + '…' : n.label}
                </text>
                <title>
                  {n.label} {n.meta}
                </title>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="graph-footer">
        <span>点击节点查看局部关系 · 拖动空白处移动</span>
        {selected?.kind === 'case' && (
          <button type="button" onClick={() => onCase(selected.entityId)}>
            打开案件
            <ArrowUpRight />
          </button>
        )}
        {selected?.kind === 'program' && (
          <button
            type="button"
            onClick={() => {
              const p = data.proceedings.find((p) => p.id === selected.entityId);
              if (p) onCase(p.caseId);
            }}
          >
            打开所属案件
            <ArrowUpRight />
          </button>
        )}
      </div>
    </div>
  );
}
