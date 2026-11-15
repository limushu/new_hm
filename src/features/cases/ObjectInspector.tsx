import { useState } from 'react';
import { ChevronLeft, FileText, ArrowUpRight, Pencil, Star } from 'lucide-react';
import Dialog from '../../components/Dialog';
import type { SaveAction, Workspace } from '../../domain/types';
import { resourceKey, type ResourceRef } from '../../case-system/contracts';
import { caseSystem } from '../../case-system/modules';
import { casePresentations } from './resourcePresentations';
import { ResourceRelations } from './ResourceSettings';
import ResourceSettings from './ResourceSettings';
import ObjectProperties from './ObjectProperties';
import ContactForm from '../contacts/ContactForm';
export default function ObjectInspector({
  caseId,
  resource,
  data,
  save,
  onClose,
}: {
  caseId: string;
  resource: ResourceRef;
  data: Workspace;
  save: SaveAction;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<ResourceRef[]>([resource]);
  const [editing, setEditing] = useState(resource.kind === 'material'),
    [settings, setSettings] = useState(false);
  const [propertyRelation, setPropertyRelation] = useState<{ kind: string; label: string } | null>(
    null,
  );
  const current = history[history.length - 1];
  const objects = caseSystem.objects(data, caseId);
  const item = objects.find((o) => resourceKey(o.resource) === resourceKey(current));
  const contact =
    current.kind === 'contact' ? data.contacts.find((c) => c.id === current.id) : null;
  const milestone =
    current.kind === 'milestone' ? data.caseEvents.find((e) => e.id === current.id) : null;
  const program =
    current.kind === 'proceeding' ? data.proceedings.find((p) => p.id === current.id) : null;
  const record =
    current.kind === 'record' ? data.workRecords.find((r) => r.id === current.id) : null;
  const event =
    current.kind === 'event' ? data.calendarEvents.find((e) => e.id === current.id) : null;
  const task = current.kind === 'task' ? data.tasks.find((t) => t.id === current.id) : null;
  const material =
    current.kind === 'material' ? data.materials.find((m) => m.id === current.id) : null;
  const node = !!milestone || !!program;
  const Details = casePresentations.get(current.kind);
  const body =
    milestone?.notes ?? record?.body ?? event?.notes ?? material?.notes ?? contact?.notes ?? '';
  function open(ref: ResourceRef) {
    setPropertyRelation(null);
    setEditing(ref.kind === 'material');
    setSettings(false);
    setHistory((old) => [...old, ref]);
  }
  if (!item)
    return (
      <Dialog title="对象详情" onClose={onClose}>
        <p>对象已删除或不属于本案。</p>
      </Dialog>
    );
  return (
    <>
      <Dialog title={node ? '节点详情' : '对象详情'} className="object-inspector" onClose={onClose}>
        {history.length > 1 && (
          <button
            type="button"
            className="object-back-link"
            onClick={() => setHistory((old) => old.slice(0, -1))}
          >
            <ChevronLeft />
            返回上一对象
          </button>
        )}
        <header className="object-heading">
          <h3>{item.title}</h3>
          <button
            type="button"
            className="icon-button"
            aria-label="对象设置"
            onClick={() => setSettings(true)}
          >
            <Star className={item.importance === 'important' ? 'important' : ''} />
          </button>
        </header>
        {task && (
          <p className="field-hint">
            {task.completed ? '已完成' : '待完成'}
            {task.dueDate ? ` · ${task.dueDate} 截止` : ''}
          </p>
        )}
        {contact && (
          <div className="object-contact-fields">
            {contact.phone && <a href={`tel:${contact.phone}`}>{contact.phone}</a>}
            {contact.address && <p>{contact.address}</p>}
          </div>
        )}
        {program && (
          <p className="field-hint">
            {program.state === 'completed' ? '已办结' : '办理中'}
            {program.caseNumber ? ` · ${program.caseNumber}` : ''}
          </p>
        )}
        <ObjectProperties
          caseId={caseId}
          resource={current}
          data={data}
          save={save}
          onLink={(kind, label) => setPropertyRelation({ kind, label })}
        />
        {body && <p className="object-body">{body}</p>}
        {(Details || contact) && !(milestone?.kind === 'stage_change') && (
          <button type="button" className="object-edit-link" onClick={() => setEditing(true)}>
            {material ? <FileText /> : <Pencil />}
            {material ? '打开原件' : node ? '编辑节点' : '编辑内容'}
            <ArrowUpRight />
          </button>
        )}
        {record &&
          data.materials
            .filter((m) => m.recordId === record.id && !m.deletedAt)
            .map((m) => (
              <button
                type="button"
                className="object-attachment"
                key={m.id}
                onClick={() => open({ kind: 'material', id: m.id })}
              >
                <FileText />
                {m.name}
                <ArrowUpRight />
              </button>
            ))}
        <ResourceRelations caseId={caseId} source={current} data={data} save={save} onOpen={open} />
      </Dialog>
      {settings && (
        <ResourceSettings entry={item} data={data} save={save} onClose={() => setSettings(false)} />
      )}
      {editing &&
        (contact ? (
          <ContactForm value={contact} data={data} save={save} onClose={() => setEditing(false)} />
        ) : Details ? (
          <Details
            key={resourceKey(current)}
            resource={current}
            data={data}
            save={save}
            onClose={() => setEditing(false)}
            onOpen={open}
          />
        ) : null)}
      {propertyRelation && (
        <Dialog title={propertyRelation.label} onClose={() => setPropertyRelation(null)}>
          <ResourceRelations
            caseId={caseId}
            source={current}
            data={data}
            save={save}
            propertyKind={propertyRelation.kind}
            propertyLabel={propertyRelation.label}
            onOpen={open}
          />
        </Dialog>
      )}
    </>
  );
}
