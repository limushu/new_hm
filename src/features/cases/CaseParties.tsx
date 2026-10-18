import { useState } from 'react';
import { Plus, Pencil, Trash2, Link2, ArrowUpRight } from 'lucide-react';
import Dialog from '../../components/Dialog';
import Select from '../../components/Select';
import SuggestInput from '../../components/SuggestInput';
import ContactPicker from '../contacts/ContactPicker';
import ContactDetail from '../contacts/ContactDetail';
import { proceedingName } from '../../domain/proceedings';
import type { CaseParty, Contact, Proceeding, SaveAction, Workspace } from '../../domain/types';
import './case-parties.css';

const sides = { client: '我方委托人', opponent: '对方当事人', other: '其他参与人' };
export default function CaseParties({
  caseId,
  program,
  data,
  save,
  onCase,
}: {
  caseId: string;
  program?: Proceeding;
  data: Workspace;
  save: SaveAction;
  onCase: (id: string) => void;
}) {
  const [editing, setEditing] = useState<CaseParty | null>(null);
  const [role, setRole] = useState('');
  const [linking, setLinking] = useState(false);
  const [removing, setRemoving] = useState<CaseParty | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const parties = data.caseParties.filter((p) => p.caseId === caseId);
  const roles = data.proceedingPartyRoles.filter((r) => r.proceedingId === program?.id);
  const contacts = data.contacts.filter((c) => c.kind === 'person' || c.kind === 'organization');
  function edit(p: CaseParty) {
    setEditing({ ...p });
    setRole(roles.find((r) => r.partyId === p.id)?.role ?? '');
    setLinking(!!p.contactId);
  }
  const suggestions = [
    ...data.proceedingPartyRoles.map((r) => r.role),
    '原告',
    '被告',
    '第三人',
    '上诉人',
    '被上诉人',
    '申请执行人',
    '被执行人',
    '申请人',
    '被申请人',
    '委托方',
  ];
  return (
    <section className="case-section case-parties" aria-label="委托与当事人">
      <div className="section-title">
        <h3>委托与当事人</h3>
        <button
          onClick={() =>
            edit({
              id: crypto.randomUUID(),
              caseId,
              contactId: null,
              name: '',
              side: 'client',
              serviceType: '代理',
            })
          }
        >
          <Plus />
          添加当事人
        </button>
      </div>
      <div className="party-scope">
        {program ? `${proceedingName(program, data.proceedings)}中的身份` : '尚未指定关注流程'}
      </div>
      {!parties.length && <p className="empty-text">尚未记录我方委托人和身份</p>}
      {parties.map((p) => {
        const identity = roles.find((r) => r.partyId === p.id)?.role;
        const linked = contacts.find((c) => c.id === p.contactId);
        return (
          <div className="party-row" key={p.id}>
            <div className="party-content">
              <span className={`party-side ${p.side}`}>{sides[p.side]}</span>
              <div className="party-name">
                {linked ? (
                  <button onClick={() => setContact(linked)}>
                    {p.name}
                    <ArrowUpRight />
                  </button>
                ) : (
                  p.name || <span className="is-empty">姓名待补充</span>
                )}
              </div>
              <div className="party-identity">
                <span className={identity ? '' : 'is-empty'}>
                  {identity || (program ? '本流程身份未填写' : '建立流程后填写身份')}
                </span>
                {p.side === 'client' && p.serviceType && <span> · {p.serviceType}</span>}
              </div>
            </div>
            <div className="party-actions">
              <button
                className="icon-button"
                aria-label={`编辑${p.name || sides[p.side]}`}
                onClick={() => edit(p)}
              >
                <Pencil />
              </button>
              <button
                className="icon-button"
                aria-label={`移除${p.name || sides[p.side]}`}
                onClick={() => setRemoving(p)}
              >
                <Trash2 />
              </button>
            </div>
          </div>
        );
      })}
      {editing && (
        <Dialog
          title={parties.some((p) => p.id === editing.id) ? '编辑当事人' : '添加当事人'}
          onClose={() => setEditing(null)}
          onSubmit={async () => {
            await save('save_case_party', {
              input: { ...editing, proceedingId: program?.id ?? null, role },
            });
          }}
        >
          <label>
            与我方的关系
            <Select
              aria-label="当事人与我方的关系"
              value={editing.side}
              onValueChange={(side) => setEditing({ ...editing, side: side as CaseParty['side'] })}
            >
              {Object.entries(sides).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label>
            名称
            <input
              aria-label="当事人名称"
              value={editing.name}
              maxLength={120}
              placeholder="姓名或机构名称，可稍后补充"
              disabled={!!editing.contactId}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          {linking ? (
            <div className="party-link-picker">
              <ContactPicker
                label="关联已有联系对象"
                contacts={contacts}
                value={editing.contactId}
                onSelect={(c) => {
                  setEditing({
                    ...editing,
                    contactId: c?.id ?? null,
                    name: c?.name ?? editing.name,
                  });
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setEditing({ ...editing, contactId: null });
                  setLinking(false);
                }}
              >
                取消对象关联
              </button>
            </div>
          ) : (
            <button className="party-link-action" type="button" onClick={() => setLinking(true)}>
              <Link2 />
              关联已有对象（可选）
            </button>
          )}
          {editing.side === 'client' && (
            <label>
              提供的服务
              <SuggestInput
                label="服务身份"
                value={editing.serviceType}
                onChange={(serviceType) => setEditing({ ...editing, serviceType })}
                suggestions={[
                  '代理',
                  '辩护',
                  '法律顾问',
                  ...data.caseParties.map((p) => p.serviceType),
                ].filter(Boolean)}
                placeholder="例如代理、辩护、法律顾问"
              />
            </label>
          )}
          {program && (
            <label>
              {proceedingName(program, data.proceedings)}中的身份
              <SuggestInput
                label="本流程身份"
                value={role}
                onChange={setRole}
                suggestions={suggestions}
                placeholder="输入或选择，可自定义"
              />
            </label>
          )}
          <p className="field-hint">名称和委托关系在案件内共用，身份只记录到当前流程。</p>
        </Dialog>
      )}
      {removing && (
        <Dialog
          title="移除当事人"
          danger
          submitLabel="移除"
          onClose={() => setRemoving(null)}
          onSubmit={async () => {
            await save('delete_case_party', { id: removing.id });
          }}
        >
          <p>
            移除“{removing.name || sides[removing.side]}”及其在各流程中的身份？独立联系对象会保留。
          </p>
        </Dialog>
      )}
      {contact && (
        <ContactDetail
          contact={contact}
          data={data}
          save={save}
          onCase={onCase}
          onClose={() => setContact(null)}
        />
      )}
    </section>
  );
}
