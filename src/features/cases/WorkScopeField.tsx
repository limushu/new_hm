import Select from '../../components/Select';
import type { WorkScope, Workspace } from '../../domain/types';
import { proceedingName } from '../../domain/proceedings';
import { scopeName } from '../../domain/workspace';
import { X } from 'lucide-react';
export default function WorkScopeField({
  caseId,
  data,
  value,
  onChange,
}: {
  caseId: string;
  data: Workspace;
  value: WorkScope;
  onChange: (scope: WorkScope) => void;
}) {
  return (
    <div className="work-scope-fields">
      <label>
        所属流程
        <Select
          aria-label="所属流程"
          value={value.proceedingId ?? ''}
          onValueChange={(v) => onChange({ proceedingId: v || null, stageId: null })}
        >
          <option value="">案件共用</option>
          {data.proceedings
            .filter((p) => p.caseId === caseId)
            .map((p) => (
              <option value={p.id} key={p.id}>
                {proceedingName(p, data.proceedings)}
              </option>
            ))}
        </Select>
      </label>
      {value.proceedingId && (
        <label>
          工作阶段
          <Select
            aria-label="工作阶段"
            value={value.stageId ?? ''}
            onValueChange={(v) => onChange({ ...value, stageId: v || null })}
          >
            <option value="">未指定阶段</option>
            {data.stages
              .filter((s) => s.proceedingId === value.proceedingId)
              .sort((a, b) => a.position - b.position)
              .map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
          </Select>
        </label>
      )}
    </div>
  );
}
export function ScopeFilter({
  data,
  value,
  onClear,
  onBack,
}: {
  data: Workspace;
  value: WorkScope;
  onClear: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="work-scope-banner">
      <span>
        范围：<strong>{scopeName(data, value)}</strong>
      </span>
      {value.proceedingId && (
        <>
          {onBack && data.proceedings.some((p) => p.id === value.proceedingId) && (
            <button onClick={onBack}>返回办理</button>
          )}
          <button aria-label="清除工作范围筛选" onClick={onClear}>
            <X />
            查看全案
          </button>
        </>
      )}
    </div>
  );
}
