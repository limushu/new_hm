import { describe, expect, it } from 'vitest';
import { shiftDate, weekDates } from '../../domain/calendar';
import { emptyEvent } from './schedule';
import { slotEvent, timeBlocks } from './timeline';

describe('周时间表', () => {
  it('跨年周从周一开始，日期切换不会以 UTC 截断', () => {
    expect(weekDates('2027-01-01')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('重叠安排并排，边界相接不冲突，结束后的安排恢复整列宽度', () => {
    const make = (id: string, startTime: string, endTime: string) => ({
      ...emptyEvent('2026-10-17'),
      id,
      title: id,
      startTime,
      endTime,
    });
    const blocks = timeBlocks(
      [make('a', '09:00', '10:00'), make('b', '09:30', '10:30'), make('c', '10:30', '11:30')],
      '2026-10-17',
    );
    expect(blocks.map((block) => [block.event.id, block.lane, block.lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 1],
    ]);
  });
  it('跨日定时日程分段，零点结束不会出现在下一天', () => {
    const event = {
      ...emptyEvent('2026-10-17'),
      startTime: '23:00',
      endDate: '2026-10-18',
      endTime: '01:00',
    };
    expect(timeBlocks([event], '2026-10-17')[0]).toMatchObject({ start: 1380, end: 1440 });
    expect(timeBlocks([event], '2026-10-18')[0]).toMatchObject({ start: 0, end: 60 });
    expect(timeBlocks([{ ...event, endTime: '00:00' }], '2026-10-18')).toHaveLength(0);
  });
  it('从空闲时间创建日程始终不预选案件，午夜自动跨日', () => {
    expect(slotEvent('2026-10-17', 570)).toMatchObject({
      startTime: '09:30',
      endTime: '10:00',
      endDate: '2026-10-17',
      caseId: null,
    });
    const event = slotEvent('2026-12-31', 1410);
    expect(event.caseId).toBeNull();
    expect(event).toMatchObject({
      startDate: '2026-12-31',
      startTime: '23:30',
      endDate: '2027-01-01',
      endTime: '00:00',
    });
  });
});
