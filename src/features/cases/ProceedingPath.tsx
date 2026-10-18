import { Plus, CircleCheck, Crosshair } from 'lucide-react';
import { useState } from 'react';
import type { CaseFile, Proceeding, Workspace } from '../../domain/types';
import { currentStage, proceedingName } from '../../domain/proceedings';
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
            style={{ width: programs.length * 178 - 14 }}
          >
            <svg
              className="program-edges"
              width={programs.length * 178 - 14}
              height="122"
              aria-hidden="true"
            >
              {programs.map((p, i) => {
                const parent = programs.findIndex((x) => x.id === p.parentId);
                return parent < 0 ? null : (
                  <path
                    key={p.id}
                    d={`M${parent * 178 + 82} 80 V${106 + (i % 2) * 8} H${i * 178 + 82} V80`}
                  />
                );
              })}
            </svg>
            {programs.map((p) => (
              <button
                key={p.id}
                className={`program-node ${selected === p.id ? 'is-selected' : ''} ${item.currentProceedingId === p.id ? 'is-focus' : ''}`}
                aria-label={`查看${proceedingName(p, programs)}流程`}
                aria-pressed={selected === p.id}
                onClick={() => onSelect(p.id)}
              >
                <span className="program-node-heading">
                  <strong>{proceedingName(p, programs)}</strong>
                  {item.currentProceedingId === p.id ? (
                    <Crosshair aria-label="当前关注" />
                  ) : p.state === 'completed' ? (
                    <CircleCheck />
                  ) : (
                    <i />
                  )}
                </span>
                <span
                  className={`program-node-stage ${p.state !== 'completed' && !p.stage ? 'is-empty' : ''}`}
                >
                  {p.state === 'completed' ? '已办结' : currentStage(data, p)}
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
