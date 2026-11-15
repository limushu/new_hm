import { useState, type ReactNode } from 'react';
import type { Contact, SaveAction, Workspace } from '../../domain/types';
import ContactForm from '../contacts/ContactForm';
import { emptyContact } from '../contacts/model';
import { contactLabels } from '../contacts/ContactPicker';
export default function CasePersonEditor({
  caseId,
  data,
  save,
  onClose,
  properties,
  onSaved,
  kind = 'person',
}: {
  caseId: string;
  data: Workspace;
  save: SaveAction;
  onClose: () => void;
  properties?: ReactNode;
  onSaved?: (contact: Contact) => Promise<void>;
  kind?: Contact['kind'];
}) {
  const [contact] = useState(() => emptyContact(kind));
  const [role, setRole] = useState('');
  const [linkId] = useState(() => crypto.randomUUID());
  return (
    <ContactForm
      value={contact}
      data={data}
      save={save}
      onClose={onClose}
      properties={
        <>
          <label>
            本案身份（可选）
            <input
              aria-label="本案身份"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={120}
              placeholder="例如：我方代理律师、承办法官、原告"
            />
          </label>
          {properties}
        </>
      }
      onSaved={async (c) => {
        await save('save_contact_link', {
          input: {
            id: linkId,
            caseId,
            contactId: c.id,
            proceedingId: null,
            role: role.trim() || contactLabels[c.kind],
          },
        });
        await onSaved?.(c);
      }}
    />
  );
}
