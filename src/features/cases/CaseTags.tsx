import { useCallback, useId, useState } from 'react';
import { X } from 'lucide-react';
import { usePopover } from '../../components/usePopover';
export default function CaseTags({
  value,
  catalog,
  onChange,
  disabled,
}: {
  value: string[];
  catalog: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(-1);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  const { anchor, popup } = usePopover(open && !disabled, close, 250);
  const name = query.trim().replace(/^#+/, '').toLowerCase();
  const options = catalog.filter((tag) => !value.includes(tag) && tag.includes(name)).slice(0, 8);
  const choices = name && !catalog.includes(name) ? [...options, name] : options;
  function add(tag: string) {
    if (!tag || tag.length > 30 || /[\s#]/.test(tag) || value.length >= 12) {
      setError('标签限 1–30 字、不含空格，每案最多 12 个');
      return;
    }
    if (!value.includes(tag)) onChange([...value, tag].sort());
    setQuery('');
    setOpen(false);
    setActive(-1);
    setError('');
  }
  return (
    <div className="case-tags-editor">
      <div className="case-tag-chips">
        {value.map((tag) => (
          <span key={tag}>
            #{tag}
            <button
              type="button"
              disabled={disabled}
              aria-label={`移除标签${tag}`}
              onClick={() => onChange(value.filter((t) => t !== tag))}
            >
              <X />
            </button>
          </span>
        ))}
        <div className="case-tag-query" ref={anchor}>
          <input
            aria-label="案件标签"
            role="combobox"
            aria-expanded={open && !disabled}
            aria-controls={id}
            aria-autocomplete="list"
            aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
            disabled={disabled}
            placeholder={value.length ? '+ 标签' : '# 添加标签'}
            value={query}
            maxLength={31}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => setOpen(false)}
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
                  !choices.length
                    ? -1
                    : index < 0
                      ? e.key === 'ArrowDown'
                        ? 0
                        : choices.length - 1
                      : (index + (e.key === 'ArrowDown' ? 1 : -1) + choices.length) %
                        choices.length,
                );
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (active >= 0 && choices[active]) add(choices[active]);
                else if (options.length) add(options[0]);
                else if (name) add(name);
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }
            }}
          />
        </div>
      </div>
      {open && !disabled && (
        <div
          ref={popup}
          popover="manual"
          className="tag-suggestions field-popover"
          id={id}
          role="listbox"
          aria-label="已有案件标签"
        >
          <p className="picker-caption">已有标签 · 输入联想，回车选择</p>
          {!choices.length && (
            <p className="picker-caption">
              {name ? '已添加此标签' : '输入 #名称创建标签，下次可直接复用'}
            </p>
          )}
          {options.map((tag, index) => (
            <button
              type="button"
              role="option"
              id={`${id}-${index}`}
              aria-selected={active === index}
              key={tag}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(tag)}
            >
              #{tag}
            </button>
          ))}
          {name && !catalog.includes(name) && (
            <button
              type="button"
              role="option"
              id={`${id}-${options.length}`}
              aria-selected={active === options.length}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(name)}
            >
              创建 #{name}
            </button>
          )}
        </div>
      )}
      {error && (
        <span className="tag-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
