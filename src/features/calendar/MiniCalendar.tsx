import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dateKey, monthDays, parseDate } from '../../domain/calendar';
import './timeline.css';

export default function MiniCalendar({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (date: string) => void;
}) {
  const [month, setMonth] = useState(() => parseDate(selected));
  useEffect(() => {
    setMonth(parseDate(selected));
  }, [selected]);
  const today = dateKey(new Date());
  return (
    <section className="calendar-sidebar" aria-label="小月历">
      <header>
        <span>
          {month.getFullYear()}年{month.getMonth() + 1}月
        </span>
        <button
          className="icon-button"
          aria-label="小月历上个月"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))}
        >
          <ChevronLeft />
        </button>
        <button
          className="icon-button"
          aria-label="小月历下个月"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))}
        >
          <ChevronRight />
        </button>
      </header>
      <div className="mini-weekdays">
        {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="mini-month">
        {monthDays(month.getFullYear(), month.getMonth()).map((date) => {
          const key = dateKey(date);
          return (
            <button
              key={key}
              aria-label={`跳转到 ${key}`}
              aria-pressed={selected === key}
              className={`${key === today ? 'mini-today' : ''} ${date.getMonth() !== month.getMonth() ? 'mini-outside' : ''}`}
              onClick={() => onSelect(key)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span>日历内容</span>
        <p>
          <i className="schedule-color" />
          日程
        </p>
        <p>
          <i className="task-color" />
          案件待办
        </p>
      </div>
    </section>
  );
}
