import { describe, expect, it } from 'vitest';
import { dateKey, monthDays } from './calendar';

describe('本地日期与月历', () => {
  it('使用本地日期而不是 UTC 截断，避免午夜显示到前一天', () => {
    const date = new Date(2026, 9, 17, 0, 5);
    expect(dateKey(date)).toBe('2026-10-17');
  });
  it('闰年二月完整覆盖，月历从周一开始且不重复日期', () => {
    const days = monthDays(2024, 1);
    expect(days[0].getDay()).toBe(1);
    expect(days.length % 7).toBe(0);
    expect(days.filter((d) => d.getMonth() === 1)).toHaveLength(29);
    expect(new Set(days.map(dateKey)).size).toBe(days.length);
  });
  it('跨年周正确显示上年日期，六周月份不会截断', () => {
    const january = monthDays(2027, 0);
    expect(dateKey(january[0])).toBe('2026-12-28');
    const august = monthDays(2026, 7);
    expect(august).toHaveLength(42);
    expect(august.some((d) => dateKey(d) === '2026-08-31')).toBe(true);
  });
});
