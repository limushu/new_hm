import Select from '../../components/Select';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Minus,
  Plus,
  RotateCcw,
  ArrowUpRight,
  Search,
  Crosshair,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import type { Workspace } from '../../domain/types';
import { workspaceGraph, type RelationNode } from '../../domain/relations';
import { graphSlice, graphLayout, graphLabels, type Point } from '../../domain/graph';
import './relation-graph.css';

const kinds: { id: RelationNode['kind']; label: string }[] = [
  { id: 'case', label: '案件' },
  { id: 'program', label: '办理流程' },
  { id: 'person', label: '个人' },
  { id: 'organization', label: '机构' },
  { id: 'court', label: '法院' },
  { id: 'judge', label: '法官' },
];
const initialView = { x: 0, y: 0, zoom: 1 };
export default function RelationGraph({
  data,
  focusId,
  onContact,
  onCase,
  initialGlobal = false,
}: {
  data: Workspace;
  focusId: string;
  onContact?: (id: string) => void;
  onCase: (id: string) => void;
  initialGlobal?: boolean;
}) {
  const [focus, setFocus] = useState(focusId);
  const [selectedId, setSelected] = useState<string | null>(initialGlobal ? null : focusId);
  const [depth, setDepth] = useState(2);
  const [global, setGlobal] = useState(initialGlobal);
  const [query, setQuery] = useState('');
  const [hidden, setHidden] = useState(new Set<string>());
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState(initialView);
  const [expanded, setExpanded] = useState(false);
  const [box, setBox] = useState({ width: 800, height: 390 });
  const [manual, setManual] = useState(new Map<string, Point>());
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    id: string | null;
    start: Point;
    origin: Point;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const graph = useMemo(() => workspaceGraph(data), [data]);
  const visible = useMemo(
    () => graphSlice(graph, focus, depth, global, query, hidden),
    [graph, focus, depth, global, query, hidden],
  );
  const layout = useMemo(() => graphLayout(visible, box.width, box.height), [visible, box]);
  const positions = new Map([...layout].map(([id, p]) => [id, manual.get(id) ?? p]));
  const selected = visible.nodes.find((n) => n.id === selectedId);
  const activeId = hover ?? selected?.id;
  const labels = graphLabels(visible.nodes, positions, activeId);
  const adjacent = new Set(activeId ? [activeId] : []);
  const degree = new Map<string, number>();
  for (const e of visible.edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    if (e.source === activeId) adjacent.add(e.target);
    if (e.target === activeId) adjacent.add(e.source);
  }
  const connections = selected
    ? visible.edges
        .filter((e) => e.source === selected.id || e.target === selected.id)
        .map((e) => ({
          node: visible.nodes.find(
            (n) => n.id === (e.source === selected.id ? e.target : e.source),
          )!,
          label: e.label,
        }))
    : [];
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width),
        height = Math.round(entry.contentRect.height);
      if (width > 0 && height > 0)
        setBox((old) => (old.width === width && old.height === height ? old : { width, height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  function point(clientX: number, clientY: number, element: SVGGraphicsElement = svg.current!) {
    const matrix = element.getScreenCTM();
    return matrix
      ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
      : { x: clientX, y: clientY };
  }
  function zoomBy(factor: number, anchor: Point = { x: box.width / 2, y: box.height / 2 }) {
    setView((old) => {
      const zoom = Math.max(0.35, Math.min(3.5, old.zoom * factor));
      const ratio = zoom / old.zoom;
      return {
        zoom,
        x: anchor.x - (anchor.x - old.x) * ratio,
        y: anchor.y - (anchor.y - old.y) * ratio,
      };
    });
  }
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const anchor = point(event.clientX, event.clientY, element);
      setView((old) => {
        const zoom = Math.max(
          0.35,
          Math.min(
            3.5,
            old.zoom * Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.04 : 0.0015)),
          ),
        );
        const ratio = zoom / old.zoom;
        return {
          zoom,
          x: anchor.x - (anchor.x - old.x) * ratio,
          y: anchor.y - (anchor.y - old.y) * ratio,
        };
      });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  function reframe() {
    setView(initialView);
    setManual(new Map());
  }
  function open(node: RelationNode) {
    if (node.kind === 'case') onCase(node.entityId);
    else if (node.kind === 'program') {
      const flow = data.proceedings.find((p) => p.id === node.entityId);
      if (flow) onCase(flow.caseId);
    } else onContact?.(node.entityId);
  }
  return (
    <div className={`local-graph ${expanded ? 'is-expanded' : ''}`}>
      <div className="graph-toolbar">
        <div className="graph-mode" role="group" aria-label="关系图范围">
          <button
            type="button"
            aria-pressed={!global}
            onClick={() => {
              setGlobal(false);
              reframe();
            }}
          >
            局部
          </button>
          <button
            type="button"
            aria-pressed={global}
            onClick={() => {
              setGlobal(true);
              reframe();
            }}
          >
            全局
          </button>
        </div>
        <label className="graph-search">
          <Search />
          <input
            aria-label="搜索关系图"
            placeholder="搜索节点"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              reframe();
            }}
          />
        </label>
        {!global && (
          <label className="graph-depth">
            层级
            <Select
              aria-label="关系图层级"
              value={depth}
              onValueChange={(value) => {
                setDepth(Number(value));
                reframe();
              }}
            >
              <option value={1}>1 层</option>
              <option value={2}>2 层</option>
              <option value={3}>3 层</option>
            </Select>
          </label>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label={expanded ? '收起关系图' : '展开关系图'}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <Minimize2 /> : <Maximize2 />}
        </button>
      </div>
      <div className="graph-filters" role="group" aria-label="关系图节点类型">
        {kinds
          .filter((kind) => graph.nodes.some((n) => n.kind === kind.id))
          .map((kind) => (
            <button
              type="button"
              key={kind.id}
              className={`kind-${kind.id}`}
              aria-pressed={!hidden.has(kind.id)}
              onClick={() => {
                setHidden((old) => {
                  const next = new Set(old);
                  if (next.has(kind.id)) next.delete(kind.id);
                  else next.add(kind.id);
                  return next;
                });
                reframe();
              }}
            >
              <i />
              {kind.label}
            </button>
          ))}
        <span>
          {visible.nodes.length} 个节点
          {visible.total > visible.nodes.length ? ` / 匹配 ${visible.total} 个，请缩小范围` : ''}
        </span>
      </div>
      <div className="graph-canvas">
        <svg
          ref={svg}
          viewBox={`0 0 ${box.width} ${box.height}`}
          role="group"
          tabIndex={0}
          aria-label="案件、办理流程、法院和法官的关系图"
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (
              ['+', '=', '-', 'Home', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
                e.key,
              )
            )
              e.preventDefault();
            if (e.key === '+' || e.key === '=') zoomBy(1.2);
            if (e.key === '-') zoomBy(1 / 1.2);
            if (e.key === 'Home') reframe();
            const delta = e.shiftKey ? 80 : 30;
            if (e.key.startsWith('Arrow'))
              setView((old) => ({
                ...old,
                x: old.x + (e.key === 'ArrowLeft' ? delta : e.key === 'ArrowRight' ? -delta : 0),
                y: old.y + (e.key === 'ArrowUp' ? delta : e.key === 'ArrowDown' ? -delta : 0),
              }));
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const id =
              (e.target as Element).closest('[data-node]')?.getAttribute('data-node') ?? null;
            const origin = id ? positions.get(id)! : { x: view.x, y: view.y };
            drag.current = {
              id,
              start: point(e.clientX, e.clientY),
              origin,
              moved: false,
              pointerId: e.pointerId,
            };
            suppressClick.current = false;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const current = drag.current;
            if (!current || current.pointerId !== e.pointerId) return;
            const p = point(e.clientX, e.clientY),
              dx = p.x - current.start.x,
              dy = p.y - current.start.y;
            if (Math.hypot(dx, dy) > 4) current.moved = true;
            if (!current.moved) return;
            if (current.id)
              setManual((old) =>
                new Map(old).set(current.id!, {
                  x: current.origin.x + dx / view.zoom,
                  y: current.origin.y + dy / view.zoom,
                }),
              );
            else setView((old) => ({ ...old, x: current.origin.x + dx, y: current.origin.y + dy }));
          }}
          onPointerUp={(e) => {
            const current = drag.current;
            if (!current || current.pointerId !== e.pointerId) return;
            suppressClick.current = current.moved;
            if (!current.moved) setSelected(current.id);
            drag.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
            suppressClick.current = true;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
        >
          <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
            {visible.edges.map((e) => {
              const a = positions.get(e.source)!,
                b = positions.get(e.target)!;
              const lit = e.source === activeId || e.target === activeId;
              return (
                <g
                  key={`${e.source}:${e.target}`}
                  className={`graph-edge ${lit ? 'is-lit' : ''}`}
                  opacity={activeId && !lit ? 0.14 : 1}
                >
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} vectorEffect="non-scaling-stroke" />
                  <title>{e.label}</title>
                </g>
              );
            })}
            {visible.nodes.map((n) => {
              const p = positions.get(n.id)!;
              const radius = 5 + Math.min(7, Math.sqrt(degree.get(n.id) ?? 0) * 1.7);
              const label = labels.get(n.id);
              return (
                <g
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  data-node={n.id}
                  aria-label={`查看${n.label}`}
                  aria-pressed={selected?.id === n.id}
                  className={`graph-node kind-${n.kind} ${selected?.id === n.id ? 'is-focused' : ''}`}
                  style={{ opacity: activeId && !adjacent.has(n.id) ? 0.22 : 1 }}
                  transform={`translate(${p.x} ${p.y})`}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(n.id)}
                  onBlur={() => setHover(null)}
                  onClick={() => {
                    if (!suppressClick.current) setSelected(n.id);
                  }}
                  onDoubleClick={() => {
                    if (!suppressClick.current) open(n);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelected(n.id);
                    }
                  }}
                >
                  <circle className="graph-hit" r={20} />
                  <circle className="graph-dot" r={radius} />
                  {label && (
                    <text
                      x={label.x}
                      y={label.y}
                      textAnchor={label.anchor}
                      className={view.zoom < 0.65 && activeId !== n.id ? 'is-zoomed-out' : ''}
                    >
                      {label.text}
                    </text>
                  )}
                  <title>
                    {n.label} · {kinds.find((k) => k.id === n.kind)?.label}
                    {n.meta ? ` · ${n.meta}` : ''}
                  </title>
                </g>
              );
            })}
          </g>
        </svg>
        {!visible.nodes.length && (
          <div className="graph-empty">
            <span>没有匹配的节点</span>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setHidden(new Set());
                reframe();
              }}
            >
              清除筛选
            </button>
          </div>
        )}
        <div className="graph-zoom" role="group" aria-label="关系图缩放">
          <button type="button" aria-label="缩小关系图" onClick={() => zoomBy(1 / 1.2)}>
            <Minus />
          </button>
          <output aria-label="关系图缩放比例">{Math.round(view.zoom * 100)}%</output>
          <button type="button" aria-label="放大关系图" onClick={() => zoomBy(1.2)}>
            <Plus />
          </button>
          <button type="button" aria-label="重置关系图" onClick={reframe}>
            <RotateCcw />
          </button>
        </div>
      </div>
      {selected ? (
        <section className="graph-inspector" aria-label="选中节点的关系">
          <header>
            <div>
              <span className={`graph-kind kind-${selected.kind}`}>
                <i />
                {kinds.find((k) => k.id === selected.kind)?.label}
              </span>
              <strong>{selected.label}</strong>
            </div>
            <div>
              <button
                type="button"
                onClick={() => {
                  setFocus(selected.id);
                  setGlobal(false);
                  setQuery('');
                  setHidden(new Set());
                  reframe();
                }}
              >
                <Crosshair />
                以此为中心
              </button>
              <button type="button" onClick={() => open(selected)}>
                打开
                {selected.kind === 'case'
                  ? '案件'
                  : selected.kind === 'program'
                    ? '所属案件'
                    : '对象详情'}
                <ArrowUpRight />
              </button>
            </div>
          </header>
          <div className="graph-connections">
            {connections.length ? (
              connections.map(({ node, label }) => (
                <button type="button" key={node.id} onClick={() => setSelected(node.id)}>
                  <span>{label}</span>
                  {node.label}
                </button>
              ))
            ) : (
              <span className="graph-no-links">当前范围内暂无关联</span>
            )}
          </div>
        </section>
      ) : (
        <div className="graph-idle">选择节点查看关联 · 拖动节点或空白处 · 滚轮缩放</div>
      )}
    </div>
  );
}
