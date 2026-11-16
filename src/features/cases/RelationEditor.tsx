import { useState } from 'react';
import Dialog from '../../components/Dialog';
import Select from '../../components/Select';
import ResourcePicker from './ResourcePicker';
import CaseQuickActions, { type CreationPanel } from './CaseQuickActions';
import type { SaveAction, Workspace } from '../../domain/types';
import { resourceKey, sameResource, type ResourceRef } from '../../case-system/contracts';
import { resourceGroups } from '../../case-system/selection';
import { relationLabels } from './ResourceSettings';
export default function RelationEditor({
  caseId,
  data,
  save,
  source,
  onClose,
  actorsOnly = false,
  relationKind = 'related',
  relationLabel = '',
}: {
  caseId: string;
  data: Workspace;
  save: SaveAction;
  source?: ResourceRef;
  onClose: () => void;
  actorsOnly?: boolean;
  relationKind?: string;
  relationLabel?: string;
}) {
  const [from, setFrom] = useState<ResourceRef | null>(source ?? null),
    [fromType, setFromType] = useState('');
  const [targets, setTargets] = useState<ResourceRef[]>([]),
    [type, setType] = useState('');
  const [kind, setKind] = useState(relationKind),
    [label, setLabel] = useState(relationLabel),
    [creating, setCreating] = useState(false);
  const [ids] = useState(() => new Map<string, string>());
  const group = resourceGroups.find((g) => g.id === type);
  return (
    <>
      <Dialog
        title="添加案件关联"
        className="relation-editor"
        submitLabel="保存关联"
        onClose={onClose}
        onSubmit={async () => {
          if (!from) throw new Error('请选择关联起点');
          if (!targets.length) throw new Error('请先选择对象类型和关联对象');
          const inputs = targets.map((target) => {
            const key = resourceKey(target);
            const existing = data.resourceRelations.find(
              (r) =>
                r.caseId === caseId &&
                sameResource(r.source, from) &&
                sameResource(r.target, target) &&
                r.kind === kind,
            );
            if (!ids.has(key)) ids.set(key, existing?.id ?? crypto.randomUUID());
            return { id: ids.get(key)!, caseId, source: from, target, kind, label };
          });
          await save('save_resource_relations', { inputs });
        }}
      >
        <p className="object-scope">当前案件 · {data.cases.find((c) => c.id === caseId)?.title}</p>
        {!source && (
          <ResourcePicker
            caseId={caseId}
            data={data}
            label="关联起点"
            value={from ? [from] : []}
            onChange={(refs) => {
              setFrom(refs[0] ?? null);
              setTargets([]);
            }}
            kind={fromType}
            onKindChange={(kind) => {
              setFromType(kind);
              setFrom(null);
              setTargets([]);
            }}
            allowedGroups={actorsOnly ? ['person', 'organization'] : undefined}
            multiple={false}
          />
        )}
        <ResourcePicker
          caseId={caseId}
          data={data}
          source={from ?? undefined}
          value={targets}
          onChange={setTargets}
          kind={type}
          onKindChange={setType}
          allowedGroups={actorsOnly ? ['person', 'organization'] : undefined}
        >
          {group?.creator && (
            <button
              type="button"
              className="object-edit-link"
              disabled={!from}
              onClick={() => setCreating(true)}
            >
              ＋ 新建{group.label}并关联
            </button>
          )}
        </ResourcePicker>
        {!!targets.length && (
          <label>
            关系含义（可选）
            <input
              aria-label="关联说明"
              maxLength={120}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例如：代理律师、承办法院、证明材料"
            />
          </label>
        )}
        {relationKind === 'related' && (
          <details className="object-relation-advanced">
            <summary>更多关系设置</summary>
            <label>
              关系类型
              <Select aria-label="关系类型" value={kind} onValueChange={setKind}>
                {Object.entries(relationLabels).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </Select>
            </label>
          </details>
        )}
        <p className="field-hint">关联在保存后生效；新建并保存的对象会保留在本案。</p>
      </Dialog>
      {creating && group?.creator && (
        <CaseQuickActions
          caseId={caseId}
          data={data}
          save={save}
          onMaterials={() => {}}
          initialKind={group.creator as CreationPanel}
          onClose={() => setCreating(false)}
          onCreated={async (refs) =>
            setTargets((old) => [
              ...new Map([...old, ...refs].map((ref) => [resourceKey(ref), ref])).values(),
            ])
          }
        />
      )}
    </>
  );
}
