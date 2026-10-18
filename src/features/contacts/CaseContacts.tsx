import Select from '../../components/Select';
import { useState } from 'react';
import { Plus, Network, ArrowUpRight } from 'lucide-react';
import Dialog from '../../components/Dialog';
import { useAction } from '../../components/useAction';
import type { Contact, SaveAction, Workspace } from '../../domain/types';
import { programLabels } from '../../domain/types';
import ContactPicker, { contactLabels } from './ContactPicker';
import ContactForm from './ContactForm';
import ContactDetail from './ContactDetail';
import RelationGraph from './RelationGraph';
import { emptyContact } from './model';
export default function CaseContacts({
  caseId,
  data,
  save,
  onCase,
}: {
  caseId: string;
  data: Workspace;
  save: SaveAction;
  onCase: (id: string) => void;
}) {
  const [form, setForm] = useState(false);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [role, setRole] = useState('当事人');
  const [program, setProgram] = useState('');
  const [create, setCreate] = useState<Contact | null>(null);
  const [detail, setDetail] = useState<Contact | null>(null);
  const [graph, setGraph] = useState(false);
  const { busy, error, run } = useAction();
  const contacts = data.contacts.filter((c) => !['court', 'judge'].includes(c.kind));
  const links = data.contactLinks.filter(
    (l) => l.caseId === caseId && contacts.some((c) => c.id === l.contactId),
  );
  const programs = data.proceedings.filter((p) => p.caseId === caseId);
  async function link(c: Contact) {
    await save('save_contact_link', {
      input: {
        id: crypto.randomUUID(),
        caseId,
        contactId: c.id,
        proceedingId: program || null,
        role,
      },
    });
  }
  return (
    <section className="feature-section case-people">
      <header>
        <div>
          <h3>当事人与其他联系人</h3>
        </div>
        <div className="feature-toolbar">
          <button onClick={() => setGraph(true)}>
            <Network />
            关系图
          </button>
          <button
            onClick={() => {
              setSelected(null);
              setForm(true);
            }}
          >
            <Plus />
            关联对象
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!links.length && <p className="quiet-empty">暂无关联对象</p>}
      {links.map((l) => {
        const c = contacts.find((c) => c.id === l.contactId)!;
        return (
          <div className="feature-row" key={l.id}>
            <span className="role-pill">{l.role}</span>
            <button className="row-main" onClick={() => setDetail(c)}>
              <span>{c.name}</span>
              <small>
                {l.proceedingId
                  ? programLabels[programs.find((p) => p.id === l.proceedingId)!.kind]
                  : '案件共用'}
                {c.phone ? ` · ${c.phone}` : ''}
              </small>
            </button>
            <button
              className="entity-open"
              aria-label={`查看${c.name}的关联`}
              onClick={() => setDetail(c)}
            >
              <ArrowUpRight />
            </button>
            <div className="row-actions">
              <button
                disabled={busy}
                onClick={() => void run(() => save('delete_contact_link', { id: l.id }))}
              >
                解除关联
              </button>
            </div>
          </div>
        );
      })}
      {form && (
        <Dialog
          title="关联联系对象"
          onClose={() => setForm(false)}
          onSubmit={async () => {
            if (!selected) throw new Error('请选择联系对象');
            await link(selected);
          }}
        >
          <label>已有对象</label>
          <ContactPicker
            label="选择联系对象"
            contacts={contacts}
            value={selected?.id ?? null}
            onSelect={setSelected}
            onCreate={(name) => setCreate(emptyContact('person', name))}
            description={(c) => `${contactLabels[c.kind]}${c.phone ? ' · ' + c.phone : ''}`}
          />
          <button type="button" className="inline-link" onClick={() => setCreate(emptyContact())}>
            <Plus />
            原位新建对象
          </button>
          <label>
            在此案件中的身份
            <input
              aria-label="案件对象身份"
              value={role}
              required
              maxLength={50}
              onChange={(e) => setRole(e.target.value)}
              placeholder="如委托人、原告、被告"
            />
          </label>
          <label>
            所属程序
            <Select
              aria-label="对象所属程序"
              value={program}
              onValueChange={(value) => setProgram(value)}
            >
              <option value="">案件共用</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {programLabels[p.kind]}
                </option>
              ))}
            </Select>
          </label>
        </Dialog>
      )}
      {create && (
        <ContactForm
          value={create}
          allowedKinds={['person', 'organization']}
          data={data}
          save={save}
          onClose={() => setCreate(null)}
          onSaved={async (c) => {
            await link(c);
            setForm(false);
          }}
        />
      )}
      {detail && (
        <ContactDetail
          contact={detail}
          data={data}
          save={save}
          onCase={onCase}
          onClose={() => setDetail(null)}
        />
      )}
      {graph && (
        <Dialog
          title="案件关系图"
          className="contact-detail-dialog"
          onClose={() => setGraph(false)}
        >
          <RelationGraph
            data={data}
            focusId={`case:${caseId}`}
            onCase={(id) => {
              setGraph(false);
              onCase(id);
            }}
            onContact={(id) => {
              const c = data.contacts.find((c) => c.id === id);
              if (c) {
                setGraph(false);
                setDetail(c);
              }
            }}
          />
        </Dialog>
      )}
    </section>
  );
}
