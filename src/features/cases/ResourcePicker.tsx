import { useId, useMemo, useState } from 'react';
import Select from '../../components/Select';
import { Plus, Search } from 'lucide-react';
import type { Workspace } from '../../domain/types';
import { caseSystem } from '../../case-system/modules';
import { resourceKey, sameResource, type ResourceRef } from '../../case-system/contracts';
import { groupResources, resourceGroups } from '../../case-system/selection';
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
  onCreate,
  createLabel,
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
  onCreate?: () => void;
  createLabel?: string;
}) {
  const id = useId();
  const [scope, setScope] = useState<'case' | 'directory'>('case');
  const [query, setQuery] = useState(''),
    [limit, setLimit] = useState(20);
  const choices = useMemo(
    () =>
      groupResources(data, [...caseSystem.resources(data, caseId, true).values()]).filter(
        (r) => !source || !sameResource(r.reference, source),
      ),
    [data, caseId, source?.kind, source?.id],
  );
  const local = useMemo(() => new Set(caseSystem.resources(data, caseId).keys()), [data, caseId]);
  const inScope = choices.filter((r) =>
    scope === 'directory' ? r.reference.kind === 'contact' : local.has(resourceKey(r.reference)),
  );
  const groups = resourceGroups.filter(
    (g) =>
      (!allowedGroups || allowedGroups.includes(g.id)) &&
      (scope !== 'directory' || ['person', 'organization'].includes(g.id)) &&
      (g.creator || inScope.some((r) => r.group === g.id)),
  );
  const search = query.trim().toLocaleLowerCase();
  const rows = inScope.filter((r) => r.group === kind && (!search || r.search.includes(search)));
  const index = new Map(choices.map((r) => [resourceKey(r.reference), r]));
  const selectedKeys = new Set(value.map(resourceKey));
  const selected = value.flatMap((ref) => {
    const row = index.get(resourceKey(ref));
    return row ? [row] : [];
  });
  return (
    <div className="resource-picker">
      <div className="resource-picker-filters">
        <label>
          查找范围
          <Select
            aria-label={`${label}范围`}
            value={scope}
            onValueChange={(next) => {
              setScope(next as 'case' | 'directory');
              if (next === 'directory' && !['person', 'organization'].includes(kind))
                onKindChange('');
              setQuery('');
              setLimit(20);
            }}
          >
            <option value="case">当前案件</option>
            <option value="directory">全部联系对象库</option>
          </Select>
        </label>
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
      </div>
      {kind && onCreate && (
        <div className="resource-source-options" role="group" aria-label={`${label}添加方式`}>
          <span>选择已有{groups.find((g) => g.id === kind)?.label}</span>
          <button type="button" className="object-edit-link" onClick={onCreate}>
            <Plus aria-hidden="true" />
            {createLabel ?? `新建${groups.find((g) => g.id === kind)?.label}`}
          </button>
        </div>
      )}
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
                  type={multiple ? 'checkbox' : 'radio'}
                  name={id}
                  aria-label={`选择 ${r.title}`}
                  checked={selectedKeys.has(resourceKey(r.reference))}
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
                    {r.detail}
                    {r.reference.kind === 'contact' && !local.has(resourceKey(r.reference))
                      ? ' · 联系对象库'
                      : ''}
                  </small>
                </span>
              </label>
            ))}
            {!rows.length && (
              <p className="field-hint">
                {search
                  ? '没有匹配的对象，可更换关键词或新建。'
                  : scope === 'case'
                    ? '本案还没有此类对象，可新建；人员与机构也可从联系对象库选择。'
                    : '联系对象库还没有此类对象，可新建。'}
              </p>
            )}
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
