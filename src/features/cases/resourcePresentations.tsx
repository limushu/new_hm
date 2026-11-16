import { caseSystem } from '../../case-system/modules';
import { resourceKey } from '../../case-system/contracts';
import { lazy, Suspense, useState } from 'react';
import Dialog from '../../components/Dialog';
import { CasePresentations, type ResourceDetailsProps } from '../../case-system/presentation';
import { caseScope, resourceLinks } from '../../domain/workspace';
import Materials from '../materials/Materials';
import { WorkTaskEditor } from './WorkTasks';
import { MilestoneEditor } from './CaseQuickActions';
import { RecordForm } from './Records';
import { EntryForm } from '../finance/Finance';
import EventEditor from '../calendar/EventEditor';
const Preview = lazy(() => import('../materials/Preview'));

function MaterialDetails({ resource, data, save, onClose }: ResourceDetailsProps) {
  const item = data.materials.find((m) => m.id === resource.id && !m.deletedAt);
  if (!item) return null;
  return /\.(pdf|png|jpe?g|gif|webp|bmp|webm|ogg|mp3|wav|m4a|mp4|md|txt)$/i.test(item.name) ? (
    <Suspense fallback={null}>
      <Preview item={item} save={save} onClose={onClose} />
    </Suspense>
  ) : (
    <Dialog title="材料详情" onClose={onClose}>
      <p>{item.name}</p>
      <p className="field-hint">此格式可从材料页导出，使用对应应用打开。</p>
    </Dialog>
  );
}
function RecordDetails({ resource, data, save, onClose }: ResourceDetailsProps) {
  const [edit, setEdit] = useState(false),
    record = data.workRecords.find((r) => r.id === resource.id);
  if (!record) return null;
  return (
    <>
      <Dialog title="工作记录详情" onClose={onClose}>
        <p className="chronicle-record-body">{record.body}</p>
        <button onClick={() => setEdit(true)}>编辑记录</button>
        <Materials caseId={record.caseId} data={data} save={save} recordId={record.id} />
      </Dialog>
      {edit && (
        <RecordForm
          value={record}
          data={data}
          save={save}
          scope={resourceLinks(data, 'record', record.id)[0] ?? caseScope}
          onClose={() => setEdit(false)}
        />
      )}
    </>
  );
}
function TaskDetails({ resource, data, save, onClose }: ResourceDetailsProps) {
  const task = data.tasks.find((t) => t.id === resource.id);
  return task ? <WorkTaskEditor task={task} data={data} save={save} onClose={onClose} /> : null;
}
function ProgressDetails({ resource, data, save, onClose, onOpen }: ResourceDetailsProps) {
  const [edit, setEdit] = useState(false);
  const value = data.caseEvents.find((e) => e.id === resource.id),
    legacy = data.proceedings.find((p) => p.id === resource.id);
  const caseId = value?.caseId ?? legacy?.caseId;
  if (!caseId) return null;
  const objects = caseSystem.objects(data, caseId),
    current = objects.find((o) => resourceKey(o.resource) === resourceKey(resource));
  const related = [
    ...new Set(
      current?.relations
        .flatMap((r) => [r.source, r.target].map(resourceKey))
        .filter((key) => key !== resourceKey(resource)) ?? [],
    ),
  ].flatMap((key) => {
    const item = objects.find((o) => resourceKey(o.resource) === key);
    return item ? [item] : [];
  });
  return (
    <>
      <Dialog title="节点详情" onClose={onClose}>
        <h3>{value?.title ?? legacy?.name}</h3>
        <p className="field-hint">{value?.notes ?? legacy?.caseNumber}</p>
        {value?.kind !== 'stage_change' && value && (
          <button onClick={() => setEdit(true)}>编辑节点</button>
        )}
        <div className="case-node-relations">
          {related.map((o) => (
            <button key={o.id} onClick={() => onOpen?.(o.resource)}>
              <span>{o.title}</span>
              <small>{o.importance === 'important' ? '重要' : ''}</small>
            </button>
          ))}
        </div>
        {!related.length && (
          <p className="field-hint">可在其他对象创建时选择此节点，或从条目设置添加关联。</p>
        )}
      </Dialog>
      {edit && value && (
        <MilestoneEditor
          nodeMode
          value={value}
          data={data}
          save={save}
          onClose={() => setEdit(false)}
        />
      )}
    </>
  );
}

function ProgressEditor({ resource, data, save, onClose }: ResourceDetailsProps) {
  const value = data.caseEvents.find((e) => e.id === resource.id);
  return value && value.kind !== 'stage_change' ? (
    <MilestoneEditor
      properties={<></>}
      nodeMode
      value={value}
      data={data}
      save={save}
      onClose={onClose}
    />
  ) : null;
}
function LedgerDetails({ resource, data, save, onClose }: ResourceDetailsProps) {
  const value = data.ledgerEntries.find((t) => t.id === resource.id);
  return value ? (
    <EntryForm
      value={value}
      data={data}
      save={save}
      initialScope={resourceLinks(data, 'ledger', value.id)[0] ?? caseScope}
      onClose={onClose}
    />
  ) : null;
}
function CalendarDetails({ resource, data, save, onClose }: ResourceDetailsProps) {
  const event = data.calendarEvents.find((t) => t.id === resource.id);
  return event ? (
    <EventEditor
      event={event}
      existing
      cases={data.cases}
      data={data}
      save={save}
      onClose={onClose}
      onSaved={onClose}
    />
  ) : null;
}
export const casePresentations = new CasePresentations()
  .register('material', MaterialDetails)
  .register('record', RecordDetails)
  .register('task', TaskDetails)
  .register('milestone', ProgressEditor)
  .register('proceeding', ProgressDetails)
  .register('ledger', LedgerDetails)
  .register('event', CalendarDetails);
