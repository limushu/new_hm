import BrandMark from './components/BrandMark';
import RetainedView from './components/RetainedView';
import Welcome from './components/Welcome';
import { WELCOME_EDITION } from './domain/welcome';
import UpdateNotice from './components/UpdateNotice';
import Contacts, { ContactDetail } from './features/contacts/Contacts';
import SettingsPage from './features/settings/Settings';
import GlobalSearch from './components/GlobalSearch';
import Notifications from './components/Notifications';
import Trash from './components/Trash';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Folder, Settings, Trash2, Users, Search, Bell } from 'lucide-react';
import { command, nativeRuntime, previewMode } from './services/repository';
import { emptyWorkspace } from './domain/types';
import type { CaseFile, Commands, Contact, SaveAction, Workspace } from './domain/types';
import CasePage from './features/cases/CasePage';
import Calendar from './features/calendar/Calendar';
import CaseBoard from './features/cases/CaseBoard';
import MiniCalendar from './features/calendar/MiniCalendar';
import { dateKey } from './domain/calendar';

export default function App() {
  const [data, setData] = useState<Workspace>(emptyWorkspace);
  const [page, setPage] = useState('today');
  const [compact, setCompact] = useState(() => matchMedia('(max-width: 760px)').matches);
  useEffect(() => {
    const query = matchMedia('(max-width: 760px)');
    const update = () => setCompact(query.matches);
    query.addEventListener('change', update);
    update();
    return () => query.removeEventListener('change', update);
  }, []);
  const [calendarDate, setCalendarDate] = useState(() => dateKey(new Date()));
  const [calendarView, setCalendarView] = useState<'week' | 'day' | 'month'>(() =>
    matchMedia('(max-width: 760px)').matches ? 'day' : 'week',
  );
  const [query, setQuery] = useState('');
  const [opened, setOpened] = useState<string | null>(null);
  const [draft, setDraft] = useState<CaseFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [welcome, setWelcome] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState<Contact | null>(null);
  const [initialTab, setInitialTab] = useState('overview');
  const [focusMaterialId, setFocusMaterialId] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [storage, setStorage] = useState<Commands['storage_info']['result'] | null>(null);
  const refresh = useCallback(async () => {
    const workspace = await command('load_workspace', {});
    setData(workspace);
    return workspace;
  }, []);
  useEffect(() => {
    let canceled = false;
    void command('storage_info', {})
      .then((value) => {
        if (!canceled) setStorage(value);
      })
      .catch(() => {});
    Promise.all([command('load_workspace', {}), command('get_settings', {}).catch(() => null)])
      .then(([value, settings]) => {
        if (canceled) return;
        setData(value);
        if (settings && settings.onboarding_done !== WELCOME_EDITION) {
          const previewWelcome = previewMode && new URLSearchParams(location.search).has('welcome');
          if (previewWelcome || !previewMode) setWelcome(true);
        }
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
  const save: SaveAction = useCallback(
    async <K extends keyof Commands>(name: K, args: Commands[K]['args']) => {
      const result = await command(name, args);
      await refresh();
      return result;
    },
    [refresh],
  );
  function create(statusId = 'not_started') {
    setInitialTab('overview');
    setFocusMaterialId(undefined);
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
  const activeCases = useMemo(() => data.cases.filter((c) => !c.deletedAt), [data.cases]);
  const openItem = opened
    ? data.cases.find((c) => c.id === opened && !c.deletedAt) ||
      (draft?.id === opened ? draft : null)
    : null;
  function navigateCase(id: string, tab = 'overview', materialId?: string) {
    setFocusMaterialId(materialId);
    setInitialTab(tab);
    setOpened(id);
  }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          案笺
        </div>
        <div className="sidebar-search-row">
          <button onClick={() => setSearchOpen(true)}>
            <Search />
            搜索<kbd>Ctrl K</kbd>
          </button>
          <button aria-label="日程提醒" title="日程提醒" onClick={() => setNotificationsOpen(true)}>
            <Bell />
          </button>
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
          <button
            className={page === 'contacts' ? 'active' : ''}
            onClick={() => setPage('contacts')}
          >
            <Users />
            联系对象
          </button>
          <button className={page === 'trash' ? 'active' : ''} onClick={() => setPage('trash')}>
            <Trash2 />
            回收站
          </button>
          <button
            className={page === 'settings' ? 'active' : ''}
            onClick={() => setPage('settings')}
          >
            <Settings />
            设置
          </button>
        </nav>
        {!compact && page === 'today' && (
          <MiniCalendar selected={calendarDate} onSelect={setCalendarDate} />
        )}
        <div className="sidebar-caption">最近案件</div>
        <div className="recent-cases">
          {activeCases.slice(0, 5).map((c) => (
            <button key={c.id} onClick={() => navigateCase(c.id)} title={c.title}>
              {c.title}
            </button>
          ))}
        </div>
        <UpdateNotice />
        <div className="sidebar-bottom">
          <span className="storage-indicator">
            <i />
            {previewMode
              ? '界面预览 · 不保存'
              : nativeRuntime
                ? storage?.portable
                  ? '绿色版 · 本地保存'
                  : '本地工作空间'
                : '浏览器预览'}
          </span>
        </div>
      </aside>
      <main className="main-content">
        {previewMode && (
          <div className="preview-banner">
            界面预览 · 虚构示例 · 刷新后重置。桌面应用使用 SQLite 保存数据。
          </div>
        )}
        <div className="mobile-utilities">
          <button aria-label="搜索工作区" onClick={() => setSearchOpen(true)}>
            <Search />
          </button>
          <button aria-label="查看日程提醒" onClick={() => setNotificationsOpen(true)}>
            <Bell />
          </button>
        </div>
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
        <RetainedView active={page === 'today'}>
          <Calendar
            data={data}
            openCase={navigateCase}
            newCase={() => create()}
            findCases={() => setPage('cases')}
            save={save}
            loading={loading}
            selected={calendarDate}
            onSelect={setCalendarDate}
            view={calendarView}
            onViewChange={setCalendarView}
          />
        </RetainedView>
        <RetainedView active={page === 'cases'}>
          <CaseBoard
            compact={compact}
            data={data}
            query={query}
            loading={loading}
            onQueryChange={setQuery}
            onCreate={create}
            onOpen={navigateCase}
            save={save}
            onMove={async (id, statusId) => {
              await command('set_case_status', { id, statusId });
              setData((current) => ({
                ...current,
                cases: current.cases.map((item) =>
                  item.id === id
                    ? { ...item, statusId, updatedAt: new Date().toISOString() }
                    : item,
                ),
              }));
            }}
          />
        </RetainedView>
        <RetainedView active={page === 'contacts'}>
          <Contacts data={data} save={save} onCase={navigateCase} />
        </RetainedView>
        <RetainedView active={page === 'trash'}>
          <Trash data={data} save={save} />
        </RetainedView>
        <RetainedView active={page === 'settings'}>
          <SettingsPage save={save} storage={storage} />
        </RetainedView>
      </main>
      {welcome && <Welcome onDone={() => setWelcome(false)} />}
      {openItem && (
        <CasePage
          key={openItem.id + initialTab + (focusMaterialId ?? '')}
          item={openItem}
          data={data}
          onCase={navigateCase}
          initialTab={initialTab}
          focusMaterialId={focusMaterialId}
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
      {searchOpen && (
        <GlobalSearch
          data={data}
          onClose={() => setSearchOpen(false)}
          onCase={navigateCase}
          onContact={setContactOpen}
        />
      )}
      {notificationsOpen && (
        <Notifications
          data={data}
          onClose={() => setNotificationsOpen(false)}
          onCase={navigateCase}
        />
      )}
      {contactOpen && (
        <ContactDetail
          contact={contactOpen}
          data={data}
          save={save}
          onCase={navigateCase}
          onClose={() => setContactOpen(null)}
        />
      )}
    </div>
  );
}
