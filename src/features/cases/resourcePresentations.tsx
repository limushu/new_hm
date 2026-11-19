import { lazy, Suspense, useState } from 'react';
import { FileText, ArrowUpRight } from 'lucide-react';
import Dialog from '../../components/Dialog';
import { CasePresentations, type ResourceDetailsProps } from '../../case-system/presentation';
import { caseScope, resourceLinks } from '../../domain/workspace';
import { money } from '../../domain/money';
import MaterialContent from '../materials/MaterialContent';
import { WorkTaskEditor } from './WorkTasks';
import { MilestoneEditor } from './CaseQuickActions';
import { RecordForm } from './Records';
import { EntryForm } from '../finance/Finance';
import EventEditor from '../calendar/EventEditor';
import ContactForm from '../contacts/ContactForm';
const Preview = lazy(() => import('../materials/Preview'));

function MaterialBody({ resource, data, save, onExpand }: ResourceDetailsProps) {
  const item = data.materials.find((m) => m.id === resource.id && !m.deletedAt);
  return item?.kind === 'file' ? (
    <MaterialContent item={item} save={save} onExpand={onExpand} />
  ) : (
    <p className="field-hint">可在材料页查看文件夹中的内容。</p>
  );
}
function MaterialExpanded({ resource, data, save, onClose }: ResourceDetailsProps) {
  const item = data.materials.find((m) => m.id === resource.id && !m.deletedAt);
  return item ? (
    <Suspense fallback={null}>
      <Preview item={item} save={save} onClose={onClose} closeLabel="返回详情" />
    </Suspense>
  ) : null;
}
function RecordBody({ resource, data, onOpen }: ResourceDetailsProps) {
  const record = data.workRecords.find((r) => r.id === resource.id);
  return record ? (
    <>
      <p className="object-body">{record.body}</p>
      {data.materials
        .filter((m) => m.recordId === record.id && !m.deletedAt)
        .map((m) => (
          <button
            type="button"
            className="object-attachment"
            key={m.id}
            onClick={() => onOpen?.({ kind: 'material', id: m.id })}
          >
            <FileText />
            {m.name}
            <ArrowUpRight />
          </button>
        ))}
    </>
  ) : null;
}
function RecordEditor({ resource, data, save, onClose }: ResourceDetailsProps) {
  const record = data.workRecords.find((r) => r.id === resource.id);
  return record ? (
    <RecordForm
      value={record}
      data={data}
      save={save}
      scope={resourceLinks(data, 'record', record.id)[0] ?? caseScope}
      onClose={onClose}
    />
  ) : null;
}
function TaskBody({ resource, data }: ResourceDetailsProps) {
  const task = data.tasks.find((t) => t.id === resource.id);
  return task ? <p className="field-hint">{task.completed ? '已完成' : '待完成'}</p> : null;
}
function TaskEditor({ resource, data, save, onClose }: ResourceDetailsProps) {
  const task = data.tasks.find((t) => t.id === resource.id);
  return task ? <WorkTaskEditor task={task} data={data} save={save} onClose={onClose} /> : null;
}
function NodeBody({ resource, data }: ResourceDetailsProps) {
  const node = data.caseEvents.find((e) => e.id === resource.id);
  const program = data.proceedings.find((p) => p.id === resource.id);
  return (
    <>
      {program && (
        <p className="field-hint">
          {program.state === 'completed' ? '已办结' : '办理中'}
          {program.caseNumber ? ` · ${program.caseNumber}` : ''}
        </p>
      )}
      {node?.notes && <p className="object-body">{node.notes}</p>}
    </>
  );
}
function NodeEditor({ resource, data, save, onClose }: ResourceDetailsProps) {
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
function ProceedingEditor({ resource, data, save, onClose }: ResourceDetailsProps) {
  const value = data.proceedings.find((p) => p.id === resource.id);
  const [name, setName] = useState(value?.name ?? '');
  return value ? (
    <Dialog
      title="编辑节点"
      onClose={onClose}
      onSubmit={async () => {
        await save('rename_proceeding', { id: value.id, name: name.trim() });
      }}
    >
      <label>
        节点名称
        <input
          required
          aria-label="节点名称"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
    </Dialog>
  ) : null;
}
function LedgerBody({ resource, data, onOpen }: ResourceDetailsProps) {
  const entry = data.ledgerEntries.find((e) => e.id === resource.id);
  return entry ? (
    <div className="object-ledger-content">
      <strong>
        {entry.kind === 'income' ? '收入' : '支出'} ¥ {money(entry.amountCents)}
      </strong>
      <span className="field-hint">{entry.category}</span>
      {entry.notes && <p className="object-body">{entry.notes}</p>}
      {entry.materialId && (
        <button
          type="button"
          className="object-edit-link"
          onClick={() => onOpen?.({ kind: 'material', id: entry.materialId! })}
        >
          <FileText />
          查看凭据
        </button>
      )}
    </div>
  ) : null;
}
function LedgerEditor({ resource, data, save, onClose }: ResourceDetailsProps) {
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
function CalendarBody({ resource, data }: ResourceDetailsProps) {
  const event = data.calendarEvents.find((e) => e.id === resource.id);
  return event ? (
    <>
      <p className="field-hint">
        {!event.startTime
          ? `${event.startDate} — ${event.endDate} · 全天`
          : `${event.startDate} ${event.startTime ?? ''} — ${event.endDate} ${event.endTime ?? ''}`}
      </p>
      {event.location && <p>{event.location}</p>}
      {event.notes && <p className="object-body">{event.notes}</p>}
    </>
  ) : null;
}
function CalendarEditor({ resource, data, save, onClose }: ResourceDetailsProps) {
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
function ContactBody({ resource, data }: ResourceDetailsProps) {
  const contact = data.contacts.find((c) => c.id === resource.id);
  return contact ? (
    <div className="object-contact-fields">
      {contact.phone && <a href={`tel:${contact.phone}`}>{contact.phone}</a>}
      {contact.address && <p>{contact.address}</p>}
      {contact.notes && <p className="object-body">{contact.notes}</p>}
    </div>
  ) : null;
}
function ContactEditor({ resource, data, save, onClose }: ResourceDetailsProps) {
  const contact = data.contacts.find((c) => c.id === resource.id);
  return contact ? <ContactForm value={contact} data={data} save={save} onClose={onClose} /> : null;
}
export const casePresentations = new CasePresentations()
  .register('material', { content: MaterialBody, expanded: MaterialExpanded })
  .register('record', { content: RecordBody, editor: RecordEditor })
  .register('task', { content: TaskBody, editor: TaskEditor })
  .register('milestone', { content: NodeBody, editor: NodeEditor })
  .register('proceeding', { content: NodeBody, editor: ProceedingEditor })
  .register('ledger', { content: LedgerBody, editor: LedgerEditor })
  .register('event', { content: CalendarBody, editor: CalendarEditor })
  .register('contact', { content: ContactBody, editor: ContactEditor });
