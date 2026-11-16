import { useMemo, useState, type ReactNode } from 'react';
import Select from '../../components/Select';
import { Search } from 'lucide-react';
import type { Workspace } from '../../domain/types';
import { caseSystem } from '../../case-system/modules';
import { resourceKey, sameResource, type ResourceRef } from '../../case-system/contracts';
import { resourceGroup, resourceGroups } from '../../case-system/selection';
export default function ResourcePicker({
  caseId,
  data,
  source,
  value,
  onChange,
  kind,
  onKindChange,
  allowedGroups,
  label = '关联对象',
  multiple = true,
  children,
}: {
  caseId: string;
  data: Workspace;
  source?: ResourceRef;
  value: ResourceRef[];
  onChange: (refs: ResourceRef[]) => void;
  kind: string;
  onKindChange: (kind: string) => void;
  allowedGroups?: string[];
  label?: string;
  multiple?: boolean;
  children?: ReactNode;
}) {
  const [query, setQuery] = useState(''),
    [limit, setLimit] = useState(20);
  const choices = useMemo(
    () =>
      [...caseSystem.resources(data, caseId, true).values()].filter(
        (r) => !source || !sameResource(r.reference, source),
      ),
    [data, caseId, source?.kind, source?.id],
  );
  const groups = resourceGroups.filter(
    (g) =>
      (!allowedGroups || allowedGroups.includes(g.id)) &&
      (g.creator || choices.some((r) => resourceGroup(data, r.reference) === g.id)),
  );
  const rows = choices.filter(
    (r) =>
      resourceGroup(data, r.reference) === kind &&
      (!query || r.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())),
  );
  const selected = value.flatMap((ref) => {
    const row = choices.find((r) => sameResource(r.reference, ref));
    return row ? [row] : [];
  });
  return (
    <div className="resource-picker">
      <label>
        {label}类型
        <Select
          aria-label={`${label}类型`}
          value={kind}
          onValueChange={(next) => {
            onKindChange(next);
            setQuery('');
            setLimit(20);
          }}
        >
          <option value="">请选择对象类型</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </Select>
      </label>
      {children}
      {kind && (
        <>
          <label className="resource-picker-search">
            <Search />
            <input
              aria-label={`搜索${label}`}
              placeholder={`搜索${groups.find((g) => g.id === kind)?.label ?? '对象'}`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(20);
              }}
            />
          </label>
          <div className="resource-picker-list" aria-label={`${label}候选`}>
            {rows.slice(0, limit).map((r) => (
              <label className="resource-choice" key={resourceKey(r.reference)}>
                <input
                  type="checkbox"
                  aria-label={`选择 ${r.title}`}
                  checked={value.some((ref) => sameResource(ref, r.reference))}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? multiple
                          ? [...value, r.reference]
                          : [r.reference]
                        : value.filter((ref) => !sameResource(ref, r.reference)),
                    )
                  }
                />
                <span>
                  {r.title}
                  <small>
                    {resourceGroups.find((g) => g.id === resourceGroup(data, r.reference))?.label}
                  </small>
                </span>
              </label>
            ))}
            {!rows.length && <p className="field-hint">本案暂无匹配的对象。</p>}
            {rows.length > limit && (
              <button type="button" onClick={() => setLimit((n) => n + 20)}>
                显示更多
              </button>
            )}
          </div>
        </>
      )}
      {!!selected.length && (
        <div className="resource-picker-selection">
          <span>已选择 {selected.length} 项</span>
          <button type="button" onClick={() => onChange([])}>
            清空选择
          </button>
          {selected.map((r) => (
            <small key={resourceKey(r.reference)}>{r.title}</small>
          ))}
        </div>
      )}
    </div>
  );
}
