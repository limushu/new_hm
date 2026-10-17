import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePopover } from './usePopover';
import './fields.css';

function iso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function normalize(text: string) {
  const parts = text.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!parts) return null;
  const [, year, month, day] = parts;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
    ? iso(date)
    : null;
}
export default function DateField({
  value,
  onValueChange,
  'aria-label': label,
  required,
  min,
  disabled,
}: {
  value: string;
  onValueChange: (value: string) => void;
  'aria-label': string;
  required?: boolean;
  min?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(`${value || iso(new Date())}T12:00:00`));
  const input = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { anchor, popup } = usePopover(open, close, 284);
  useEffect(() => setDraft(value), [value]);
  function edit(text: string) {
    setDraft(text);
    const date = normalize(text);
    const error =
      text && (!date || (min && date < min))
        ? `请输入${min ? `不早于 ${min} 的` : '有效的'}日期（年-月-日）`
        : '';
    input.current?.setCustomValidity(error);
    if (!error) onValueChange(date || '');
  }
  function show() {
    const date = normalize(draft) || value || iso(new Date());
    setMonth(new Date(`${date}T12:00:00`));
    setOpen(true);
  }
  function choose(date: string) {
    edit(date);
    close();
    input.current?.focus();
  }
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  start.setDate(1 - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return date;
  });
  const today = iso(new Date());
  return (
    <div ref={anchor} className="date-field">
      <input
        ref={input}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        placeholder="选择日期或输入"
        value={draft}
        required={required}
        disabled={disabled}
        inputMode="numeric"
        maxLength={10}
        onClick={() => {
          if (!open) show();
        }}
        onChange={(e) => edit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            show();
          }
          if (e.key === 'Enter' && open) {
            e.preventDefault();
            e.stopPropagation();
            if (normalize(draft)) setDraft(normalize(draft)!);
            close();
          }
        }}
        onBlur={() => {
          const date = normalize(draft);
          if (date) setDraft(date);
        }}
      />
      <button
        type="button"
        className="date-open"
        aria-label={`选择${label}`}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
      >
        <CalendarDays />
      </button>
      {open && (
        <div
          ref={popup}
          popover="manual"
          role="dialog"
          aria-label={`${label}选择器`}
          className="field-popover date-menu"
        >
          <header>
            <button
              type="button"
              aria-label="上个月"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              <ChevronLeft />
            </button>
            <span>
              {month.getFullYear()} 年 {month.getMonth() + 1} 月
            </span>
            <button
              type="button"
              aria-label="下个月"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              <ChevronRight />
            </button>
          </header>
          <div className="date-weekdays">
            {'一二三四五六日'.split('').map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="date-days">
            {days.map((date) => {
              const text = iso(date);
              return (
                <button
                  type="button"
                  key={text}
                  aria-label={text}
                  aria-pressed={text === value}
                  aria-current={text === today ? 'date' : undefined}
                  className={`${date.getMonth() !== month.getMonth() ? 'outside-month' : ''} ${text === value ? 'selected' : ''}`}
                  disabled={!!min && text < min}
                  onClick={() => choose(text)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <footer>
            <button type="button" disabled={!!min && today < min} onClick={() => choose(today)}>
              今天
            </button>
            {!required && (
              <button type="button" onClick={() => choose('')}>
                清除日期
              </button>
            )}
          </footer>
        </div>
      )}
    </div>
  );
}
