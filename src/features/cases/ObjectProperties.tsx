import { useState } from 'react';
import {
  Plus,
  Type,
  Hash,
  CalendarDays,
  CheckSquare,
  Link2,
  ListFilter,
  Ellipsis,
} from 'lucide-react';
import Dialog from '../../components/Dialog';
import Select from '../../components/Select';
import DateField from '../../components/DateField';
import type { SaveAction, Workspace } from '../../domain/types';
import {
  resourceKey,
  sameResource,
  type ResourceRef,
  type ObjectProperty,
  type PropertyKind,
} from '../../case-system/contracts';
import { propertyLabels, validateProperty } from '../../case-system/properties';
import { resourceGroup, resourceGroups } from '../../case-system/selection';
import ResourcePicker from './ResourcePicker';
import CaseQuickActions, { type CreationPanel } from './CaseQuickActions';

export default function ObjectProperties({
  caseId,
  resource,
  data,
  save,
}: {
  caseId: string;
  resource: ResourceRef;
  data: Workspace;
  save: SaveAction;
}) {
  const fields =
    data.resourceMetadata.find((m) => m.caseId === caseId && sameResource(m.resource, resource))
      ?.properties ?? [];
  const [editing, setEditing] = useState<ObjectProperty | null>(null),
    [options, setOptions] = useState('');
  const [related, setRelated] = useState<ResourceRef[]>([]),
    [group, setGroup] = useState('');
  const [creating, setCreating] = useState(false),
    [remove, setRemove] = useState<ObjectProperty | null>(null);
  const icons = {
    text: Type,
    number: Hash,
    date: CalendarDays,
    checkbox: CheckSquare,
    relation: Link2,
    select: ListFilter,
    multi_select: ListFilter,
  };
  const parsedOptions = options
    .split(/[,，]/)
    .map((o) => o.trim())
    .filter(Boolean);
  const creator = resourceGroups.find((g) => g.id === group)?.creator;
  function edit(p: ObjectProperty) {
    const refs = data.resourceRelations
      .filter(
        (r) =>
          r.caseId === caseId && sameResource(r.source, resource) && r.kind === `property.${p.id}`,
      )
      .map((r) => r.target);
    setEditing({ ...p });
    setOptions(p.options.join('，'));
    setRelated(refs);
    setGroup(refs[0] ? resourceGroup(data, refs[0]) : '');
  }
  function display(p: ObjectProperty) {
    if (p.kind === 'relation') {
      const count = data.resourceRelations.filter(
        (r) =>
          r.caseId === caseId && sameResource(r.source, resource) && r.kind === `property.${p.id}`,
      ).length;
      return count ? `${count} 个关联对象` : '待填写';
    }
    return p.value === null
      ? '待填写'
      : p.kind === 'checkbox'
        ? p.value
          ? '是'
          : '否'
        : Array.isArray(p.value)
          ? p.value.join('、') || '待填写'
          : String(p.value);
  }
  return (
    <section className="object-properties" aria-label="对象自定义属性">
      {fields.map((p) => {
        const Icon = icons[p.kind];
        return (
          <div className="object-property-row" key={p.id}>
            <button type="button" className="object-property-main" onClick={() => edit(p)}>
              <span className="object-property-name">
                <Icon />
                {p.name}
              </span>
              <span className={p.value === null && p.kind !== 'relation' ? 'muted' : ''}>
                {display(p)}
              </span>
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`编辑属性 ${p.name}`}
              onClick={() => edit(p)}
            >
              <Ellipsis />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="object-add-property"
        onClick={() =>
          edit({ id: crypto.randomUUID(), name: '', kind: 'text', options: [], value: null })
        }
      >
        <Plus />
        添加属性
      </button>
      {editing && (
        <Dialog
          title={fields.some((p) => p.id === editing.id) ? '编辑属性' : '添加属性'}
          className="object-property-editor"
          submitLabel="保存属性"
          onClose={() => setEditing(null)}
          onSubmit={async () => {
            const property = {
              ...editing,
              name: editing.name.trim(),
              options: ['select', 'multi_select'].includes(editing.kind) ? parsedOptions : [],
            };
            validateProperty(property);
            await save('save_object_property', {
              input: {
                caseId,
                resource,
                property,
                ...(property.kind === 'relation' ? { related } : {}),
              },
            });
          }}
        >
          <label>
            属性名称
            <input
              aria-label="属性名称"
              required
              maxLength={60}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="例如：审理结果"
            />
          </label>
          <label>
            属性类型
            <Select
              aria-label="属性类型"
              value={editing.kind}
              onValueChange={(kind) => {
                setEditing({ ...editing, kind: kind as PropertyKind, options: [], value: null });
                setOptions('');
                setRelated([]);
                setGroup('');
              }}
            >
              {Object.entries(propertyLabels).map(([kind, label]) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          {['select', 'multi_select'].includes(editing.kind) && (
            <label>
              选项
              <input
                aria-label="属性选项"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="用逗号分隔，例如：待宣判，部分支持，调解"
              />
            </label>
          )}
          {editing.kind === 'relation' ? (
            <>
              <p className="object-scope">
                当前案件 · {data.cases.find((c) => c.id === caseId)?.title}
              </p>
              <ResourcePicker
                caseId={caseId}
                data={data}
                source={resource}
                value={related}
                onChange={setRelated}
                kind={group}
                onKindChange={setGroup}
              >
                {creator && (
                  <button
                    type="button"
                    className="object-edit-link"
                    onClick={() => setCreating(true)}
                  >
                    <Plus />
                    新建{resourceGroups.find((g) => g.id === group)?.label}
                  </button>
                )}
              </ResourcePicker>
            </>
          ) : (
            <label>
              属性内容
              {editing.kind === 'text' ? (
                <textarea
                  aria-label="属性值"
                  rows={3}
                  maxLength={20000}
                  value={String(editing.value ?? '')}
                  onChange={(e) => setEditing({ ...editing, value: e.target.value || null })}
                />
              ) : editing.kind === 'number' ? (
                <input
                  aria-label="属性值"
                  type="number"
                  step="any"
                  value={editing.value === null ? '' : String(editing.value)}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      value: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                />
              ) : editing.kind === 'date' ? (
                <DateField
                  aria-label="属性值"
                  value={String(editing.value ?? '')}
                  onValueChange={(value) => setEditing({ ...editing, value: value || null })}
                />
              ) : editing.kind === 'select' ? (
                <Select
                  aria-label="属性值"
                  value={String(editing.value ?? '')}
                  onValueChange={(value) => setEditing({ ...editing, value: value || null })}
                >
                  <option value="">待填写</option>
                  {parsedOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              ) : editing.kind === 'multi_select' ? (
                <div className="object-property-options">
                  {parsedOptions.map((o) => (
                    <label key={o}>
                      <input
                        type="checkbox"
                        checked={Array.isArray(editing.value) && editing.value.includes(o)}
                        onChange={(e) => {
                          const old = Array.isArray(editing.value) ? editing.value : [];
                          setEditing({
                            ...editing,
                            value: e.target.checked ? [...old, o] : old.filter((v) => v !== o),
                          });
                        }}
                      />
                      {o}
                    </label>
                  ))}
                  {!parsedOptions.length && (
                    <span className="field-hint">先填写选项，再选择内容。</span>
                  )}
                </div>
              ) : (
                <Select
                  aria-label="属性值"
                  value={editing.value === null ? '' : String(editing.value)}
                  onValueChange={(value) =>
                    setEditing({ ...editing, value: value === '' ? null : value === 'true' })
                  }
                >
                  <option value="">待填写</option>
                  <option value="true">是</option>
                  <option value="false">否</option>
                </Select>
              )}
            </label>
          )}
          {fields.some((p) => p.id === editing.id) && (
            <button
              type="button"
              className="object-delete-property"
              onClick={() => setRemove(editing)}
            >
              删除此属性
            </button>
          )}
          <p className="field-hint">点击保存后生效；取消或关闭会放弃本次修改。</p>
        </Dialog>
      )}
      {creating && creator && (
        <CaseQuickActions
          caseId={caseId}
          data={data}
          save={save}
          onMaterials={() => {}}
          initialKind={creator as CreationPanel}
          onClose={() => setCreating(false)}
          onCreated={async (refs) =>
            setRelated((old) => [
              ...new Map([...old, ...refs].map((ref) => [resourceKey(ref), ref])).values(),
            ])
          }
        />
      )}
      {remove && (
        <Dialog
          title="删除属性"
          danger
          submitLabel="删除属性"
          onClose={() => setRemove(null)}
          onSubmit={async () => {
            await save('delete_object_property', { caseId, resource, id: remove.id });
            setEditing(null);
          }}
        >
          <p>删除「{remove.name}」及其内容？关联的独立对象会保留。</p>
        </Dialog>
      )}
    </section>
  );
}
