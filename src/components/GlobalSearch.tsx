import { useState } from 'react';
import { Search, Folder, FileText, Users } from 'lucide-react';
import Dialog from './Dialog';
import type { Contact, Workspace } from '../domain/types';
export default function GlobalSearch({
  data,
  onClose,
  onCase,
  onContact,
}: {
  data: Workspace;
  onClose: () => void;
  onCase: (id: string, tab?: string, materialId?: string) => void;
  onContact: (contact: Contact) => void;
}) {
  const [query, setQuery] = useState('');
  const text = query.trim().toLowerCase();
  const cases = data.cases.filter((c) => !c.deletedAt);
  const active = new Set(cases.map((c) => c.id));
  const matches = (value: string) => text && value.toLowerCase().includes(text);
  const caseRows = cases.filter(
    (c) =>
      matches(c.title) || data.proceedings.some((p) => p.caseId === c.id && matches(p.caseNumber)),
  );
  const contacts = data.contacts.filter((c) => matches(`${c.name} ${c.phone}`));
  const materials = data.materials.filter(
    (m) => !m.deletedAt && active.has(m.caseId) && matches(m.name),
  );
  const programs = data.proceedings.filter(
    (p) => active.has(p.caseId) && matches(`${p.court} ${p.judge}`),
  );
  return (
    <Dialog title="搜索工作区" onClose={onClose}>
      <label className="global-search-input">
        <Search />
        <input
          aria-label="全局搜索"
          autoFocus
          placeholder="案件、联系人、法院、法官或材料文件名"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {!text ? (
        <p className="quiet-empty">输入关键词开始搜索。</p>
      ) : (
        <div className="global-search-results">
          {caseRows.length > 0 && <h3>案件</h3>}
          {caseRows.slice(0, 15).map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onClose();
                onCase(c.id);
              }}
            >
              <Folder />
              <span>{c.title}</span>
            </button>
          ))}
          {contacts.length > 0 && <h3>联系对象</h3>}
          {contacts.slice(0, 15).map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onClose();
                onContact(c);
              }}
            >
              <Users />
              <span>
                {c.name}
                <small>{c.phone}</small>
              </span>
            </button>
          ))}
          {programs.length > 0 && <h3>法院与法官（办理程序）</h3>}
          {programs.slice(0, 15).map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onClose();
                onCase(p.caseId, 'info');
              }}
            >
              <Folder />
              <span>
                {p.court} {p.judge}
                <small>{cases.find((c) => c.id === p.caseId)?.title}</small>
              </span>
            </button>
          ))}
          {materials.length > 0 && <h3>材料</h3>}
          {materials.slice(0, 20).map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onClose();
                onCase(m.caseId, 'materials', m.id);
              }}
            >
              <FileText />
              <span>
                {m.name}
                <small>{cases.find((c) => c.id === m.caseId)?.title}</small>
              </span>
            </button>
          ))}
          {!caseRows.length && !contacts.length && !programs.length && !materials.length && (
            <p className="quiet-empty">没有匹配的结果。</p>
          )}
        </div>
      )}
    </Dialog>
  );
}
