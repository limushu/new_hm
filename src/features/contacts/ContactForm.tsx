import { useState } from 'react';
import { X } from 'lucide-react';
import Dialog from '../../components/Dialog';
import type { Contact, SaveAction, Workspace } from '../../domain/types';
import ContactPicker, { contactLabels } from './ContactPicker';
export default function ContactForm({
  value,
  data,
  save,
  onClose,
  onSaved,
  initialCourtId,
  allowedKinds,
}: {
  value: Contact;
  data: Workspace;
  save: SaveAction;
  onClose: () => void;
  onSaved?: (contact: Contact) => Promise<void>;
  initialCourtId?: string | null;
  allowedKinds?: Contact['kind'][];
}) {
  const [input, setInput] = useState(value);
  const [reuseError, setReuseError] = useState('');
  const [courts, setCourts] = useState<string[]>(() =>
    data.contactRelations
      .filter((r) => r.judgeId === value.id)
      .map((r) => r.courtId)
      .concat(initialCourtId ? [initialCourtId] : []),
  );
  const update = (patch: Partial<Contact>) => setInput((v) => ({ ...v, ...patch }));
  const duplicates = data.contacts.filter(
    (c) =>
      c.id !== input.id &&
      c.kind === input.kind &&
      c.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
  );
  return (
    <Dialog
      title={
        value.name && data.contacts.some((c) => c.id === value.id) ? '编辑联系对象' : '新建联系对象'
      }
      onClose={onClose}
      onSubmit={async () => {
        await save('save_contact', { input, courtIds: input.kind === 'judge' ? courts : [] });
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
      {!!duplicates.length && (
        <div className="existing-suggestion">
          <span>已有同名对象，请核对后复用</span>
          {duplicates.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={async () => {
                try {
                  if (onSaved) await onSaved(c);
                  onClose();
                } catch (reason) {
                  setReuseError(String(reason));
                }
              }}
              disabled={!onSaved}
            >
              {c.name}
              <small>
                {data.contactRelations
                  .filter((r) => r.judgeId === c.id)
                  .map((r) => data.contacts.find((x) => x.id === r.courtId)?.name)
                  .join(' · ') ||
                  c.phone ||
                  contactLabels[c.kind]}
              </small>
            </button>
          ))}
        </div>
      )}
      {reuseError && (
        <p role="alert" className="error-message">
          {reuseError}
        </p>
      )}
      <div className="form-columns">
        <label>
          类型
          <select
            aria-label="对象类型"
            value={input.kind}
            onChange={(e) => update({ kind: e.target.value as Contact['kind'] })}
          >
            {Object.entries(contactLabels)
              .filter(([id]) => !allowedKinds || allowedKinds.includes(id as Contact['kind']))
              .map(([id, label]) => (
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
      {input.kind === 'judge' && (
        <div className="court-memberships">
          <span className="field-label">关联法院</span>
          <div className="entity-chips">
            {[...new Set(courts)].map((id) => (
              <span key={id}>
                {data.contacts.find((c) => c.id === id)?.name}
                <button
                  type="button"
                  aria-label={`解除${data.contacts.find((c) => c.id === id)?.name}的法院关系`}
                  onClick={() => setCourts((ids) => ids.filter((x) => x !== id))}
                >
                  <X />
                </button>
              </span>
            ))}
          </div>
          <ContactPicker
            label="法官关联法院"
            contacts={data.contacts.filter((c) => c.kind === 'court' && !courts.includes(c.id))}
            value={null}
            onSelect={(c) => {
              if (c) setCourts((ids) => [...ids, c.id]);
            }}
            placeholder="搜索并添加已有法院"
          />
          <p className="field-hint">可关联多个法院。调整这里的关系不会改写历史程序的办理法院。</p>
        </div>
      )}
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
