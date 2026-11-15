import Select from '../../components/Select';
import type { Workspace } from '../../domain/types';
import type { CreationProperties as Properties } from '../../case-system/objects';
import { resourceKey } from '../../case-system/contracts';
export default function CreationProperties({
  caseId,
  data,
  value,
  onChange,
}: {
  caseId: string;
  data: Workspace;
  value: Properties;
  onChange: (v: Properties) => void;
}) {
  const nodes = [
    ...data.caseEvents
      .filter((e) => e.caseId === caseId && e.kind !== 'stage_change')
      .map((e) => ({ reference: { kind: 'milestone', id: e.id }, title: e.title })),
    ...data.proceedings
      .filter((p) => p.caseId === caseId)
      .map((p) => ({
        reference: { kind: 'proceeding', id: p.id },
        title: `${p.name}（已有节点）`,
      })),
  ];
  return (
    <details className="creation-properties" aria-label="对象公共属性">
      <summary>属性与关联（可选）</summary>
      <label className="resource-important">
        <input
          type="checkbox"
          checked={value.importance === 'important'}
          onChange={(e) =>
            onChange({ ...value, importance: e.target.checked ? 'important' : 'normal' })
          }
        />
        重要
      </label>
      <label>
        标签
        <input
          aria-label="创建对象标签"
          value={value.tags.join('，')}
          placeholder="以逗号分隔，可选"
          onChange={(e) => onChange({ ...value, tags: e.target.value.split(/[,，]/) })}
        />
      </label>
      <label>
        关联节点
        <Select
          aria-label="创建对象关联节点"
          value={value.nodes[0] ? resourceKey(value.nodes[0]) : ''}
          onValueChange={(v) =>
            onChange({
              ...value,
              nodes:
                v && nodes.find((n) => resourceKey(n.reference) === v)
                  ? [nodes.find((n) => resourceKey(n.reference) === v)!.reference]
                  : [],
            })
          }
        >
          <option value="">暂不关联</option>
          {nodes.map((n) => (
            <option key={resourceKey(n.reference)} value={resourceKey(n.reference)}>
              {n.title}
            </option>
          ))}
        </Select>
      </label>
    </details>
  );
}
