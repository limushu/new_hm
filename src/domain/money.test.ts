import { describe, it, expect } from 'vitest';
import { cents, money } from './money';
describe('金额使用整数分', () => {
  it('逐笔分币累加没有浮点误差', () => {
    expect(Array.from({ length: 100 }, () => cents('0.01')).reduce((sum, v) => sum + v, 0)).toBe(
      100,
    );
    expect(cents('1234.56')).toBe(123456);
  });
  it('拒绝负数、超额、非金额和隐藏的小数舍入', () => {
    for (const input of ['-1', '0.001', '1e5', 'NaN', '10000000000.01', ''])
      expect(() => cents(input)).toThrow();
  });
  it('支持零约定费与两位小数显示', () => {
    expect(cents('0')).toBe(0);
    expect(money(123456)).toBe('1,234.56');
    expect(money(1)).toBe('0.01');
  });
});
