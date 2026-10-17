import type { CalendarEvent, Workspace } from '../../domain/types';

export function occursOn(event: CalendarEvent, date: string): boolean {
  return (
    event.startDate <= date &&
    event.endDate >= date &&
    !(event.startTime !== null && event.endTime === '00:00' && event.endDate === date)
  );
}

export function visibleEvents(data: Workspace): CalendarEvent[] {
  const active = new Set(data.cases.filter((item) => !item.deletedAt).map((item) => item.id));
  return data.calendarEvents.filter((event) => !event.caseId || active.has(event.caseId));
}

export function eventsOn(events: CalendarEvent[], date: string): CalendarEvent[] {
  return events
    .filter((event) => occursOn(event, date))
    .sort(
      (left, right) =>
        (left.startTime ? 1 : 0) - (right.startTime ? 1 : 0) ||
        (left.startDate < date ? '' : (left.startTime ?? '')).localeCompare(
          right.startDate < date ? '' : (right.startTime ?? ''),
        ) ||
        left.title.localeCompare(right.title, 'zh-CN') ||
        left.id.localeCompare(right.id),
    );
}

export function eventTime(event: CalendarEvent, date: string): string {
  if (event.startTime === null) return '全天';
  return event.startDate < date ? '延续' : event.startTime;
}

export function eventRange(event: CalendarEvent): string {
  if (event.startTime === null)
    return event.startDate === event.endDate
      ? '全天'
      : `${event.startDate} 至 ${event.endDate} · 全天`;
  return event.startDate === event.endDate
    ? `${event.startTime} – ${event.endTime}`
    : `${event.startDate} ${event.startTime} 至 ${event.endDate} ${event.endTime}`;
}

export function displayDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date(year, month - 1, day, 12));
}

export function emptyEvent(date: string): CalendarEvent {
  return {
    id: crypto.randomUUID(),
    title: '',
    startDate: date,
    endDate: date,
    startTime: '09:00',
    endTime: '09:30',
    caseId: null,
    location: '',
    notes: '',
  };
}

export function validateEvent(event: CalendarEvent): string | null {
  if (!event.title.trim()) return '请输入日程名称';
  if (!event.startDate || !event.endDate || event.endDate < event.startDate)
    return '结束日期不能早于开始日期';
  if (
    event.startTime !== null &&
    (!event.startTime ||
      !event.endTime ||
      (event.startDate === event.endDate && event.endTime <= event.startTime))
  )
    return '结束时间必须晚于开始时间';
  return null;
}
