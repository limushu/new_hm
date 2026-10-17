import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { dateKey, monthDays } from '../../domain/calendar';
import type { Workspace } from '../../domain/types';

export default function Calendar({
  data,
  openCase,
  newCase,
  findCases,
}: {
  data: Workspace;
  openCase: (id: string) => void;
  newCase: () => void;
  findCases: () => void;
}) {
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(() => dateKey(new Date()));
  const active = new Set(data.cases.filter((c) => !c.deletedAt).map((c) => c.id));
  const tasks = data.tasks.filter((t) => !t.completed && active.has(t.caseId));
  function changeMonth(offset: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1, 12));
  }
  return (
    <div className="calendar-page">
      <header>
        <h1>
          {month.getFullYear()}年{month.getMonth() + 1}月
        </h1>
        <button className="icon-button" aria-label="上个月" onClick={() => changeMonth(-1)}>
          <ChevronLeft />
        </button>
        <button className="icon-button" aria-label="下个月" onClick={() => changeMonth(1)}>
          <ChevronRight />
        </button>
        <button
          onClick={() => {
            setMonth(new Date());
            setSelected(dateKey(new Date()));
          }}
        >
          今天
        </button>
        <div className="calendar-actions">
          <button onClick={findCases}>
            <Search />
            查找案件
          </button>
          <button disabled={!data.statuses.length} onClick={newCase}>
            <Plus />
            新建案件
          </button>
        </div>
      </header>
      <div className="weekdays">
        {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
          <span key={d}>周{d}</span>
        ))}
      </div>
      <div className="month-grid">
        {monthDays(month.getFullYear(), month.getMonth()).map((date) => {
          const key = dateKey(date),
            items = tasks.filter((t) => t.dueDate === key);
          return (
            <button
              className={`calendar-day ${date.getMonth() !== month.getMonth() ? 'outside' : ''} ${selected === key ? 'selected' : ''}`}
              key={key}
              onClick={() => setSelected(key)}
            >
              <span className={key === dateKey(new Date()) ? 'today-number' : ''}>
                {date.getDate()}
              </span>
              {items.slice(0, 2).map((t) => (
                <small key={t.id}>{t.title}</small>
              ))}
              {items.length > 2 && <small>还有 {items.length - 2} 项</small>}
            </button>
          );
        })}
      </div>
      <section className="day-agenda">
        <h3>{selected} 的待办</h3>
        {tasks
          .filter((t) => t.dueDate === selected)
          .map((t) => (
            <button key={t.id} className="agenda-item" onClick={() => openCase(t.caseId)}>
              <span>{t.title}</span>
              <small>{data.cases.find((c) => c.id === t.caseId)?.title}</small>
            </button>
          ))}
        {!tasks.some((t) => t.dueDate === selected) && <p className="empty-text">当天暂无待办。</p>}
      </section>
      <details className="undated-tasks">
        <summary>无日期待办 · {tasks.filter((t) => !t.dueDate).length}</summary>
        {tasks
          .filter((t) => !t.dueDate)
          .map((t) => (
            <button key={t.id} className="agenda-item" onClick={() => openCase(t.caseId)}>
              {t.title}
            </button>
          ))}
      </details>
    </div>
  );
}
