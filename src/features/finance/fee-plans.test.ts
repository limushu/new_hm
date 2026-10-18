import { afterEach, describe, expect, it, vi } from 'vitest';
import { planDue, planPaid } from './FeePlans';
import { emptyWorkspace, type FeePlan } from '../../domain/types';
const plan: FeePlan = {
  id: 'p',
  caseId: 'case',
  proceedingId: null,
  stageId: null,
  title: '约定款',
  amountCents: 1000000,
  dueDate: null,
  condition: '',
  ready: false,
};
afterEach(() => vi.useRealTimers());
describe('收费条件与实际收款', () => {
  it('未填写日期不推测到期，明确日期以本地当天为边界', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 18, 12));
    expect(planDue(plan)).toBe(false);
    expect(planDue({ ...plan, dueDate: '2026-10-17' })).toBe(true);
    expect(planDue({ ...plan, dueDate: '2026-10-18' })).toBe(true);
    expect(planDue({ ...plan, dueDate: '2026-10-19' })).toBe(false);
  });
  it('附加条件未确认不会仅凭日期算成到期，明确确认可独立成立', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 18, 12));
    expect(planDue({ ...plan, dueDate: '2026-10-17', condition: '交付报告后' })).toBe(false);
    expect(planDue({ ...plan, dueDate: '2026-10-19', condition: '交付报告后', ready: true })).toBe(
      true,
    );
  });
  it('只汇总本节点的明确核销，不拿其他收入或另一个节点代替', () => {
    const data = {
      ...emptyWorkspace,
      feeAllocations: [
        { planId: 'p', ledgerId: 'one', amountCents: 10001 },
        { planId: 'p', ledgerId: 'two', amountCents: 20002 },
        { planId: 'other', ledgerId: 'one', amountCents: 40000 },
      ],
    };
    expect(planPaid(data, 'p')).toBe(30003);
    expect(planPaid(data, 'unset')).toBe(0);
  });
});
