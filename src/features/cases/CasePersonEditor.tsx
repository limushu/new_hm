import { useState, type ReactNode } from 'react';
import { Building2, Check, ChevronRight, Landmark, Scale, Search, UserRound } from 'lucide-react';
import type { Contact, SaveAction, Workspace } from '../../domain/types';
import Dialog from '../../components/Dialog';
import ContactFields from '../contacts/ContactFields';
import { emptyContact } from '../contacts/model';
import { contactLabels } from '../contacts/ContactPicker';
import '../contacts/contacts.css';

const contactKinds = [
  { kind: 'person', label: '个人', hint: '律师、当事人及其他人员', icon: UserRound },
  { kind: 'court', label: '法院', hint: '案件涉及的法院', icon: Landmark },
  { kind: 'judge', label: '法官', hint: '承办法官及其他法官', icon: Scale },
  { kind: 'organization', label: '机构', hint: '律所、公司或其他部门', icon: Building2 },
] as const;

export default function CasePersonEditor({
  caseId,
  data,
  save,
  onClose,
  properties,
  onSaved,
  onContactSelected,
  kind,
}: {
  caseId: string;
  data: Workspace;
  save: SaveAction;
  onClose: () => void;
  properties?: ReactNode;
  onSaved?: (contact: Contact) => Promise<void>;
  onContactSelected?: (contact: Contact | null) => void;
  kind?: Contact['kind'];
}) {
  const [selectedKind, setSelectedKind] = useState<Contact['kind'] | null>(kind ?? null);
  const [draft, setDraft] = useState(() => emptyContact(kind));
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const [chosen, setChosen] = useState<Contact | null>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const [courts, setCourts] = useState<string[]>([]);
  const [role, setRole] = useState('');
  const [linkId] = useState(() => crypto.randomUUID());
  const candidates = data.contacts.filter((c) => c.kind === selectedKind);
  const rows = candidates.filter((c) =>
    `${c.name} ${c.phone} ${c.address}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const duplicates = candidates.filter(
    (c) => c.name.trim().toLocaleLowerCase() === draft.name.trim().toLocaleLowerCase(),
  );
  const label = selectedKind ? contactLabels[selectedKind] : '';
  const isLinked = (id: string) =>
    data.contactLinks.some(
      (l) => l.caseId === caseId && l.contactId === id && l.proceedingId === null,
    );
  function chooseKind(next: Contact['kind']) {
    setSelectedKind(next);
    setDraft((v) => ({ ...v, kind: next }));
    setCourts([]);
    setChosen(null);
    onContactSelected?.(null);
    setQuery('');
    setLimit(20);
    setMode(data.contacts.some((c) => c.kind === next) ? 'existing' : 'new');
  }
  function reuse(c: Contact) {
    setChosen(c);
    onContactSelected?.(c);
    setMode('existing');
    setQuery('');
  }
  return (
    <Dialog
      title={selectedKind ? `添加${label}` : '添加人员或机构'}
      className="case-contact-editor"
      onClose={onClose}
      submitLabel={mode === 'new' ? '新建并添加' : '添加到本案'}
      onSubmit={
        selectedKind
          ? async () => {
              if (mode === 'existing' && !chosen)
                throw new Error(`请选择已有${label}，或切换到新建`);
              const contact = mode === 'new' ? { ...draft, name: draft.name.trim() } : chosen!;
              if (mode === 'new' && !contact.name) throw new Error('请填写名称');
              const identity = role.trim() || contactLabels[contact.kind];
              const existing = data.contactLinks.find(
                (l) =>
                  l.caseId === caseId &&
                  l.contactId === contact.id &&
                  l.proceedingId === null &&
                  l.role === identity,
              );
              if (mode === 'new') {
                await save('save_contact', {
                  input: contact,
                  courtIds: contact.kind === 'judge' ? courts : [],
                  caseLink: { id: linkId, caseId, role: identity },
                });
              } else {
                await save('save_contact_link', {
                  input: {
                    id: existing?.id ?? linkId,
                    caseId,
                    contactId: contact.id,
                    proceedingId: null,
                    role: identity,
                  },
                });
              }
              await onSaved?.(contact);
            }
          : undefined
      }
    >
      {!selectedKind ? (
        <>
          <p className="field-hint">先选择要添加的对象类型</p>
          <div className="contact-kind-options">
            {contactKinds.map(({ kind: next, label, hint, icon: Icon }) => (
              <button type="button" key={next} onClick={() => chooseKind(next)}>
                <Icon />
                <span>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </span>
                <ChevronRight />
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="contact-kind-heading">
            <span>对象类型 · {label}</span>
            <button type="button" onClick={() => setSelectedKind(null)}>
              更改类型
            </button>
          </div>
          <div className="contact-source-options" role="group" aria-label="添加方式">
            <button
              type="button"
              aria-pressed={mode === 'existing'}
              onClick={() => {
                setMode('existing');
                onContactSelected?.(chosen);
              }}
            >
              已有{label} <small>{candidates.length}</small>
            </button>
            <button
              type="button"
              aria-pressed={mode === 'new'}
              onClick={() => {
                setMode('new');
                onContactSelected?.(null);
              }}
            >
              新建{label}
            </button>
          </div>
          {mode === 'existing' ? (
            <>
              <p className="field-hint">搜索本机全部已有{label}，包括其他案件使用过的档案。</p>
              <label className="contact-existing-search">
                <Search />
                <input
                  aria-label={`搜索已有${label}`}
                  placeholder="搜索名称、电话或地址"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setLimit(20);
                  }}
                />
              </label>
              <div className="contact-existing-list" role="group" aria-label={`选择已有${label}`}>
                {rows.slice(0, limit).map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    aria-pressed={chosen?.id === c.id}
                    onClick={() => reuse(c)}
                  >
                    <span>
                      <strong>{c.name}</strong>
                      <small>
                        {[c.phone || c.address, isLinked(c.id) ? '已在本案' : '']
                          .filter(Boolean)
                          .join(' · ') || contactLabels[c.kind]}
                      </small>
                    </span>
                    {chosen?.id === c.id && <Check />}
                  </button>
                ))}
                {!rows.length && (
                  <p className="quiet-empty">
                    {candidates.length
                      ? '没有匹配的对象，可切换到新建。'
                      : `还没有${label}档案，可切换到新建。`}
                  </p>
                )}
              </div>
              {rows.length > limit && (
                <button type="button" onClick={() => setLimit((v) => v + 20)}>
                  显示更多
                </button>
              )}
              {chosen && (
                <p className="contact-selection" role="status">
                  已选择：{chosen.name}
                </p>
              )}
            </>
          ) : (
            <>
              <ContactFields
                input={draft}
                data={data}
                onChange={(patch) => setDraft((v) => ({ ...v, ...patch }))}
                courts={courts}
                onCourtsChange={setCourts}
                compact
              />
              {!!duplicates.length && (
                <div className="existing-suggestion">
                  <span>已有同名{label}，可直接复用：</span>
                  {duplicates.map((c) => (
                    <button type="button" key={c.id} onClick={() => reuse(c)}>
                      选择已有的「{c.name}」
                      <small>{c.phone || c.address || contactLabels[c.kind]}</small>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <label>
            本案身份（可选）
            <input
              aria-label="本案身份"
              value={role}
              maxLength={50}
              onChange={(e) => setRole(e.target.value)}
              placeholder={
                selectedKind === 'person'
                  ? '如：我方代理律师、原告、被告'
                  : selectedKind === 'court'
                    ? '如：受理法院、执行法院'
                    : selectedKind === 'judge'
                      ? '如：承办法官、审判长'
                      : '如：鉴定机构、对方公司'
              }
            />
          </label>
          {properties}
          <p className="field-hint">添加到当前案件；与一审等节点的关系可稍后补充。</p>
        </>
      )}
    </Dialog>
  );
}
