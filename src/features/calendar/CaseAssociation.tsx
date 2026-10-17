import { useEffect, useRef, useState } from 'react';
import { Folder, Plus, Search, X } from 'lucide-react';
import type { CaseFile } from '../../domain/types';
import './case-association.css';

interface Props {
  value: string | null;
  cases: CaseFile[];
  onChange: (id: string | null) => void;
}

export default function CaseAssociation({ value, cases, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const firstResult = useRef<HTMLButtonElement>(null);
  const linked = cases.find((item) => item.id === value);
  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);
  function toggle() {
    setQuery('');
    setOpen((current) => !current);
  }
  const results = cases.filter((item) =>
    item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div
      className="case-association"
      onKeyDown={(event) => {
        if (
          open &&
          event.target === search.current &&
          (event.key === 'Enter' || event.key === 'ArrowDown')
        ) {
          event.preventDefault();
          event.stopPropagation();
          firstResult.current?.focus();
        }
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <div className="case-association-row">
        <button
          type="button"
          className={`event-associate ${linked ? 'has-case' : ''}`}
          aria-label={linked ? '更换关联案件' : '关联案件'}
          aria-expanded={open}
          onClick={toggle}
        >
          {linked ? <Folder /> : <Plus />}
          <span>{linked ? linked.title : '关联案件'}</span>
        </button>
        {linked && (
          <button
            type="button"
            className="icon-button"
            aria-label="取消关联案件"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            <X />
          </button>
        )}
      </div>
      {open && (
        <div className="case-association-picker" role="group" aria-label="选择关联案件">
          <label className="case-association-search">
            <Search />
            <input
              ref={search}
              aria-label="搜索关联案件"
              placeholder="搜索案件名称…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="case-association-results">
            {results.map((item, index) => (
              <button
                type="button"
                key={item.id}
                ref={index === 0 ? firstResult : undefined}
                aria-label={`关联 ${item.title}`}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
              >
                <Folder />
                <span>{item.title}</span>
                {item.id === value && <small>已关联</small>}
              </button>
            ))}
            {!results.length && <p>{cases.length ? '没有匹配的案件' : '暂无可关联案件'}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
