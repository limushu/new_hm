import Select from '../../components/Select';
import { useState, type ReactNode } from 'react';
import Dialog from '../../components/Dialog';
import type { Contact, SaveAction, Workspace } from '../../domain/types';
import { contactLabels } from './ContactPicker';
import ContactFields from './ContactFields';
export default function ContactForm({
  value,
  data,
  save,
  onClose,
  onSaved,
  initialCourtId,
  allowedKinds,
  properties,
}: {
  value: Contact;
  data: Workspace;
  save: SaveAction;
  onClose: () => void;
  onSaved?: (contact: Contact) => Promise<void>;
  initialCourtId?: string | null;
  allowedKinds?: Contact['kind'][];
  properties?: ReactNode;
}) {
  const [input, setInput] = useState(value);
  const [reuseError, setReuseError] = useState('');
  const [courts, setCourts] = useState<string[]>(() =>
    data.contactRelations
      .filter((r) => r.judgeId === value.id)
      .map((r) => r.courtId)
      .concat(initialCourtId ? [initialCourtId] : []),
  );
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
        await onSaved?.(input);
      }}
    >
      <label>
        对象类型
        <Select
          aria-label="对象类型"
          value={input.kind}
          onValueChange={(kind) => setInput((v) => ({ ...v, kind: kind as Contact['kind'] }))}
        >
          {Object.entries(contactLabels)
            .filter(([id]) => !allowedKinds || allowedKinds.includes(id as Contact['kind']))
            .map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
        </Select>
      </label>
      <ContactFields
        input={input}
        data={data}
        onChange={(patch) => setInput((v) => ({ ...v, ...patch }))}
        courts={courts}
        onCourtsChange={setCourts}
      />
      {!!duplicates.length && (
        <div className="existing-suggestion">
          <span>已有同名对象，请核对后复用</span>
          {duplicates.map((c) => (
            <button
              type="button"
              key={c.id}
              disabled={!onSaved}
              onClick={async () => {
                try {
                  await onSaved?.(c);
                  onClose();
                } catch (reason) {
                  setReuseError(String(reason));
                }
              }}
            >
              {c.name}
              <small>{c.phone || c.address || contactLabels[c.kind]}</small>
            </button>
          ))}
        </div>
      )}
      {reuseError && (
        <p role="alert" className="error-message">
          {reuseError}
        </p>
      )}
      {properties}
    </Dialog>
  );
}
