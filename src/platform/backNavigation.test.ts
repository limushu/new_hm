import { describe, expect, it, vi } from 'vitest';
import { BackNavigation } from './backNavigation';

describe('shared system back navigation', () => {
  it('dismisses the newest overlay before its case and root page', async () => {
    const back = new BackNavigation();
    const calls: string[] = [];
    back.register(() => {
      calls.push('root');
    }, 0);
    back.register(() => {
      calls.push('case');
    }, 20);
    const first = back.register(() => {
      calls.push('dialog');
    }, 100);
    const last = back.register(() => {
      calls.push('nested');
    }, 100);
    const menu = back.register(() => {
      calls.push('menu');
    }, 200);
    await back.request();
    menu();
    await back.request();
    last();
    await back.request();
    first();
    await back.request();
    expect(calls).toEqual(['menu', 'nested', 'dialog', 'case']);
  });

  it('removes hidden or unmounted handlers and delegates an unhandled root', async () => {
    const back = new BackNavigation();
    const removed = vi.fn();
    const remove = back.register(removed, 100);
    remove();
    remove();
    back.register(() => false);
    expect(await back.request()).toBe(false);
    expect(removed).not.toHaveBeenCalled();
  });

  it('coalesces repeated back presses while a save or dismissal is pending', async () => {
    const back = new BackNavigation();
    let finish!: () => void;
    const saving = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const handler = vi.fn(() => saving);
    back.register(handler, 20);
    const first = back.request();
    const next = back.request();
    expect(next).toBe(first);
    expect(handler).toHaveBeenCalledTimes(1);
    finish();
    expect(await first).toBe(true);
  });

  it('a failed handler cannot fall through to closing the application', async () => {
    const back = new BackNavigation();
    const root = vi.fn(() => false);
    back.register(root);
    const remove = back.register(() => {
      throw new Error('save failed');
    }, 20);
    await expect(back.request()).rejects.toThrow('save failed');
    expect(root).not.toHaveBeenCalled();
    remove();
    expect(await back.request()).toBe(false);
  });
});
