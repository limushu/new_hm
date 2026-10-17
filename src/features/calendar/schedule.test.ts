import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../../domain/types';
import { emptyWorkspace } from '../../domain/types';
import { emptyEvent, eventsOn, occursOn, validateEvent, visibleEvents } from './schedule';

const event = (patch: Partial<CalendarEvent> = {}): CalendarEvent => ({
  ...emptyEvent('2026-10-17'),
  title: '日程',
  ...patch,
});

describe('日程日期与排序', () => {
  it('全天跨月包含结束日，定时日程在结束日零点不多占一天', () => {
    const allDay = event({
      startDate: '2026-10-31',
      endDate: '2026-11-02',
      startTime: null,
      endTime: null,
    });
    expect(occursOn(allDay, '2026-11-02')).toBe(true);
    expect(occursOn(allDay, '2026-11-03')).toBe(false);
    const overnight = event({ startTime: '23:00', endDate: '2026-10-18', endTime: '00:00' });
    expect(occursOn(overnight, '2026-10-17')).toBe(true);
    expect(occursOn(overnight, '2026-10-18')).toBe(false);
  });
  it('先展示全天，再按时间排序，跨日延续排在当天新安排前', () => {
    const afternoon = event({ id: 'pm', startTime: '14:00', endTime: '15:00' });
    const morning = event({ id: 'am' });
    const ongoing = event({
      id: 'ongoing',
      startDate: '2026-10-16',
      startTime: '23:00',
      endTime: '08:00',
    });
    const allDay = event({ id: 'all', startTime: null, endTime: null });
    expect(
      eventsOn([afternoon, morning, ongoing, allDay], '2026-10-17').map((item) => item.id),
    ).toEqual(['all', 'ongoing', 'am', 'pm']);
  });
  it('个人日程不依赖案件，回收站案件日程不混入当前日历', () => {
    const personal = event({ id: 'personal' });
    const linked = event({ id: 'linked', caseId: 'missing-or-trashed' });
    expect(visibleEvents({ ...emptyWorkspace, calendarEvents: [personal, linked] })).toEqual([
      personal,
    ]);
  });
  it('当天结束时间不得早于开始，跨日和全天允许独立日期区间', () => {
    expect(validateEvent(event({ endTime: '08:00' }))).toBe('结束时间必须晚于开始时间');
    expect(validateEvent(event({ endDate: '2026-10-18', endTime: '08:00' }))).toBeNull();
    expect(validateEvent(event({ startTime: null, endTime: null }))).toBeNull();
    expect(validateEvent(event({ endDate: '2026-10-16' }))).toBeTruthy();
  });
});
