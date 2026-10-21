import { useState, type ReactNode } from 'react';
import { ChevronRight, MoreHorizontal, Plus, Search, Settings2, X } from 'lucide-react';
import Dialog from '../../components/Dialog';
import { statusPalette } from '../../domain/statusPalette';
import type { CaseFile, CaseStatus } from '../../domain/types';
import './mobile-cases.css';

export default function MobileCaseList({
  cases,
  statuses,
  query,
  onQueryChange,
  onCreate,
  onOpen,
  onMove,
  onDelete,
  onEditStatus,
  content,
  busy,
  onboarding,
}: {
  cases: CaseFile[];
  statuses: CaseStatus[];
  query: string;
  onQueryChange: (query: string) => void;
  onCreate: (statusId: string) => void;
  onOpen: (id: string) => void;
  onMove: (id: string, statusId: string) => Promise<void>;
  onDelete: (item: CaseFile) => void;
  onEditStatus: (status: CaseStatus) => void;
  content: (item: CaseFile) => ReactNode;
  busy: boolean;
  onboarding?: ReactNode;
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const [menu, setMenu] = useState<CaseFile | null>(null);
  const [manage, setManage] = useState(false);
  const selected = statuses.some((status) => status.id === filter) ? filter : null;
  const visible = cases.filter((item) => !selected || item.statusId === selected);
  const statusFor = (item: CaseFile) => statuses.find((status) => status.id === item.statusId);
  return (
    <div className="mobile-case-workspace">
      <header className="mobile-cases-heading">
        <div>
          <h1>案件</h1>
          <p>
            {cases.length} 个{query.trim() ? '匹配的' : ''}案件
          </p>
        </div>
        <button
          className="mobile-create-case"
          onClick={() => onCreate(selected ?? statuses[0]?.id ?? 'not_started')}
        >
          <Plus />
          新建
        </button>
      </header>
      {onboarding}
      <label className="mobile-case-search">
        <Search aria-hidden="true" />
        <input
          aria-label="搜索案件"
          placeholder="搜索案件名称、案号或标签"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        {query && (
          <button aria-label="清除案件搜索" onClick={() => onQueryChange('')}>
            <X />
          </button>
        )}
      </label>
      <div className="mobile-case-filters-row">
        <nav className="mobile-case-filters" aria-label="按案件状态筛选">
          <button aria-pressed={!selected} onClick={() => setFilter(null)}>
            全部 <span>{cases.length}</span>
          </button>
          {statuses.map((status) => (
            <button
              key={status.id}
              aria-pressed={selected === status.id}
              style={statusPalette(status)}
              onClick={() => setFilter(status.id)}
            >
              <i />
              {status.name}
              <span>{cases.filter((item) => item.statusId === status.id).length}</span>
            </button>
          ))}
        </nav>
        <button
          className="mobile-manage-status"
          aria-label="管理案件状态"
          onClick={() => setManage(true)}
        >
          <Settings2 />
        </button>
      </div>
      <div className="mobile-case-list" aria-label="案件列表">
        {visible.map((item) => (
          <article
            className="mobile-case-item case-card-shell"
            key={item.id}
            style={statusPalette(statusFor(item))}
          >
            <div className="mobile-case-item-top">
              <span className="board-status-pill">
                <i />
                {statusFor(item)?.name ?? '未分类'}
              </span>
              <button
                className="mobile-case-more"
                aria-label={`案件操作「${item.title}」`}
                disabled={busy}
                onClick={() => setMenu(item)}
              >
                <MoreHorizontal />
              </button>
            </div>
            <button
              className="case-card mobile-case-card"
              data-case-id={item.id}
              aria-label={item.title}
              onClick={() => onOpen(item.id)}
            >
              {content(item)}
              <ChevronRight className="mobile-case-arrow" aria-hidden="true" />
            </button>
          </article>
        ))}
        {!visible.length && (
          <div className="mobile-cases-empty">
            <h2>
              {query.trim()
                ? '没有匹配的案件'
                : selected
                  ? '这个状态下还没有案件'
                  : '从第一个案件开始'}
            </h2>
            <p>
              {query.trim()
                ? '试试其他名称、案号或标签。'
                : '建立案件后，在这里查看进度与下一步工作。'}
            </p>
            {selected && <button onClick={() => setFilter(null)}>查看全部案件</button>}
          </div>
        )}
      </div>
      {menu && (
        <Dialog title="案件操作" onClose={() => setMenu(null)}>
          <p className="mobile-case-menu-title">{menu.title}</p>
          <div className="mobile-case-status-actions" aria-label="更改案件状态">
            {statuses.map((status) => (
              <button
                type="button"
                key={status.id}
                disabled={busy}
                aria-pressed={menu.statusId === status.id}
                onClick={async () => {
                  await onMove(menu.id, status.id);
                  setMenu(null);
                }}
              >
                {status.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mobile-case-delete"
            onClick={() => {
              onDelete(menu);
              setMenu(null);
            }}
          >
            移入回收站
          </button>
        </Dialog>
      )}
      {manage && (
        <Dialog title="管理案件状态" onClose={() => setManage(false)}>
          <div className="mobile-case-status-actions">
            {statuses.map((status) => (
              <button
                key={status.id}
                type="button"
                onClick={() => {
                  setManage(false);
                  onEditStatus(status);
                }}
              >
                编辑{status.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mobile-create-case"
            onClick={() => {
              setManage(false);
              onEditStatus({ id: crypto.randomUUID(), name: '', color: '#768b9a' });
            }}
          >
            <Plus />
            新增状态
          </button>
        </Dialog>
      )}
    </div>
  );
}
