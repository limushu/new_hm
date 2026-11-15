import { useMemo, useState } from 'react';
import Dialog from '../../components/Dialog';
import Select from '../../components/Select';
import { useAction } from '../../components/useAction';
import type { SaveAction, Workspace } from '../../domain/types';
import CaseQuickActions from './CaseQuickActions';
import ObjectProperties from './ObjectProperties';
import ObjectInspector from './ObjectInspector';
import { caseSystem } from '../../case-system/modules';
import {
  resourceKey,
  sameResource,
  type ResourceRef,
  type ResourceRelation,
  type TimelineEntry,
} from '../../case-system/contracts';

const relationLabels: Record<string, string> = {
  related: '关联',
  in_node: '属于节点',
  attachment: '附件',
  evidence: '依据',
  participant: '参与',
  represents: '代理',
  affiliated_with: '隶属',
  opposes: '对立方',
};
export function ResourceRelations({
  caseId,
  data,
  save,
  source,
  actorsOnly = false,
  onOpen,
  propertyKind,
  propertyLabel,
}: {
  caseId: string;
  data: Workspace;
  save: SaveAction;
  source?: ResourceRef;
  actorsOnly?: boolean;
  onOpen?: (ref: ResourceRef) => void;
  propertyKind?: string;
  propertyLabel?: string;
}) {
  const resources = useMemo(() => caseSystem.resources(data, caseId, true), [data, caseId]);
  const [draft, setDraft] = useState<ResourceRelation | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState<ResourceRef | null>(null);
  const { error, run, busy } = useAction();
  const choices = [...resources.values()].filter(
    (r) => !actorsOnly || ['contact', 'party'].includes(r.reference.kind),
  );
  const rows = caseSystem
    .relations(data, caseId)
    .filter(
      (r) =>
        r.caseId === caseId &&
        (!source || sameResource(r.source, source) || sameResource(r.target, source)) &&
        (!actorsOnly ||
          (['contact', 'party'].includes(r.source.kind) &&
            ['contact', 'party'].includes(r.target.kind))) &&
        (!propertyKind || r.kind === propertyKind) &&
        resources.has(resourceKey(r.source)) &&
        resources.has(resourceKey(r.target)),
    );
  return (
    <section
      className="resource-relations"
      aria-label={actorsOnly ? '本案人物与机构关系' : '条目关联'}
    >
      <div className="section-title">
        <h3>{propertyLabel || (actorsOnly ? '人物与机构关系' : '关联对象')}</h3>
        <span className="resource-relation-actions">
          {source && (
            <button type="button" onClick={() => setCreating(true)}>
              新建并关联
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              setDraft({
                id: crypto.randomUUID(),
                caseId,
                source: source ?? choices[0]?.reference ?? { kind: '', id: '' },
                target: { kind: '', id: '' },
                kind: propertyKind || 'related',
                label: propertyLabel || '',
              })
            }
          >
            添加关联
          </button>
        </span>
      </div>
      {rows.map((r) => (
        <div className="resource-relation-row" key={r.id}>
          {source ? (
            <button
              type="button"
              className="resource-related-object"
              onClick={() => {
                const target = sameResource(r.source, source) ? r.target : r.source;
                if (onOpen) onOpen(target);
                else setOpened(target);
              }}
            >
              <strong>
                {
                  resources.get(resourceKey(sameResource(r.source, source) ? r.target : r.source))
                    ?.title
                }
              </strong>
              <small>
                {r.label || relationLabels[r.kind] || '关联'}
                {!sameResource(r.source, source) ? ' · 关联到此对象' : ''}
              </small>
            </button>
          ) : (
            <span>
              {resources.get(resourceKey(r.source))?.title}{' '}
              <small>{r.label || relationLabels[r.kind] || r.kind} →</small>{' '}
              {resources.get(resourceKey(r.target))?.title}
            </span>
          )}
          {r.id.startsWith('legacy:') ? (
            <small className="field-hint">原有归档</small>
          ) : (
            <button
              type="button"
              disabled={busy}
              aria-label={`移除关联${r.id}`}
              onClick={() => void run(() => save('delete_resource_relation', { caseId, id: r.id }))}
            >
              移除
            </button>
          )}
        </div>
      ))}
      {!rows.length && (
        <p className="field-hint">
          {actorsOnly
            ? '可记录原告、被告、代理人、部门等对象之间的关系，并填写具体含义。'
            : '可关联本案材料、人物、机构、收支或其他事项。'}
        </p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {draft && (
        <Dialog
          title="添加案件关联"
          submitLabel="保存关联"
          onClose={() => setDraft(null)}
          onSubmit={async () => {
            if (!draft.source.id || !draft.target.id) throw new Error('请选择两端的关联对象');
            await save('save_resource_relation', { input: draft });
          }}
        >
          {!source && (
            <label>
              从
              <Select
                aria-label="关联起点"
                value={resourceKey(draft.source)}
                disabled={!!source}
                onValueChange={(v) => {
                  const r = resources.get(v);
                  if (r) setDraft({ ...draft, source: r.reference });
                }}
              >
                <option value="">选择对象</option>
                {choices.map((r) => (
                  <option key={resourceKey(r.reference)} value={resourceKey(r.reference)}>
                    {r.title}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {!propertyKind && (
            <details className="object-relation-advanced">
              <summary>关系类型（可选）</summary>
              <label>
                关系类型
                <Select
                  aria-label="关系类型"
                  value={draft.kind}
                  onValueChange={(kind) => setDraft({ ...draft, kind })}
                >
                  {Object.entries(relationLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
            </details>
          )}
          <label>
            搜索已有对象
            <input
              aria-label="搜索已有对象"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索人物、材料、节点…"
            />
          </label>
          <label>
            {source ? '选择已有对象' : '到'}
            <Select
              aria-label="关联目标"
              value={resourceKey(draft.target)}
              onValueChange={(v) => {
                const r = resources.get(v);
                if (r) setDraft({ ...draft, target: r.reference });
              }}
            >
              <option value="">选择对象</option>
              {choices
                .filter(
                  (r) =>
                    !sameResource(r.reference, draft.source) &&
                    (!query || r.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())),
                )
                .map((r) => (
                  <option key={resourceKey(r.reference)} value={resourceKey(r.reference)}>
                    {r.title}
                  </option>
                ))}
            </Select>
          </label>
          <label>
            关系含义（可选）
            <input
              aria-label="关联说明"
              maxLength={120}
              value={draft.label}
              placeholder="例如：受委托代理、同一部门、证明款项交付"
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </label>
        </Dialog>
      )}
      {creating && source && (
        <CaseQuickActions
          caseId={caseId}
          data={data}
          save={save}
          onMaterials={() => {}}
          relatedFrom={source}
          relationKind={propertyKind}
          relationLabel={propertyLabel}
          onClose={() => setCreating(false)}
        />
      )}
      {opened && (
        <ObjectInspector
          caseId={caseId}
          resource={opened}
          data={data}
          save={save}
          onClose={() => setOpened(null)}
        />
      )}
    </section>
  );
}

export default function ResourceSettings({
  entry,
  data,
  save,
  onClose,
}: {
  entry: Pick<TimelineEntry, 'caseId' | 'resource' | 'title' | 'importance' | 'tags'>;
  data: Workspace;
  save: SaveAction;
  onClose: () => void;
}) {
  const [important, setImportant] = useState(entry.importance === 'important');
  const [tags, setTags] = useState(entry.tags.join('，'));
  const [propertyRelation, setPropertyRelation] = useState<{ kind: string; label: string } | null>(
    null,
  );
  return (
    <Dialog
      title="条目设置"
      submitLabel="保存条目设置"
      onClose={onClose}
      onSubmit={async () => {
        await save('save_resource_metadata', {
          input: {
            caseId: entry.caseId,
            resource: entry.resource,
            importance: important ? 'important' : 'normal',
            tags: tags
              .split(/[,，]/)
              .map((t) => t.trim())
              .filter(Boolean),
          },
        });
      }}
    >
      <p className="field-hint">{entry.title}</p>
      <label className="resource-important">
        <input
          type="checkbox"
          checked={important}
          onChange={(e) => setImportant(e.target.checked)}
        />
        标为重要
      </label>
      <label>
        标签
        <input
          aria-label="条目标签"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="多个标签以逗号分隔"
        />
      </label>
      <ResourceRelations caseId={entry.caseId} source={entry.resource} data={data} save={save} />
      <ObjectProperties
        caseId={entry.caseId}
        resource={entry.resource}
        data={data}
        save={save}
        onLink={(kind, label) => setPropertyRelation({ kind, label })}
      />
      {propertyRelation && (
        <Dialog title={propertyRelation.label} onClose={() => setPropertyRelation(null)}>
          <ResourceRelations
            caseId={entry.caseId}
            source={entry.resource}
            data={data}
            save={save}
            propertyKind={propertyRelation.kind}
            propertyLabel={propertyRelation.label}
          />
        </Dialog>
      )}
    </Dialog>
  );
}
