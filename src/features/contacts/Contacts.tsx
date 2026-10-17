import { useState } from 'react';
import { Plus, Users, Network } from 'lucide-react';
import Dialog from '../../components/Dialog';
import { useAction } from '../../components/useAction';
import type { Contact, SaveAction, Workspace } from '../../domain/types';
import { programLabels } from '../../domain/types';
const labels: Record<Contact['kind'], string> = {
  person: '个人',
  organization: '机构',
  court: '法院',
  judge: '法官',
};
export function ContactForm({
  value,
  save,
  onClose,
  onSaved,
}: {
  value: Contact;
  save: SaveAction;
  onClose: () => void;
  onSaved?: (contact: Contact) => Promise<void>;
}) {
  const [input, setInput] = useState(value);
  const update = (patch: Partial<Contact>) => setInput((v) => ({ ...v, ...patch }));
  return (
    <Dialog
      title={value.name ? '编辑联系对象' : '新建联系对象'}
      onClose={onClose}
      onSubmit={async () => {
        await save('save_contact', { input });
        if (onSaved) await onSaved(input);
      }}
    >
      <label>
        名称
        <input
          aria-label="对象名称"
          autoFocus
          required
          maxLength={120}
          value={input.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </label>
      <div className="form-columns">
        <label>
          类型
          <select
            aria-label="对象类型"
            value={input.kind}
            onChange={(e) => update({ kind: e.target.value as Contact['kind'] })}
          >
            {Object.entries(labels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          电话
          <input
            aria-label="对象电话"
            value={input.phone}
            maxLength={80}
            onChange={(e) => update({ phone: e.target.value })}
          />
        </label>
      </div>
      <label>
        地址
        <input
          aria-label="对象地址"
          value={input.address}
          maxLength={500}
          onChange={(e) => update({ address: e.target.value })}
        />
      </label>
      <label>
        备注
        <textarea
          aria-label="对象备注"
          rows={3}
          value={input.notes}
          maxLength={20000}
          onChange={(e) => update({ notes: e.target.value })}
        />
      </label>
    </Dialog>
  );
}
export const emptyContact = (): Contact => ({
  id: crypto.randomUUID(),
  name: '',
  kind: 'person',
  phone: '',
  address: '',
  notes: '',
});
export function ContactDetail({
  contact,
  data,
  onClose,
  onCase,
}: {
  contact: Contact;
  data: Workspace;
  onClose: () => void;
  onCase: (id: string) => void;
}) {
  const links = data.contactLinks.filter(
    (link) =>
      link.contactId === contact.id && data.cases.some((c) => c.id === link.caseId && !c.deletedAt),
  );
  return (
    <Dialog title={contact.name} onClose={onClose}>
      <p className="feature-description">
        {labels[contact.kind]}
        {contact.phone ? ` · ${contact.phone}` : ''}
      </p>
      {contact.address && <p className="feature-description">{contact.address}</p>}
      {contact.notes && <p className="contact-notes">{contact.notes}</p>}
      <h3 className="minor-heading">关联案件</h3>
      {!links.length && <p className="quiet-empty">暂无关联案件</p>}
      {links.map((link) => (
        <button
          className="contact-case-link"
          key={link.id}
          onClick={() => {
            onClose();
            onCase(link.caseId);
          }}
        >
          <span>{data.cases.find((c) => c.id === link.caseId)?.title}</span>
          <small>
            {link.role}
            {link.proceedingId
              ? ` · ${programLabels[data.proceedings.find((p) => p.id === link.proceedingId)!.kind]}`
              : ''}
          </small>
        </button>
      ))}
    </Dialog>
  );
}
export default function Contacts({
  data,
  save,
  onCase,
}: {
  data: Workspace;
  save: SaveAction;
  onCase: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [edit, setEdit] = useState<Contact | null>(null);
  const [detail, setDetail] = useState<Contact | null>(null);
  const [remove, setRemove] = useState<Contact | null>(null);
  const rows = data.contacts.filter(
    (c) =>
      (kind === 'all' || c.kind === kind) &&
      `${c.name} ${c.phone} ${c.address}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="simple-page contacts-page">
      <h1>
        <Users />
        联系对象
      </h1>
      <div className="feature-toolbar">
        <input
          aria-label="搜索联系对象"
          placeholder="搜索名称、电话或地址"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select aria-label="筛选对象类型" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">全部类型</option>
          {Object.entries(labels).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <button className="primary-action" onClick={() => setEdit(emptyContact())}>
          <Plus />
          新建对象
        </button>
      </div>
      <div className="feature-list">
        {!rows.length && (
          <p className="quiet-empty">
            {query ? '没有匹配的联系对象' : '当事人、法院和法官可以先建档，再与案件关联。'}
          </p>
        )}
        {rows.map((c) => (
          <div className="feature-row" key={c.id}>
            <span className="feature-label">{labels[c.kind]}</span>
            <button className="row-main" onClick={() => setDetail(c)}>
              <span>{c.name}</span>
              <small>{c.phone || c.address || '未填写联系方式'}</small>
            </button>
            <div className="row-actions">
              <button onClick={() => setEdit(c)}>编辑</button>
              <button onClick={() => setRemove(c)}>删除</button>
            </div>
          </div>
        ))}
      </div>
      {edit && <ContactForm value={edit} save={save} onClose={() => setEdit(null)} />}{' '}
      {detail && (
        <ContactDetail
          contact={data.contacts.find((c) => c.id === detail.id) ?? detail}
          data={data}
          onCase={onCase}
          onClose={() => setDetail(null)}
        />
      )}{' '}
      {remove && (
        <Dialog
          title="删除联系对象"
          onClose={() => setRemove(null)}
          danger
          submitLabel="删除"
          onSubmit={async () => {
            await save('delete_contact', { id: remove.id });
          }}
        >
          <p className="feature-description">
            删除“{remove.name}”？已有案件关联的对象需要先解除关联。
          </p>
        </Dialog>
      )}
    </div>
  );
}
export function CaseContacts({
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
  const [linkForm, setLinkForm] = useState(false);
  const [newContact, setNewContact] = useState<Contact | null>(null);
  const [selected, setSelected] = useState('');
  const [role, setRole] = useState('当事人');
  const [program, setProgram] = useState('');
  const [detail, setDetail] = useState<Contact | null>(null);
  const [graph, setGraph] = useState(false);
  const { busy, error, run } = useAction();
  const links = data.contactLinks.filter((l) => l.caseId === caseId);
  const programs = data.proceedings.filter((p) => p.caseId === caseId);
  const link = async (contact: Contact) => {
    const proceedingId =
      program ||
      (contact.kind === 'court' || contact.kind === 'judge' ? programs[0]?.id : null) ||
      null;
    if ((contact.kind === 'court' || contact.kind === 'judge') && !proceedingId)
      throw new Error('请先为案件建立办理程序');
    await save('save_contact_link', {
      input: {
        id: crypto.randomUUID(),
        contactId: contact.id,
        caseId,
        proceedingId,
        role: contact.kind === 'court' ? '法院' : contact.kind === 'judge' ? '法官' : role,
      },
    });
  };
  return (
    <section className="feature-section">
      <header>
        <h3>关联对象</h3>
        <div className="feature-toolbar">
          <button onClick={() => setGraph(true)}>
            <Network />
            关系图
          </button>
          <button
            onClick={() => {
              setLinkForm(true);
              setSelected('');
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
      {!links.length && <p className="quiet-empty">按需关联当事人、法院或法官。</p>}
      {links.map((l) => {
        const c = data.contacts.find((c) => c.id === l.contactId);
        return (
          c && (
            <div className="feature-row" key={l.id}>
              <span className="feature-label">{l.role}</span>
              <button className="row-main" onClick={() => setDetail(c)}>
                <span>{c.name}</span>
                <small>
                  {l.proceedingId
                    ? programLabels[programs.find((p) => p.id === l.proceedingId)!.kind]
                    : '案件共用'}
                  {c.phone ? ` · ${c.phone}` : ''}
                </small>
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
          )
        );
      })}
      {linkForm && (
        <Dialog
          title="关联联系对象"
          onClose={() => setLinkForm(false)}
          onSubmit={async () => {
            const c = data.contacts.find((c) => c.id === selected);
            if (!c) throw new Error('请选择联系对象');
            await link(c);
          }}
        >
          <label>
            已有对象
            <select
              required
              aria-label="选择联系对象"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">选择一个对象</option>
              {data.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {labels[c.kind]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="inline-link"
            onClick={() => setNewContact(emptyContact())}
          >
            <Plus />
            原位新建对象
          </button>
          <label>
            在此案件中的身份
            <input
              aria-label="案件对象身份"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={50}
              required
              placeholder="如原告、被告、委托人"
            />
          </label>
          <label>
            所属程序
            <select
              aria-label="对象所属程序"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
            >
              <option value="">案件共用（法院/法官按程序保存）</option>
              {programs.map((p) => (
                <option value={p.id} key={p.id}>
                  {programLabels[p.kind]}
                </option>
              ))}
            </select>
          </label>
        </Dialog>
      )}
      {newContact && (
        <ContactForm
          value={newContact}
          save={save}
          onClose={() => setNewContact(null)}
          onSaved={async (c) => {
            await link(c);
            setLinkForm(false);
          }}
        />
      )}
      {detail && (
        <ContactDetail
          contact={detail}
          data={data}
          onCase={onCase}
          onClose={() => setDetail(null)}
        />
      )}
      {graph && (
        <Dialog title="案件关系图" onClose={() => setGraph(false)}>
          <RelationGraph
            caseId={caseId}
            data={data}
            onContact={(c) => {
              setGraph(false);
              setDetail(c);
            }}
          />
        </Dialog>
      )}
    </section>
  );
}
function RelationGraph({
  caseId,
  data,
  onContact,
}: {
  caseId: string;
  data: Workspace;
  onContact: (c: Contact) => void;
}) {
  const [limit, setLimit] = useState(10);
  const links = data.contactLinks.filter((l) => l.caseId === caseId);
  const visible = links.slice(0, limit);
  const height = Math.max(300, Math.ceil(visible.length / 2) * 78 + 30);
  const centerY = height / 2;
  return (
    <div className="relation-graph">
      {!links.length ? (
        <p className="quiet-empty">关联对象后自动显示关系。</p>
      ) : (
        <svg viewBox={`0 0 640 ${height}`} role="group" aria-label="以当前案件为中心的直接联系关系">
          {visible.map((l, index) => {
            const c = data.contacts.find((c) => c.id === l.contactId);
            if (!c) return null;
            const x = index % 2 ? 465 : 5;
            const y = 20 + Math.floor(index / 2) * 78;
            return (
              <g key={l.id}>
                <path
                  d={`M320 ${centerY} C${index % 2 ? 410 : 230} ${centerY},${index % 2 ? 410 : 230} ${y + 25},${x + 85} ${y + 25}`}
                  stroke="#3d4c56"
                  fill="none"
                />
                <g
                  tabIndex={0}
                  role="button"
                  aria-label={`查看${c.name}`}
                  onClick={() => onContact(c)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onContact(c);
                  }}
                >
                  <rect
                    x={x}
                    y={y}
                    width={170}
                    height={52}
                    rx={9}
                    fill="#26323b"
                    stroke="#354956"
                  />
                  <text x={x + 12} y={y + 22} fill="#d7dfe4" fontSize={13}>
                    {c.name.slice(0, 11)}
                  </text>
                  <text x={x + 12} y={y + 40} fill="#91a3b0" fontSize={11}>
                    {l.role}
                  </text>
                  <title>
                    {c.name} · {l.role}
                  </title>
                </g>
              </g>
            );
          })}
          <rect
            x={230}
            y={centerY - 32}
            width={180}
            height={64}
            rx={10}
            fill="#292929"
            stroke="#484848"
          />
          <text x={320} y={centerY - 4} textAnchor="middle" fill="#e0e0e0" fontSize={13}>
            当前案件
          </text>
          <text x={320} y={centerY + 17} textAnchor="middle" fill="#aaa" fontSize={11}>
            {data.cases.find((c) => c.id === caseId)?.title.slice(0, 13)}
          </text>
        </svg>
      )}
      {links.length > limit && (
        <button className="inline-link" onClick={() => setLimit((n) => n + 10)}>
          展开更多关系（{links.length - limit}）
        </button>
      )}
    </div>
  );
}
