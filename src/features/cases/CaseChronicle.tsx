import type { CaseFile, Workspace, SaveAction } from '../../domain/types';
import CaseTimeline from './CaseTimeline';
import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, GitBranch } from 'lucide-react';
import Dialog from '../../components/Dialog';
import Select from '../../components/Select';
import ObjectInspector from './ObjectInspector';
import { caseSystem } from '../../case-system/modules';
import { resourceKey, type ResourceRef } from '../../case-system/contracts';
import { useAction } from '../../components/useAction';
export default function CaseChronicle({
  item,
  data,
  save,
}: {
  item: CaseFile;
  data: Workspace;
  save: SaveAction;
}) {
  const objects = useMemo(() => caseSystem.objects(data, item.id), [data, item.id]);
  const focusRelation = data.resourceRelations.find(
    (r) =>
      r.caseId === item.id &&
      r.source.kind === 'case' &&
      r.source.id === item.id &&
      r.kind === 'focus',
  );
  const focus = objects.find(
    (o) =>
      resourceKey(o.resource) ===
      (focusRelation
        ? resourceKey(focusRelation.target)
        : `proceeding:${item.currentProceedingId}`),
  );
  const [selected, setSelected] = useState<ResourceRef | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [focusKey, setFocusKey] = useState('');
  const [relationId] = useState(() => crypto.randomUUID());
  const { error, busy, run } = useAction();
  const pending = data.tasks
    .filter((t) => t.caseId === item.id && !t.completed)
    .sort((a, b) => {
      const important = (id: string) =>
        data.resourceMetadata.some(
          (m) =>
            m.caseId === item.id &&
            m.resource.kind === 'task' &&
            m.resource.id === id &&
            m.importance === 'important',
        )
          ? 1
          : 0;
      return (
        important(b.id) - important(a.id) ||
        (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
      );
    });
  const next = pending[0];
  return (
    <div className="case-chronicle">
      <section className="case-focus-panel" aria-label="当前关注与下一步">
        <div className="case-focus-caption">
          <span>当前关注</span>
          <button
            type="button"
            aria-label={focus ? '切换当前关注节点' : '选择节点'}
            onClick={() => {
              setFocusKey(focus ? resourceKey(focus.resource) : '');
              setChoosing(true);
            }}
          >
            {focus ? '切换' : '选择节点'}
            <ChevronDown />
          </button>
        </div>
        {focus ? (
          <button
            type="button"
            className="case-focus-main"
            onClick={() => setSelected(focus.resource)}
          >
            <GitBranch className="case-focus-icon" aria-hidden="true" />
            <span className="case-focus-content">
              <strong>{focus.title}</strong>
              <small>
                {focus.properties
                  .filter((p) => p.value !== null && p.kind !== 'relation')
                  .slice(0, 2)
                  .map(
                    (p) =>
                      `${p.name}：${Array.isArray(p.value) ? p.value.join('、') : String(p.value)}`,
                  )
                  .join(' · ') || '查看节点与关联对象'}
              </small>
            </span>
            <ChevronRight />
          </button>
        ) : (
          <p className="field-hint">选择一个节点，集中查看当前工作。</p>
        )}
        {next && (
          <div className="case-next-action">
            <span className="case-focus-caption">接下来</span>
            <div>
              <input
                type="checkbox"
                aria-label={`完成下一项待办 ${next.title}`}
                checked={false}
                disabled={busy}
                onChange={() =>
                  void run(() => save('toggle_task', { id: next.id, completed: true }))
                }
              />
              <button type="button" onClick={() => setSelected({ kind: 'task', id: next.id })}>
                {next.title}
              </button>
            </div>
            {next.dueDate && <small>{next.dueDate} 截止</small>}
          </div>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </section>
      <CaseTimeline caseId={item.id} data={data} save={save} />
      {selected && (
        <ObjectInspector
          caseId={item.id}
          resource={selected}
          data={data}
          save={save}
          onClose={() => setSelected(null)}
        />
      )}
      {choosing && (
        <Dialog
          title="选择当前关注节点"
          onClose={() => setChoosing(false)}
          onSubmit={async () => {
            const target = objects.find((o) => resourceKey(o.resource) === focusKey);
            if (!target) throw new Error('请选择一个节点');
            await save('save_resource_relation', {
              input: {
                id: focusRelation?.id ?? relationId,
                caseId: item.id,
                source: { kind: 'case', id: item.id },
                target: target.resource,
                kind: 'focus',
                label: '',
              },
            });
          }}
        >
          <label>
            关注节点
            <Select aria-label="当前关注节点" value={focusKey} onValueChange={setFocusKey}>
              <option value="">选择节点</option>
              {objects
                .filter((o) => ['milestone', 'proceeding'].includes(o.resource.kind))
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
            </Select>
          </label>
          <p className="field-hint">这里只决定首页重点展示哪个节点，不会改变案件状态。</p>
        </Dialog>
      )}
    </div>
  );
}
