import { X } from 'lucide-react';
import type { Contact, Workspace } from '../../domain/types';
import ContactPicker from './ContactPicker';

/** Directory data only. Case roles and case relations belong to the caller. */
export default function ContactFields({
  input,
  data,
  onChange,
  courts,
  onCourtsChange,
  compact = false,
}: {
  input: Contact;
  data: Workspace;
  onChange: (patch: Partial<Contact>) => void;
  courts: string[];
  onCourtsChange: (ids: string[]) => void;
  compact?: boolean;
}) {
  const extra = (
    <>
      <label>
        地址
        <input
          aria-label="对象地址"
          value={input.address}
          maxLength={500}
          onChange={(e) => onChange({ address: e.target.value })}
        />
      </label>
      <label>
        备注
        <textarea
          aria-label="对象备注"
          rows={3}
          value={input.notes}
          maxLength={20000}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </label>
    </>
  );
  return (
    <>
      <label>
        {input.kind === 'court' ? '法院名称' : input.kind === 'organization' ? '机构名称' : '姓名'}
        <input
          aria-label="对象名称"
          required
          maxLength={120}
          value={input.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>
      <label>
        电话（可选）
        <input
          aria-label="对象电话"
          type="tel"
          value={input.phone}
          maxLength={80}
          onChange={(e) => onChange({ phone: e.target.value })}
        />
      </label>
      {input.kind === 'judge' && (
        <div className="court-memberships">
          <span className="field-label">任职法院（可选）</span>
          <div className="entity-chips">
            {[...new Set(courts)].map((id) => (
              <span key={id}>
                {data.contacts.find((c) => c.id === id)?.name}
                <button
                  type="button"
                  aria-label={`解除${data.contacts.find((c) => c.id === id)?.name}的法院关系`}
                  onClick={() => onCourtsChange(courts.filter((x) => x !== id))}
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
              if (c) onCourtsChange([...courts, c.id]);
            }}
            placeholder="搜索并添加已有法院"
          />
          <p className="field-hint">任职关系可稍后补充，不会更改案件已有的办理法院。</p>
        </div>
      )}
      {compact ? (
        <details className="contact-extra-fields">
          <summary>更多资料（地址、备注）</summary>
          {extra}
        </details>
      ) : (
        extra
      )}
    </>
  );
}
