import { expect, test, vi } from 'vitest';
import { createCaseHeaderQueue } from './caseHeaderQueue';
import type { CaseHeader, CaseInput } from './types';

const initial: CaseInput = {
  id: 'one',
  title: '已保存名称',
  caseType: 'civil',
  statusId: 'in_progress',
  tags: [],
};
const receipt = (input: CaseInput): CaseHeader => ({
  item: { ...input, currentProceedingId: null, createdAt: '', updatedAt: '', deletedAt: null },
  tags: (input.tags ?? []).map((tag) => ({ caseId: input.id, tag })),
  tagCatalog: input.tags ?? [],
});

test('rapid tag/status edits are serialized against receipts and retain the latest intent', async () => {
  const write = vi.fn(async (input: CaseInput) => receipt(input));
  const queue = createCaseHeaderQueue(initial, write);
  const requests = [
    queue.enqueue({ tags: ['证据'] }),
    queue.enqueue({ statusId: 'closed' }),
    queue.enqueue({ tags: ['证据', '待归档'] }),
  ];
  queue.rebase(initial);
  await Promise.all(requests);
  expect(write.mock.calls.map(([input]) => input)).toEqual([
    { ...initial, tags: ['证据'] },
    { ...initial, tags: ['证据'], statusId: 'closed' },
    { ...initial, tags: ['证据', '待归档'], statusId: 'closed' },
  ]);
  expect(queue.snapshot()).toMatchObject({
    title: initial.title,
    tags: ['证据', '待归档'],
    statusId: 'closed',
  });
  expect(await queue.settled()).toBe(true);
});

test('failed edits do not poison a later unrelated save and can be retried', async () => {
  const write = vi.fn(async (input: CaseInput) => {
    if (input.statusId === 'closed') throw new Error('写入失败');
    return receipt(input);
  });
  const queue = createCaseHeaderQueue(initial, write);
  const failed = queue.enqueue({ statusId: 'closed' });
  const next = queue.enqueue({ tags: ['有效标签'] });
  await expect(failed).rejects.toThrow('写入失败');
  await next;
  expect(write.mock.calls[1][0]).toEqual({ ...initial, tags: ['有效标签'] });
  expect(queue.snapshot().statusId).toBe('in_progress');
  write.mockImplementation(async (input) => receipt(input));
  await queue.enqueue({ statusId: 'closed' });
  expect(queue.snapshot()).toMatchObject({ statusId: 'closed', tags: ['有效标签'] });
});

test('only an explicit title patch commits the name; idle queues accept authoritative refreshes', async () => {
  const queue = createCaseHeaderQueue(initial, async (input) => receipt(input));
  await queue.enqueue({ title: '确认后的名称' });
  await queue.enqueue({ tags: ['保留名称'] });
  expect(queue.snapshot().title).toBe('确认后的名称');
  queue.rebase({ ...initial, title: '外部刷新后的名称' });
  await queue.enqueue({ statusId: 'closed' });
  expect(queue.snapshot().title).toBe('外部刷新后的名称');
});
