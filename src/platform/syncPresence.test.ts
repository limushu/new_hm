import { describe, expect, it, vi } from 'vitest';
import { createSyncPresence } from './syncPresence';

describe('foreground synchronization', () => {
  it('serializes slow updates and samples the latest visibility when they execute', async () => {
    let hint = false;
    let finish!: (value: boolean) => void;
    const send = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementation(async (value: boolean) => value);
    const refresh = createSyncPresence(send, () => hint);
    const background = refresh();
    await Promise.resolve();
    const resume = refresh();
    hint = true;
    expect(send).toHaveBeenCalledTimes(1);
    finish(false);
    expect(await background).toBe(false);
    expect(await resume).toBe(true);
    expect(send.mock.calls).toEqual([[false], [true]]);
  });
  it('returns native truth over a stale hint and allows retry after a failed probe', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('host unavailable'))
      .mockResolvedValue(true);
    const refresh = createSyncPresence(send, () => false);
    await expect(refresh()).rejects.toThrow('host unavailable');
    await expect(refresh()).resolves.toBe(true);
    expect(send.mock.calls).toEqual([[false], [false]]);
  });
});
