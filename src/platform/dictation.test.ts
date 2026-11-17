import { beforeEach, expect, it, vi } from 'vitest';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
import { DictationSession, appendDictation, dictationText } from './dictation';
beforeEach(() => invoke.mockReset());
it('editor cleanup waits for late microphone authorization and is idempotent', async () => {
  let authorize!: () => void;
  invoke.mockImplementation((name: string) =>
    name === 'start_dictation'
      ? new Promise<void>((resolve) => {
          authorize = resolve;
        })
      : Promise.resolve(),
  );
  const session = new DictationSession();
  const start = session.start();
  await vi.waitFor(() => expect(authorize).toBeTypeOf('function'));
  const cleanup = session.dispose();
  expect(session.dispose()).toBe(cleanup);
  expect(invoke.mock.calls.map(([name]) => name)).toEqual(['start_dictation']);
  authorize();
  await start;
  await cleanup;
  expect(invoke.mock.calls.map(([name]) => name)).toEqual(['start_dictation', 'discard_dictation']);
  expect(invoke.mock.calls[0][1].id).toBe(invoke.mock.calls[1][1].id);
  await expect(session.finish()).rejects.toThrow('已结束');
});
it('permission and cleanup failures can release or retry without starting another job', async () => {
  let disposals = 0;
  invoke.mockImplementation(async (name: string) => {
    if (name === 'start_dictation') throw { code: 'microphone_permission_denied' };
    if (name === 'discard_dictation' && ++disposals === 1) throw new Error('temporary');
  });
  const session = new DictationSession();
  await expect(session.start()).rejects.toThrow();
  await expect(session.dispose()).rejects.toThrow('temporary');
  await session.dispose();
  expect(disposals).toBe(2);
});
it('append preserves the latest text and refuses overflow without truncating a transcript', () => {
  expect(appendDictation('原有记录\n手动补充', '  识别内容。  ')).toBe(
    '原有记录\n手动补充\n\n识别内容。',
  );
  expect(appendDictation('原文', '录音', 5)).toBeNull();
  expect(appendDictation('原文', '  ', 5)).toBe('原文');
  expect(
    dictationText({
      phase: 'completed',
      totalSeconds: 2,
      completedSeconds: 2,
      segments: [{ startSeconds: 0, endSeconds: 1, text: '正文。' }],
      partial: { startSeconds: 1, endSeconds: 2, text: '后续。' },
      error: null,
    }),
  ).toBe('正文。\n后续。');
});
