import Select from '../../components/Select';
import { useState } from 'react';
import { Plus, Users, ArrowUpRight, Search } from 'lucide-react';
import DeleteContact from './DeleteContact';
import type { Contact, SaveAction, Workspace } from '../../domain/types';
import { linkedCases, relatedContacts } from '../../domain/relations';
import ContactForm from './ContactForm';
import ContactDetail from './ContactDetail';
import { contactLabels } from './ContactPicker';
import { emptyContact } from './model';
import './contacts.css';
export { default as ContactDetail } from './ContactDetail';
export { default as CaseContacts } from './CaseContacts';
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
  const [detailView, setDetailView] = useState<'details' | 'links'>('details');
  const [remove, setRemove] = useState<Contact | null>(null);
  const rows = data.contacts.filter(
    (c) =>
      (kind === 'all' || c.kind === kind) &&
      `${c.name} ${c.phone} ${c.address} ${relatedContacts(data, c)
        .map((c) => c.name)
        .join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="simple-page contacts-page">
      <div className="contacts-heading">
        <div>
          <h1>
            <Users />
            联系对象
          </h1>
          <p>从一个对象，找到与它有关的案件和联系。</p>
        </div>
        <button className="primary-action" onClick={() => setEdit(emptyContact())}>
          <Plus />
          新建对象
        </button>
      </div>
      <div className="contacts-tools">
        <div className="contact-search">
          <Search />
          <input
            aria-label="搜索联系对象"
            placeholder="搜索名称、电话或关联法院"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select aria-label="筛选对象类型" value={kind} onValueChange={(value) => setKind(value)}>
          <option value="all">全部类型</option>
          {Object.entries(contactLabels).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </Select>
        <span>{rows.length} 个对象</span>
      </div>
      <div className="feature-list contacts-list">
        {!rows.length && (
          <p className="quiet-empty">
            {query ? '没有匹配的联系对象' : '案件中的法院与法官、当事人会汇集在这里。'}
          </p>
        )}
        {rows.map((c) => {
          const cases = linkedCases(data, c.id);
          const related = relatedContacts(data, c);
          return (
            <div className="feature-row contact-directory-row" key={c.id}>
              <span className={`entity-mark kind-${c.kind}`}>
                <Users />
              </span>
              <button
                className="row-main"
                onClick={() => {
                  setDetailView('details');
                  setDetail(c);
                }}
              >
                <span>
                  {c.name}
                  <small className="inline-kind">{contactLabels[c.kind]}</small>
                </span>
                <small>
                  {c.phone ||
                    c.address ||
                    (related.length ? related.map((x) => x.name).join(' · ') : '未填写联系方式')}
                </small>
              </button>
              <button
                className="backlink-count"
                aria-label={`查看${c.name}的${cases.length}个关联案件`}
                onClick={() => {
                  setDetailView('links');
                  setDetail(c);
                }}
              >
                {cases.length} 个案件
                <ArrowUpRight />
              </button>
              <div className="row-actions">
                <button onClick={() => setEdit(c)}>编辑</button>
                <button onClick={() => setRemove(c)}>删除</button>
              </div>
            </div>
          );
        })}
      </div>
      {edit && (
        <ContactForm
          value={edit}
          data={data}
          save={save}
          onClose={() => setEdit(null)}
          onSaved={async (c) => {
            if (c.id !== edit.id) setDetail(c);
          }}
        />
      )}
      {detail && (
        <ContactDetail
          contact={detail}
          initialView={detailView}
          data={data}
          save={save}
          onClose={() => setDetail(null)}
          onCase={onCase}
        />
      )}
      {remove && (
        <DeleteContact contact={remove} data={data} save={save} onClose={() => setRemove(null)} />
      )}
    </div>
  );
}
