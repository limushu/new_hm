import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Square } from 'lucide-react';
import type { CalendarEvent, Task } from '../../domain/types';
import { dateKey, parseDate } from '../../domain/calendar';
import { eventRange, eventsOn } from './schedule';
import { clock, HOUR_HEIGHT, timeBlocks } from './timeline';

interface Props {
  dates: string[];
  selected: string;
  events: CalendarEvent[];
  tasks: Task[];
  disabled: boolean;
  onSelect: (date: string) => void;
  onCreate: (date: string, minute?: number) => void;
  onEdit: (event: CalendarEvent) => void;
  openCase: (id: string) => void;
  onTask?: (task: Task) => void;
  focusToday: number;
}

export default function TimeGrid({
  dates,
  selected,
  events,
  tasks,
  disabled,
  onSelect,
  onCreate,
  onEdit,
  openCase,
  onTask,
  focusToday,
}: Props) {
  const scroll = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  const first = dates[0];
  useEffect(() => {
    const current = new Date();
    const minute = dates.includes(dateKey(current))
      ? current.getHours() * 60 + current.getMinutes() - 120
      : 8 * 60 - 24;
    scroll.current?.scrollTo({ top: Math.max(0, (minute * HOUR_HEIGHT) / 60) });
  }, [first, dates.length, focusToday]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 10);
    };
    const resume = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        tick();
      }
    };
    tick();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, []);
  const today = dateKey(now);
  const zone =
    new Intl.DateTimeFormat('en', { timeZoneName: 'shortOffset' })
      .formatToParts(now)
      .find((part) => part.type === 'timeZoneName')?.value ?? '本地时间';
  return (
    <section
      className="time-grid"
      aria-label={dates.length === 1 ? '日时间表' : '周时间表'}
      style={{ '--day-count': dates.length } as CSSProperties}
    >
      <div className="time-scroll" ref={scroll}>
        <div className="time-grid-inner">
          <div className="time-sticky-header">
            <div className="time-date-header">
              <span className="time-zone">{zone}</span>
              {dates.map((date) => (
                <button
                  key={date}
                  className={`time-date ${date === today ? 'is-today' : ''} ${date === selected ? 'is-selected' : ''}`}
                  aria-label={`时间表选择 ${date}`}
                  onClick={() => onSelect(date)}
                >
                  <small>
                    {new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(parseDate(date))}
                  </small>
                  <strong>{parseDate(date).getDate()}</strong>
                </button>
              ))}
            </div>
            <div className="all-day-grid">
              <span className="time-axis-caption">
                全天
                <br />
                待办
              </span>
              {dates.map((date) => (
                <div className="all-day-cell" key={date} data-all-day={date}>
                  <div>
                    {eventsOn(events, date)
                      .filter((event) => event.startTime === null)
                      .map((event) => (
                        <button
                          className={`time-all-day ${event.caseId ? 'case-event' : 'personal-event'}`}
                          key={event.id}
                          title={eventRange(event)}
                          onClick={() => onEdit(event)}
                        >
                          {event.title}
                        </button>
                      ))}
                    {tasks
                      .filter((task) => task.dueDate === date)
                      .map((task) => (
                        <button
                          className="time-task"
                          key={task.id}
                          onClick={() => (onTask ? onTask(task) : openCase(task.caseId))}
                        >
                          <Square />
                          <span>{task.title}</span>
                        </button>
                      ))}
                  </div>
                  <button
                    className="all-day-create"
                    aria-label={`在 ${date} 添加全天日程`}
                    disabled={disabled}
                    onClick={() => onCreate(date)}
                  >
                    ＋
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="hour-grid">
            <div className="hour-labels">
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour} style={{ top: hour * HOUR_HEIGHT }}>
                  {clock(hour * 60)}
                </span>
              ))}
              {dates.includes(today) && (
                <div
                  className="time-now-label"
                  style={{ top: now.getHours() * 60 + now.getMinutes() }}
                  aria-hidden="true"
                >
                  {clock(now.getHours() * 60 + now.getMinutes())}
                </div>
              )}
            </div>
            {dates.map((date) => (
              <div className="time-column" data-time-date={date} key={date}>
                {Array.from({ length: 48 }, (_, index) => (
                  <button
                    key={index}
                    className="time-slot"
                    style={{ top: index * 30, height: 30 }}
                    disabled={disabled}
                    aria-label={`在 ${date} ${clock(index * 30)} 新建日程`}
                    onClick={() => onCreate(date, index * 30)}
                  />
                ))}
                {timeBlocks(events, date).map((block) => (
                  <button
                    key={block.event.id}
                    className={`time-event ${block.lanes > 1 ? 'is-overlapping' : ''} ${block.end - block.start < 60 ? 'is-short' : ''} ${block.event.caseId ? 'case-event' : 'personal-event'}`}
                    data-event-id={block.event.id}
                    data-lane={block.lane}
                    data-lanes={block.lanes}
                    style={{
                      top: block.start,
                      height: Math.max(20, block.end - block.start),
                      left: `calc(${(block.lane * 100) / block.lanes}% + 3px)`,
                      width: `calc(${100 / block.lanes}% - 6px)`,
                    }}
                    title={`${block.event.title} · ${eventRange(block.event)}`}
                    onClick={() => onEdit(block.event)}
                  >
                    <strong>{block.event.title}</strong>
                    {block.end - block.start >= 60 && (
                      <span>
                        {block.start === 0 && block.event.startDate < date
                          ? '前日延续'
                          : block.event.startTime}{' '}
                        – {block.end === 1440 ? '24:00' : block.event.endTime}
                      </span>
                    )}
                    {block.event.location && block.end - block.start >= 60 && (
                      <small>{block.event.location}</small>
                    )}
                  </button>
                ))}
                {date === today && (
                  <div
                    className="current-time-line"
                    style={{ top: now.getHours() * 60 + now.getMinutes() }}
                    aria-label={`当前时间 ${clock(now.getHours() * 60 + now.getMinutes())}`}
                  >
                    <i />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
