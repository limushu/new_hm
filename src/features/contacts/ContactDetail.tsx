import { useState } from 'react';
import { ArrowLeft, ArrowUpRight, Network, Link2, Phone, MapPin, Pencil } from 'lucide-react';
import Dialog from '../../components/Dialog';
import type { Contact, SaveAction, Workspace } from '../../domain/types';
import { programLabels } from '../../domain/types';
import { linkedCases, relatedContacts } from '../../domain/relations';
import { contactLabels } from './ContactPicker';
import ContactForm from './ContactForm';
import RelationGraph from './RelationGraph';
export default function ContactDetail({
  contact,
  data,
  save,
  onClose,
  onCase,
}: {
  contact: Contact;
  data: Workspace;
  save: SaveAction;
  onClose: () => void;
  onCase: (id: string) => void;
}) {
  const [selected, setSelected] = useState(contact.id);
  const [history, setHistory] = useState<string[]>([]);
  const [view, setView] = useState<'links' | 'graph'>('links');
  const [edit, setEdit] = useState(false);
  const current = data.contacts.find((c) => c.id === selected) ?? contact;
  const cases = linkedCases(data, current.id);
  const related = relatedContacts(data, current);
  function go(id: string) {
    if (id === selected) return;
    setHistory((h) => [...h, selected]);
    setSelected(id);
  }
  return (
    <Dialog title={current.name} onClose={onClose} className="contact-detail-dialog">
      <div className="entity-context">
        <span>{contactLabels[current.kind]}</span>
        <span>{cases.length} 个关联案件</span>
        <button type="button" onClick={() => setEdit(true)}>
          <Pencil />
          编辑对象
        </button>
        {history.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setSelected(history.at(-1)!);
              setHistory((h) => h.slice(0, -1));
            }}
          >
            <ArrowLeft />
            返回上个对象
          </button>
        )}
      </div>
      {(current.phone || current.address) && (
        <div className="entity-properties">
          {current.phone && (
            <span>
              <Phone />
              {current.phone}
            </span>
          )}
          {current.address && (
            <span>
              <MapPin />
              {current.address}
            </span>
          )}
        </div>
      )}
      {current.notes && <p className="contact-notes">{current.notes}</p>}
      <nav className="entity-view-tabs">
        <button
          type="button"
          className={view === 'links' ? 'active' : ''}
          onClick={() => setView('links')}
        >
          <Link2 />
          反向关联
        </button>
        <button
          type="button"
          className={view === 'graph' ? 'active' : ''}
          onClick={() => setView('graph')}
        >
          <Network />
          局部关系图
        </button>
      </nav>
      {view === 'graph' ? (
        <RelationGraph
          key={selected}
          data={data}
          focusId={`contact:${selected}`}
          onContact={go}
          onCase={(id) => {
            onClose();
            onCase(id);
          }}
        />
      ) : (
        <div
          className={`entity-links-layout ${['court', 'judge'].includes(current.kind) ? '' : 'single-column'}`}
        >
          <section>
            <h3>
              关联案件 <span>{cases.length}</span>
            </h3>
            {!cases.length && <p className="quiet-empty">关联案件后会自动出现在这里。</p>}
            {cases.map((c) => (
              <button
                type="button"
                className="backlink-row contact-case-link"
                key={c.id}
                onClick={() => {
                  onClose();
                  onCase(c.id);
                }}
              >
                <span>
                  {c.title}
                  <small>
                    {data.contactLinks
                      .filter((l) => l.caseId === c.id && l.contactId === current.id)
                      .map(
                        (l) =>
                          `${l.proceedingId ? programLabels[data.proceedings.find((p) => p.id === l.proceedingId)!.kind] + ' · ' : ''}${l.role}`,
                      )
                      .join(' / ')}
                  </small>
                </span>
                <ArrowUpRight />
              </button>
            ))}
          </section>
          {['court', 'judge'].includes(current.kind) && (
            <section>
              <h3>
                {current.kind === 'court' ? '关联法官' : '关联法院'} <span>{related.length}</span>
              </h3>
              {!related.length && (
                <p className="quiet-empty">
                  {current.kind === 'judge'
                    ? '编辑对象可添加法院关系。'
                    : current.kind === 'court'
                      ? '选择该法院办理的法官后自动形成关联。'
                      : '法院、法官和案件身份会按关系呈现。'}
                </p>
              )}
              {related.map((c) => (
                <button type="button" key={c.id} className="backlink-row" onClick={() => go(c.id)}>
                  <span>
                    {c.name}
                    <small>
                      {contactLabels[c.kind]}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </small>
                  </span>
                  <ArrowUpRight />
                </button>
              ))}
            </section>
          )}
        </div>
      )}
      {edit && (
        <ContactForm
          key={current.id}
          value={current}
          data={data}
          save={save}
          onClose={() => setEdit(false)}
        />
      )}
    </Dialog>
  );
}
