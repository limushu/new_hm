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

function MaterialDetails({ resource, data, onClose }: ResourceDetailsProps) {
  const item = data.materials.find((m) => m.id === resource.id && !m.deletedAt);
  if (!item) return null;
  return /\.(pdf|png|jpe?g|gif|webp|bmp|webm|ogg|mp3|wav|m4a|mp4|md|txt)$/i.test(item.name) ? (
    <Suspense fallback={null}>
      <Preview item={item} onClose={onClose} />
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
function ProgressDetails({ resource, data, save, onClose }: ResourceDetailsProps) {
  const value = data.caseEvents.find((t) => t.id === resource.id);
  return value ? <MilestoneEditor value={value} data={data} save={save} onClose={onClose} /> : null;
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
  .register('milestone', ProgressDetails)
  .register('ledger', LedgerDetails)
  .register('event', CalendarDetails);
