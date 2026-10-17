import { useEffect, useId, useRef, useState } from 'react';
import { Search, ChevronDown, X, Plus, Check } from 'lucide-react';
import type { Contact } from '../../domain/types';
export const contactLabels: Record<Contact['kind'], string> = {
  person: '个人',
  organization: '机构',
  court: '法院',
  judge: '法官',
};
export default function ContactPicker({
  label,
  contacts,
  value,
  onSelect,
  onCreate,
  description,
  disabled = false,
  placeholder = '搜索或选择已有对象',
}: {
  label: string;
  contacts: Contact[];
  value: string | null;
  onSelect: (contact: Contact | null) => void;
  onCreate?: (name: string) => void;
  description?: (contact: Contact) => string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const selected = contacts.find((c) => c.id === value);
  const rows = contacts.filter((c) =>
    `${c.name} ${c.phone} ${c.address} ${description?.(c) ?? ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const canCreate =
    !!onCreate && !!query.trim() && !rows.some((c) => c.name.trim() === query.trim());
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  function choose(index: number) {
    if (index < rows.length) {
      onSelect(rows[index]);
      setOpen(false);
      setQuery('');
    } else if (canCreate) {
      onCreate?.(query.trim());
      setOpen(false);
    }
  }
  return (
    <div className="contact-picker" ref={root}>
      <div className={`picker-input ${open ? 'is-open' : ''}`}>
        <Search />
        <input
          ref={input}
          role="combobox"
          aria-label={label}
          aria-expanded={open}
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={open && rows[active] ? `${id}-${active}` : undefined}
          value={open ? query : (selected?.name ?? '')}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery('');
            setActive(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && open) {
              e.stopPropagation();
              e.preventDefault();
              setOpen(false);
              return;
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setOpen(true);
              setActive((i) =>
                Math.max(
                  0,
                  Math.min(
                    rows.length + (canCreate ? 1 : 0) - 1,
                    i + (e.key === 'ArrowDown' ? 1 : -1),
                  ),
                ),
              );
            }
            if (e.key === 'Enter' && open) {
              e.preventDefault();
              e.stopPropagation();
              choose(active);
            }
            if (e.key === 'Tab') setOpen(false);
          }}
        />
        {selected ? (
          <button
            type="button"
            aria-label={`清除${label}`}
            disabled={disabled}
            onClick={() => {
              onSelect(null);
              setOpen(false);
            }}
          >
            <X />
          </button>
        ) : (
          <button
            type="button"
            aria-label={`展开${label}`}
            disabled={disabled}
            onClick={() => input.current?.focus()}
          >
            <ChevronDown />
          </button>
        )}
      </div>
      {open && !disabled && (
        <div className="picker-popover">
          <div className="picker-caption">{query ? '匹配的已有对象' : '选择已有对象'}</div>
          <div role="listbox" id={id} aria-label={`${label}候选`}>
            {rows.map((c, index) => (
              <button
                type="button"
                role="option"
                id={`${id}-${index}`}
                key={c.id}
                aria-selected={value === c.id}
                className={index === active ? 'is-active' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(index)}
              >
                <span>
                  {c.name}
                  <small>
                    {description?.(c) ?? (c.phone || c.address || contactLabels[c.kind])}
                  </small>
                </span>
                {value === c.id && <Check />}
              </button>
            ))}
            {!rows.length && <p className="picker-empty">没有匹配的已有对象</p>}
          </div>
          {canCreate && (
            <button
              type="button"
              className="picker-create"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onCreate?.(query.trim());
                setOpen(false);
              }}
            >
              <Plus />
              新建「{query.trim()}」
            </button>
          )}
        </div>
      )}
    </div>
  );
}
