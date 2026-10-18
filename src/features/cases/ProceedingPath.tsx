import { Plus, CircleCheck, Crosshair } from 'lucide-react';
import { useId, useState } from 'react';
import type { CaseFile, Proceeding, Workspace } from '../../domain/types';
import { currentStage, proceedingName } from '../../domain/proceedings';
import { workflowLayout } from '../../domain/workflow-layout';
export default function ProceedingPath({
  item,
  programs,
  selected,
  data,
  onSelect,
  onAdd,
  compact = false,
}: {
  item: CaseFile;
  programs: Proceeding[];
  selected: string | null;
  data: Workspace;
  onSelect: (id: string) => void;
  onAdd: () => void;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const focus = programs.find((p) => p.id === item.currentProceedingId);
  const layout = workflowLayout(programs);
  const marker = useId().replace(/:/g, '');
  const parentName = (id: string) => {
    const p = programs.find((p) => p.id === id);
    return p ? proceedingName(p, programs) : '前序流程';
  };
  return (
    <section
      className={`proceeding-path ${compact && !expanded ? 'is-compact' : ''}`}
      aria-label="案件办理路径"
    >
      <header>
        <div>
          <h3>
            办理路径 <span>{programs.length} 个流程</span>
          </h3>
          <p>
            {programs.filter((p) => p.state === 'active').length} 个办理中
            {focus ? ` · 当前关注：${proceedingName(focus, programs)}` : ' · 尚未指定当前关注'}
          </p>
        </div>
        <div className="program-path-actions">
          {compact && programs.length > 0 && (
            <button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
              {expanded ? '收起办理路径' : '展开办理路径'}
            </button>
          )}
          <button onClick={onAdd}>
            <Plus />
            新增流程
          </button>
        </div>
      </header>
      {programs.length ? (
        <nav className="program-map" aria-label="办理流程节点">
          <div
            className={`program-map-track ${programs.some((p) => p.parentId) ? 'has-links' : ''}`}
            style={{ width: layout.width, height: layout.height }}
          >
            <svg
              className="program-edges"
              width={layout.width}
              height={layout.height}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id={marker}
                  markerWidth="7"
                  markerHeight="7"
                  refX="6"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 7 3.5, 0 7" fill="var(--muted)" />
                </marker>
              </defs>
              {layout.nodes.map(({ program: p, x, y }) => {
                const parent = layout.nodes.find((n) => n.program.id === p.parentId);
                if (!parent) return null;
                const start = parent.x + layout.nodeWidth,
                  sy = parent.y + layout.nodeHeight / 2,
                  ty = y + layout.nodeHeight / 2;
                return (
                  <path
                    key={p.id}
                    markerEnd={`url(#${marker})`}
                    d={`M${start} ${sy} H${start + 34} V${ty} H${x - 4}`}
                  />
                );
              })}
            </svg>
            {layout.nodes.map(({ program: p, x, y }) => (
              <button
                key={p.id}
                className={`program-node ${selected === p.id ? 'is-selected' : ''} ${item.currentProceedingId === p.id ? 'is-focus' : ''}`}
                aria-label={`查看${proceedingName(p, programs)}流程`}
                aria-pressed={selected === p.id}
                title={proceedingName(p, programs)}
                style={{ left: x, top: y }}
                onClick={() => onSelect(p.id)}
              >
                <span className="program-node-heading">
                  <strong>{proceedingName(p, programs)}</strong>
                  {p.state === 'completed' && <CircleCheck aria-label="已办结" />}
                </span>
                <span
                  className={`program-node-stage ${p.state !== 'completed' && !p.stage ? 'is-empty' : ''}`}
                >
                  {p.state === 'completed' ? '已办结' : currentStage(data, p)}
                </span>
                <span className="program-node-badges">
                  {item.currentProceedingId === p.id && (
                    <span className="focus-badge">
                      <Crosshair />
                      当前关注
                    </span>
                  )}
                  {selected === p.id && <span className="viewing-badge">查看中</span>}
                </span>
                <span className="program-parent">
                  {p.parentId ? `承接：${parentName(p.parentId)}` : '独立流程'}
                  <span>{p.state === 'completed' ? '已办结' : '办理中'}</span>
                </span>
                {p.caseNumber && <small>{p.caseNumber}</small>}
              </button>
            ))}
          </div>
        </nav>
      ) : (
        <p className="quiet-empty">暂无办理流程</p>
      )}
    </section>
  );
}
