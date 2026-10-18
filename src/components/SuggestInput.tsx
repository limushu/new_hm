import { useCallback, useId, useState } from 'react';
import { usePopover } from './usePopover';

/** Free text with optional suggestions. Entered values never require a catalog entry. */
export default function SuggestInput({
  label,
  value,
  onChange,
  suggestions,
  placeholder = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const close = useCallback(() => setOpen(false), []);
  const id = useId();
  const rows = [...new Set(suggestions)].filter((s) =>
    s.toLowerCase().includes(value.toLowerCase()),
  );
  const { anchor, popup } = usePopover(open && rows.length > 0, close);
  return (
    <div ref={anchor} className="suggest-input">
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={open && rows.length > 0}
        aria-controls={id}
        aria-autocomplete="list"
        aria-activedescendant={open && rows[active] ? `${id}-${active}` : undefined}
        value={value}
        placeholder={placeholder}
        maxLength={80}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
            setActive((i) =>
              Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))),
            );
          }
          if (e.key === 'Enter' && open && rows.length) {
            e.preventDefault();
            onChange(rows[active] ?? rows[0]);
            close();
          }
        }}
      />
      {open && rows.length > 0 && (
        <div
          ref={popup}
          popover="manual"
          className="tag-suggestions"
          role="listbox"
          id={id}
          aria-label={`${label}建议`}
        >
          {rows.map((s, i) => (
            <button
              type="button"
              role="option"
              id={`${id}-${i}`}
              aria-selected={active === i}
              key={s}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(s);
                close();
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
