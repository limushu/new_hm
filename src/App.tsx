import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Folder, Settings, Trash2, RotateCcw } from 'lucide-react';
import { command, desktopRuntime, previewMode } from './services/repository';
import { emptyWorkspace } from './domain/types';
import type { CaseFile, Commands, Workspace } from './domain/types';
import CasePage, { type SaveAction } from './features/cases/CasePage';
import Calendar from './features/calendar/Calendar';
import CaseBoard from './features/cases/CaseBoard';

export default function App() {
  const [data, setData] = useState<Workspace>(emptyWorkspace);
  const [page, setPage] = useState('today');
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState<string | null>(null);
  const [draft, setDraft] = useState<CaseFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    const workspace = await command('load_workspace', {});
    setData(workspace);
    return workspace;
  }, []);
  useEffect(() => {
    let canceled = false;
    command('load_workspace', {})
      .then((value) => {
        if (!canceled) setData(value);
      })
      .catch((e) => {
        if (!canceled) setError(String(e));
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, []);
  const save: SaveAction = async <K extends keyof Commands>(name: K, args: Commands[K]['args']) => {
    const result = await command(name, args);
    await refresh();
    return result;
  };
  function create(statusId = 'not_started') {
    if (draft) {
      setOpened(draft.id);
      return;
    }
    const time = new Date().toISOString();
    const item: CaseFile = {
      id: crypto.randomUUID(),
      title: '',
      caseType: 'civil',
      statusId,
      currentProceedingId: null,
      createdAt: time,
      updatedAt: time,
      deletedAt: null,
    };
    setDraft(item);
    setOpened(item.id);
  }
  const activeCases = data.cases.filter((c) => !c.deletedAt);
  const openItem = opened
    ? data.cases.find((c) => c.id === opened && !c.deletedAt) ||
      (draft?.id === opened ? draft : null)
    : null;
  async function restore(id: string) {
    setBusy(true);
    try {
      await save('restore_case', { id });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Folder />
          律师工作台
        </div>
        <nav>
          <button className={page === 'today' ? 'active' : ''} onClick={() => setPage('today')}>
            <CalendarDays />
            今天
          </button>
          <button className={page === 'cases' ? 'active' : ''} onClick={() => setPage('cases')}>
            <Folder />
            案件
          </button>
          <button className={page === 'trash' ? 'active' : ''} onClick={() => setPage('trash')}>
            <Trash2 />
            回收站
          </button>
        </nav>
        <div className="sidebar-caption">最近案件</div>
        <div className="recent-cases">
          {activeCases.slice(0, 5).map((c) => (
            <button key={c.id} onClick={() => setOpened(c.id)} title={c.title}>
              {c.title}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <button onClick={() => setPage('settings')}>
            <Settings />
            设置
          </button>
          <span className="storage-indicator">
            <i />
            {previewMode ? '界面预览 · 不保存' : desktopRuntime ? '本地工作空间' : '浏览器预览'}
          </span>
        </div>
      </aside>
      <main className="main-content">
        {previewMode && (
          <div className="preview-banner">
            界面预览 · 虚构示例 · 刷新后重置。桌面应用使用 SQLite 保存数据。
          </div>
        )}
        {error && (
          <div className="app-error" role="alert">
            <p>{error}</p>
            <button
              onClick={() => {
                setError('');
                setLoading(true);
                void refresh()
                  .catch((e) => setError(String(e)))
                  .finally(() => setLoading(false));
              }}
            >
              重试
            </button>
          </div>
        )}
        {page === 'today' && (
          <Calendar
            data={data}
            openCase={setOpened}
            newCase={() => create()}
            findCases={() => setPage('cases')}
          />
        )}
        {page === 'cases' && (
          <CaseBoard
            data={data}
            query={query}
            loading={loading}
            onQueryChange={setQuery}
            onCreate={create}
            onOpen={setOpened}
          />
        )}
        {page === 'trash' && (
          <div className="simple-page">
            <h1>
              <Trash2 />
              回收站
            </h1>
            <p className="page-description">
              案件信息、办理程序与记录会一起保留，恢复后可继续办理。
            </p>
            {!data.cases.some((c) => c.deletedAt) && <p className="empty-text">回收站为空。</p>}
            {data.cases
              .filter((c) => c.deletedAt)
              .map((c) => (
                <div className="trash-item" key={c.id}>
                  <Folder />
                  <span>{c.title}</span>
                  <button disabled={busy} onClick={() => void restore(c.id)}>
                    <RotateCcw />
                    恢复
                  </button>
                </div>
              ))}
          </div>
        )}
        {page === 'settings' && (
          <div className="simple-page">
            <h1>
              <Settings />
              设置
            </h1>
            <section className="case-section">
              <h3>本地工作空间</h3>
              <p className="page-description">
                无需注册登录。桌面应用将案件、办理程序、待办和工作记录保存到当前用户的应用数据目录。
              </p>
              <p className="page-description">
                第一版正在开发。材料归档、通知提醒和自动备份将分步接入。
              </p>
            </section>
          </div>
        )}
      </main>
      {openItem && (
        <CasePage
          key={openItem.id}
          item={openItem}
          data={data}
          draft={!data.cases.some((c) => c.id === openItem.id)}
          save={save}
          close={() => {
            setOpened(null);
            setDraft(null);
          }}
          created={(id) => {
            setDraft(null);
            setOpened(id);
          }}
        />
      )}
    </div>
  );
}
