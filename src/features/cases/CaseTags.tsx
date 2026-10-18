import { useId, useState } from 'react';
import { X } from 'lucide-react';
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
        <input
          aria-label="案件标签"
          role="combobox"
          aria-expanded={open}
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
          disabled={disabled}
          placeholder={value.length ? '+ 标签' : '# 添加案件类型或标签'}
          value={query}
          maxLength={31}
          onFocus={() => setOpen(true)}
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
                choices.length
                  ? (index + (e.key === 'ArrowDown' ? 1 : choices.length - 1) + choices.length) %
                    choices.length
                  : -1,
              );
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              if (active >= 0 && choices[active]) add(choices[active]);
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
      {open && (options.length > 0 || name) && (
        <div className="tag-suggestions" id={id} role="listbox" aria-label="已有案件标签">
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
