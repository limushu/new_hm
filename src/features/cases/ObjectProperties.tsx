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
  type ResourceRef,
  type ObjectProperty,
  type PropertyKind,
} from '../../case-system/contracts';
import { propertyLabels, validateProperty } from '../../case-system/properties';

export default function ObjectProperties({
  caseId,
  resource,
  data,
  save,
  onLink,
}: {
  caseId: string;
  resource: ResourceRef;
  data: Workspace;
  save: SaveAction;
  onLink?: (kind: string, label: string) => void;
}) {
  const fields =
    data.resourceMetadata.find(
      (m) => m.caseId === caseId && resourceKey(m.resource) === resourceKey(resource),
    )?.properties ?? [];
  const [editing, setEditing] = useState<ObjectProperty | null>(null);
  const [definition, setDefinition] = useState(false);
  const [options, setOptions] = useState('');
  const [remove, setRemove] = useState<ObjectProperty | null>(null);
  function add() {
    setEditing({ id: crypto.randomUUID(), name: '', kind: 'text', options: [], value: null });
    setDefinition(true);
    setOptions('');
  }
  const icons = {
    text: Type,
    number: Hash,
    date: CalendarDays,
    checkbox: CheckSquare,
    relation: Link2,
    select: ListFilter,
    multi_select: ListFilter,
  };
  function value(p: ObjectProperty) {
    if (p.kind === 'relation') {
      const count = data.resourceRelations.filter(
        (r) =>
          r.caseId === caseId &&
          resourceKey(r.source) === resourceKey(resource) &&
          r.kind === `property.${p.id}`,
      ).length;
      return count ? `${count} 个关联对象` : '选择或新建对象';
    }
    if (p.value === null) return '待填写';
    if (p.kind === 'checkbox') return p.value ? '是' : '否';
    return Array.isArray(p.value) ? p.value.join('、') || '待填写' : String(p.value);
  }
  return (
    <section className="object-properties" aria-label="对象自定义属性">
      {fields.map((p) => {
        const Icon = icons[p.kind];
        return (
          <div className="object-property-row" key={p.id}>
            <button
              type="button"
              className="object-property-main"
              onClick={() => {
                if (p.kind === 'relation' && onLink) onLink(`property.${p.id}`, p.name);
                else {
                  setEditing({ ...p });
                  setDefinition(false);
                }
              }}
            >
              <span className="object-property-name">
                <Icon />
                {p.name}
              </span>
              <span className={p.value === null && p.kind !== 'relation' ? 'muted' : ''}>
                {value(p)}
              </span>
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`编辑属性 ${p.name}`}
              onClick={() => {
                setEditing({ ...p });
                setOptions(p.options.join('，'));
                setDefinition(true);
              }}
            >
              <Ellipsis />
            </button>
          </div>
        );
      })}
      <button type="button" className="object-add-property" onClick={add}>
        <Plus />
        添加属性
      </button>
      {editing && (
        <Dialog
          title={
            definition
              ? fields.some((p) => p.id === editing.id)
                ? '编辑属性'
                : '添加属性'
              : editing.name
          }
          submitLabel={definition ? '保存属性' : '保存'}
          onClose={() => setEditing(null)}
          onSubmit={async () => {
            const input = {
              ...editing,
              name: editing.name.trim(),
              options: definition
                ? options
                    .split(/[,，]/)
                    .map((o) => o.trim())
                    .filter(Boolean)
                : editing.options,
            };
            validateProperty(input);
            await save('save_object_property', { input: { caseId, resource, property: input } });
          }}
        >
          {definition ? (
            <>
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
                    setEditing({
                      ...editing,
                      kind: kind as PropertyKind,
                      options: [],
                      value: null,
                    });
                    setOptions('');
                  }}
                >
                  {Object.entries(propertyLabels).map(([k, n]) => (
                    <option key={k} value={k}>
                      {n}
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
              {fields.some((p) => p.id === editing.id) && (
                <>
                  <p className="field-hint">
                    变更类型会清空原值；删除关联属性只移除该属性中的关系，保留关联对象。
                  </p>
                  <button
                    type="button"
                    className="object-delete-property"
                    onClick={() => setRemove(editing)}
                  >
                    删除此属性
                  </button>
                </>
              )}
            </>
          ) : (
            <label>
              {editing.name}
              {editing.kind === 'text' ? (
                <textarea
                  aria-label="属性值"
                  rows={4}
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
                  {editing.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              ) : editing.kind === 'multi_select' ? (
                <div className="object-property-options">
                  {editing.options.map((o) => (
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
                </div>
              ) : editing.kind === 'checkbox' ? (
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
              ) : (
                <p className="field-hint">通过“添加关联”选择已有对象或新建。</p>
              )}
            </label>
          )}
        </Dialog>
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
          <p>删除「{remove.name}」及其属性值？对象正文和关联对象都会保留。</p>
        </Dialog>
      )}
    </section>
  );
}
