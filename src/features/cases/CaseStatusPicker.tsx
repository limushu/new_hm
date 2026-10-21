import { useCallback, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { statusPalette } from '../../domain/statusPalette';
import type { CaseStatus } from '../../domain/types';
import { usePopover } from '../../components/usePopover';
import { useAction } from '../../components/useAction';

export default function CaseStatusPicker({
  value,
  statuses,
  disabled,
  onChoose,
}: {
  value: string;
  statuses: CaseStatus[];
  disabled: boolean;
  onChoose: (status: CaseStatus, create: boolean) => Promise<boolean>;
}) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const { busy, error, run } = useAction();
  const close = useCallback(() => setOpen(false), []);
  const { anchor, popup } = usePopover(open && !disabled && !busy, close, 250);
  const id = useId();
  const selected = statuses.find((s) => s.id === value);
  const name = query.trim().replace(/^#+/, '').trim();
  const options = statuses.filter((s) => s.name.toLowerCase().includes(name.toLowerCase()));
  const create = !!name && !statuses.some((s) => s.name.toLowerCase() === name.toLowerCase());
  const count = options.length + (create ? 1 : 0);
  function show() {
    setQuery('');
    setActive(statuses.findIndex((s) => s.id === value));
    setOpen(true);
  }
  function choose(index: number) {
    if (!options[index] && !(create && index === options.length)) return;
    const status = options[index] ?? { id: crypto.randomUUID(), name, color: '#768b9a' };
    if (matchMedia('(pointer: coarse)').matches) input.current?.blur();
    void run(async () => {
      if (await onChoose(status, !options[index])) {
        setOpen(false);
        setQuery('');
      }
    });
  }
  return (
    <div className="case-status-picker" ref={anchor}>
      <div className="case-status-input" style={statusPalette(selected)}>
        <i className="status-dot" aria-hidden="true" />
        <input
          ref={input}
          role="combobox"
          aria-label="案件状态"
          aria-autocomplete="list"
          aria-controls={id}
          aria-expanded={open && !disabled && !busy}
          aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
          data-value={value}
          value={open ? query : selected ? `#${selected.name}` : ''}
          placeholder="搜索或创建状态"
          maxLength={31}
          size={Math.min(18, Math.max(6, (selected?.name.length ?? 6) * 2 + 1))}
          disabled={disabled || busy}
          onFocus={show}
          onClick={() => {
            if (!open) show();
          }}
          onBlur={close}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setOpen(true);
              setActive((index) =>
                !count
                  ? -1
                  : index < 0
                    ? e.key === 'ArrowDown'
                      ? 0
                      : count - 1
                    : (index + (e.key === 'ArrowDown' ? 1 : -1) + count) % count,
              );
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              if (open) choose(active >= 0 ? active : 0);
              else show();
            }
          }}
        />
        <ChevronDown aria-hidden="true" />
      </div>
      {open && !disabled && !busy && (
        <div
          ref={popup}
          popover="manual"
          className="field-popover tag-suggestions"
          id={id}
          role="listbox"
          aria-label="案件状态选项"
        >
          <p className="picker-caption">案件状态 · 单选，可输入创建</p>
          {options.map((s, index) => (
            <button
              key={s.id}
              type="button"
              role="option"
              id={`${id}-${index}`}
              data-value={s.id}
              aria-selected={active === index}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(index)}
            >
              <span className="status-option-pill" style={statusPalette(s)}>
                <i className="status-dot" aria-hidden="true" />#{s.name}
              </span>
              {s.id === value && <Check />}
            </button>
          ))}
          {create && (
            <button
              type="button"
              role="option"
              id={`${id}-${options.length}`}
              aria-selected={active === options.length}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(options.length)}
            >
              创建 #{name}
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="tag-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
