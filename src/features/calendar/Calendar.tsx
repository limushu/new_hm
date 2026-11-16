import Select from '../../components/Select';
import Button from '../../components/Button';
import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Folder,
  MapPin,
  Plus,
  Search,
  Square,
} from 'lucide-react';
import { dateKey, monthDays, parseDate, shiftDate, weekDates } from '../../domain/calendar';
import type { CalendarEvent, SaveAction, Workspace, Task } from '../../domain/types';
import { WorkTaskEditor } from '../cases/WorkTasks';
import {
  displayDate,
  emptyEvent,
  eventRange,
  eventsOn,
  eventTime,
  visibleEvents,
} from './schedule';
import EventEditor from './EventEditor';
import TimeGrid from './TimeGrid';
import { slotEvent } from './timeline';
import './calendar.css';
import { useAction } from '../../components/useAction';

interface Props {
  data: Workspace;
  openCase: (id: string) => void;
  newCase: () => void;
  findCases: () => void;
  save: SaveAction;
  loading: boolean;
  selected: string;
  onSelect: (date: string) => void;
  view: 'week' | 'day' | 'month' | 'agenda';
  onViewChange: (view: 'week' | 'day' | 'month' | 'agenda') => void;
  todayRequest?: number;
}

export default function Calendar({
  data,
  openCase,
  newCase,
  findCases,
  save,
  loading,
  selected,
  onSelect,
  view,
  onViewChange,
  todayRequest = 0,
}: Props) {
  const [month, setMonth] = useState(() => parseDate(selected));
  const setSelected = onSelect;
  useEffect(() => {
    setMonth(parseDate(selected));
  }, [selected]);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [filter, setFilter] = useState<'all' | 'events' | 'tasks'>('all');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [focusToday, setFocusToday] = useState(0);
  const taskAction = useAction();
  const agenda = useRef<HTMLElement>(null);
  const activeCases = data.cases.filter((item) => !item.deletedAt);
  const active = new Set(activeCases.map((item) => item.id));
  const tasks = data.tasks.filter((task) => !task.completed && active.has(task.caseId));
  const events = filter === 'tasks' ? [] : visibleEvents(data);
  const datedTasks = filter === 'events' ? [] : tasks.filter((task) => task.dueDate);
  const dayEvents = eventsOn(events, selected);
  const dayTasks = datedTasks.filter(
    (task) => task.dueDate === selected || (view === 'agenda' && task.dueDate! < selected),
  );
  const undated = tasks.filter((task) => !task.dueDate);
  const today = dateKey(new Date());
  const caseTitle = (id: string | null) => activeCases.find((item) => item.id === id)?.title;

  function select(date: string) {
    setSelected(date);
    const [year, month] = date.split('-').map(Number);
    setMonth(new Date(year, month - 1, 1, 12));
  }
  function changeMonth(offset: number) {
    if (view !== 'month') {
      setSelected(shiftDate(selected, offset * (view === 'week' ? 7 : 1)));
      return;
    }
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1, 12);
    setMonth(next);
    setSelected(dateKey(next));
  }
  function create(date: string, minute?: number, allDay = false) {
    if (loading || !data.statuses.length) return;
    setSelected(date);
    setEditing(
      allDay
        ? { ...emptyEvent(date), startTime: null, endTime: null }
        : minute === undefined
          ? emptyEvent(date)
          : slotEvent(date, minute),
    );
  }

  return (
    <div className={`calendar-page calendar-view-${view}`}>
      <header className="calendar-header">
        <div className="calendar-heading">
          <span className="calendar-eyebrow">日历</span>
          <h1>
            {view === 'agenda' ? (
              displayDate(selected)
            ) : (
              <>
                {month.getFullYear()}年 <span>{month.getMonth() + 1}月</span>
              </>
            )}
          </h1>
        </div>
        {view !== 'agenda' && (
          <div className="calendar-navigation">
            <Button
              className="calendar-today"
              onClick={() => {
                select(dateKey(new Date()));
                setFocusToday((value) => value + 1);
              }}
            >
              今天
            </Button>
            <Button
              variant="ghost"
              icon={ChevronLeft}
              aria-label={view === 'month' ? '上个月' : view === 'week' ? '上一周' : '上一天'}
              onClick={() => changeMonth(-1)}
            />
            <Button
              variant="ghost"
              icon={ChevronRight}
              aria-label={view === 'month' ? '下个月' : view === 'week' ? '下一周' : '下一天'}
              onClick={() => changeMonth(1)}
            />
          </div>
        )}
        <div className="calendar-actions">
          <div className="calendar-extra-actions">
            <Button variant="ghost" icon={Search} className="calendar-search" onClick={findCases}>
              <span>查找案件</span>
            </Button>
            <Button
              variant="ghost"
              icon={Folder}
              className="calendar-new-case"
              disabled={loading || !data.statuses.length}
              onClick={newCase}
            >
              <span>新建案件</span>
            </Button>
          </div>
          <Button
            variant="primary"
            icon={Plus}
            className="calendar-primary"
            disabled={loading || !data.statuses.length}
            onClick={() => create(selected)}
          >
            新建日程
          </Button>
        </div>
      </header>
      <div className="calendar-toolbar">
        <div className="calendar-filters" aria-label="日历内容">
          {(
            [
              ['all', '全部'],
              ['events', '日程'],
              ['tasks', '待办'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <Select
          className="calendar-view-select"
          aria-label="日历视图"
          value={view}
          onValueChange={(value) => onViewChange(value as typeof view)}
        >
          <option value="agenda">清单</option>
          <option value="day">日视图</option>
          <option value="week">周视图</option>
          <option value="month">月视图</option>
        </Select>
      </div>
      {view === 'agenda' && (
        <nav className="agenda-week-strip" aria-label="本周日期">
          {weekDates(selected).map((date) => (
            <button
              type="button"
              key={date}
              aria-label={`选择 ${date}`}
              aria-pressed={selected === date}
              aria-current={date === today ? 'date' : undefined}
              onClick={() => select(date)}
            >
              <small>{['日', '一', '二', '三', '四', '五', '六'][parseDate(date).getDay()]}</small>
              <strong>{parseDate(date).getDate()}</strong>
            </button>
          ))}
        </nav>
      )}
      {view === 'month' && (
        <>
          <div className="weekdays">
            {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div
            className="month-grid"
            aria-label={`${month.getFullYear()}年${month.getMonth() + 1}月`}
            aria-busy={loading}
          >
            {monthDays(month.getFullYear(), month.getMonth()).map((date) => {
              const key = dateKey(date);
              const items = eventsOn(events, key);
              const due = datedTasks.filter((task) => task.dueDate === key);
              const hidden = Math.max(0, items.length + due.length - 3);
              const available = Math.max(0, 3 - items.length);
              return (
                <div
                  key={key}
                  className={`calendar-day ${date.getMonth() !== month.getMonth() ? 'outside' : ''} ${selected === key ? 'selected' : ''}`}
                  data-date={key}
                  onClick={() => setSelected(key)}
                  onDoubleClick={(e) => {
                    if (!(e.target as HTMLElement).closest('button')) create(key);
                  }}
                >
                  <div className="calendar-date-row">
                    <button
                      className={`date-button ${key === today ? 'today-number' : ''}`}
                      aria-label={`选择 ${key}`}
                      aria-pressed={selected === key}
                      onClick={() => setSelected(key)}
                    >
                      {date.getDate()}
                    </button>
                    <button
                      className="day-create icon-button"
                      aria-label={`在 ${key} 新建日程`}
                      disabled={loading || !data.statuses.length}
                      onClick={(e) => {
                        e.stopPropagation();
                        create(key);
                      }}
                    >
                      <Plus />
                    </button>
                  </div>
                  <div className="calendar-entries">
                    {items.slice(0, 3).map((event) => (
                      <button
                        key={event.id}
                        className={`calendar-entry event-entry ${event.startTime === null ? 'all-day' : ''} ${event.caseId ? 'case-event' : 'personal-event'}`}
                        aria-label={`${eventTime(event, key)} ${event.title}`}
                        title={`${eventRange(event)} · ${event.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(key);
                          setEditing(event);
                        }}
                      >
                        <i />
                        <time>{eventTime(event, key)}</time>
                        <span>{event.title}</span>
                      </button>
                    ))}
                    {due.slice(0, available).map((task) => (
                      <button
                        className="calendar-entry task-entry"
                        key={task.id}
                        title={`待办 · ${task.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(key);
                          setEditingTask(task);
                        }}
                      >
                        <Square />
                        <span>{task.title}</span>
                      </button>
                    ))}
                  </div>
                  {hidden > 0 && (
                    <button
                      className="calendar-more"
                      onClick={() => {
                        setSelected(key);
                        agenda.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      还有 {hidden} 项
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {(view === 'week' || view === 'day') && (
        <TimeGrid
          focusToday={focusToday + todayRequest}
          dates={view === 'day' ? [selected] : weekDates(selected)}
          selected={selected}
          events={events}
          tasks={datedTasks}
          disabled={loading || !data.statuses.length}
          onSelect={setSelected}
          onCreate={(date, minute) => create(date, minute, minute === undefined)}
          onEdit={setEditing}
          openCase={openCase}
          onTask={setEditingTask}
        />
      )}
      <section
        hidden={view !== 'month' && view !== 'agenda'}
        ref={agenda}
        className="day-agenda"
        aria-label="当天安排"
      >
        <header>
          <div>
            <h2>
              {view === 'agenda' ? '当天安排' : displayDate(selected)}
              {view !== 'agenda' && selected === today && <span>今天</span>}
            </h2>
            <p>
              {dayEvents.length + dayTasks.length
                ? `${dayEvents.length} 项日程 · ${dayTasks.length} 项待办`
                : '留一点时间，安排重要的事。'}
            </p>
          </div>
          <button
            className="agenda-add icon-button"
            aria-label="为所选日期添加日程"
            disabled={loading || !data.statuses.length}
            onClick={() => create(selected)}
          >
            <Plus />
          </button>
        </header>
        {dayEvents.map((event) => (
          <div className="agenda-event" key={event.id}>
            <div className="agenda-time">
              <span>{eventTime(event, selected)}</span>
              {event.startTime && (
                <small>{event.endDate === selected ? event.endTime : '跨日'}</small>
              )}
            </div>
            <button
              className={`agenda-event-main ${event.caseId ? 'case-event' : 'personal-event'}`}
              onClick={() => setEditing(event)}
            >
              <strong>{event.title}</strong>
              <span>
                {event.location ? (
                  <>
                    <MapPin />
                    {event.location}
                  </>
                ) : (
                  <>
                    <Clock3 />
                    {eventRange(event)}
                  </>
                )}
              </span>
            </button>
            {event.caseId ? (
              <button
                className="agenda-case-link"
                onClick={() => openCase(event.caseId!)}
                title={caseTitle(event.caseId)}
              >
                <Folder />
                <span>{caseTitle(event.caseId)}</span>
                <ChevronRight />
              </button>
            ) : (
              <span className="agenda-personal">未关联案件</span>
            )}
          </div>
        ))}
        {dayTasks.map((task) => (
          <div className="agenda-task" key={task.id}>
            {view === 'agenda' ? (
              <input
                type="checkbox"
                aria-label={`完成${task.title}`}
                checked={false}
                disabled={taskAction.busy}
                onChange={() =>
                  void taskAction.run(() => save('toggle_task', { id: task.id, completed: true }))
                }
              />
            ) : (
              <span className="agenda-time">待办</span>
            )}
            <button className="agenda-task-main" onClick={() => setEditingTask(task)}>
              <Square />
              <span>{task.title}</span>
            </button>
            <button
              className="agenda-case-link"
              onClick={() => openCase(task.caseId)}
              title={caseTitle(task.caseId)}
            >
              <Folder />
              <span>{caseTitle(task.caseId)}</span>
              <ChevronRight />
            </button>
          </div>
        ))}
        {!dayEvents.length && !dayTasks.length && (
          <p className="agenda-empty">
            {loading
              ? '正在读取本地日历…'
              : view === 'agenda'
                ? '当天暂无安排，可点击「新建日程」添加。'
                : '当天暂无安排。点击日期格中的 +，或双击空白处添加日程。'}
          </p>
        )}
      </section>
      {taskAction.error && (
        <p role="alert" className="error-message">
          {taskAction.error}
        </p>
      )}
      {filter !== 'events' && (
        <details className="undated-tasks">
          <summary>
            无日期待办 <span>{undated.length}</span>
          </summary>
          {undated.map((task) => (
            <button key={task.id} className="undated-task" onClick={() => setEditingTask(task)}>
              <Square />
              <span>{task.title}</span>
              <small>{caseTitle(task.caseId)}</small>
            </button>
          ))}
        </details>
      )}
      {editingTask && (
        <WorkTaskEditor
          task={editingTask}
          data={data}
          save={save}
          onClose={() => setEditingTask(null)}
        />
      )}
      {editing && (
        <EventEditor
          data={data}
          key={editing.id}
          event={editing}
          existing={data.calendarEvents.some((event) => event.id === editing.id)}
          cases={activeCases}
          save={save}
          onClose={() => setEditing(null)}
          onSaved={(date) => {
            select(date);
            setFilter('all');
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
