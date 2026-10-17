import {
  Children,
  isValidElement,
  useCallback,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { usePopover } from './usePopover';
import './fields.css';

interface Option {
  value: string | number;
  children: ReactNode;
  disabled?: boolean;
}
export default function Select({
  value,
  onValueChange,
  children,
  disabled,
  className = '',
  'aria-label': label,
}: {
  value: string | number;
  onValueChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  'aria-label': string;
}) {
  const options = Children.toArray(children)
    .filter(isValidElement<Option>)
    .map((o) => o.props);
  const selected = options.findIndex((o) => String(o.value) === String(value));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const close = useCallback(() => setOpen(false), []);
  const { anchor, popup } = usePopover(open, close);
  const id = useId();
  const search = useRef({ text: '', time: 0 });
  function show() {
    setActive(Math.max(0, selected));
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    close();
    if (String(option.value) !== String(value)) onValueChange(String(option.value));
  }
  return (
    <div className={`select-field ${className}`} ref={anchor}>
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={id}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        disabled={disabled}
        data-value={value}
        className="select-trigger"
        onClick={() => (open ? close() : show())}
        onBlur={() => close()}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            if (!open) {
              show();
              return;
            }
            if (e.key === 'Enter' || e.key === ' ') {
              choose(active);
              return;
            }
            const direction = e.key === 'ArrowUp' ? -1 : 1;
            let index =
              e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : active + direction;
            while (options[index]?.disabled) index += direction;
            if (options[index]) {
              setActive(index);
              popup.current
                ?.querySelector(`#${CSS.escape(`${id}-${index}`)}`)
                ?.scrollIntoView({ block: 'nearest' });
            }
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
            search.current.text =
              Date.now() - search.current.time < 700 ? search.current.text + e.key : e.key;
            search.current.time = Date.now();
            const index = options.findIndex(
              (o) =>
                !o.disabled &&
                Children.toArray(o.children)
                  .join('')
                  .toLowerCase()
                  .startsWith(search.current.text.toLowerCase()),
            );
            if (index >= 0) {
              if (!open) setOpen(true);
              setActive(index);
            }
          }
        }}
      >
        <span>{options[selected]?.children ?? '请选择'}</span>
        <ChevronDown />
      </button>
      {open && (
        <div
          ref={popup}
          popover="manual"
          id={id}
          role="listbox"
          aria-label={`${label}选项`}
          className="field-popover select-menu"
        >
          {options.map((o, i) => (
            <button
              type="button"
              role="option"
              key={o.value}
              id={`${id}-${i}`}
              aria-selected={i === selected}
              disabled={o.disabled}
              data-value={o.value}
              tabIndex={-1}
              className={i === active ? 'is-active' : ''}
              onPointerMove={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              <span>{o.children}</span>
              {i === selected && <Check />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
