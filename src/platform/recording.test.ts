import { beforeEach, expect, it, vi } from 'vitest';
const { invoke, fallback } = vi.hoisted(() => ({
  invoke: vi.fn(),
  fallback: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('../services/repository', () => ({ nativeRuntime: true }));
vi.mock('./recording-webview', () => ({ startWebviewRecording: fallback }));
import { startRecording } from './recording';

beforeEach(() => {
  invoke.mockReset();
  fallback.mockReset();
});

it('原生驱动归档失败可重试，刷新失败重试不会重复归档，不使用浏览器录音', async () => {
  let archiveAttempts = 0;
  invoke.mockImplementation(async (name: string) => {
    if (name === 'native_recording_support')
      return { native: { capture: true, pause: true }, webviewFallback: true };
    if (name === 'finish_native_recording') return '录音.m4a';
    if (name === 'archive_native_recording' && ++archiveAttempts === 1)
      throw new Error('归档暂时失败');
  });
  const capture = await startRecording(vi.fn());
  await capture.pause();
  await capture.resume();
  const product = await capture.finish();
  expect(product.name).toBe('录音.m4a');
  expect(product.blob).toBeUndefined();
  const target = { caseId: 'case', proceedingId: null, parentId: null, recordId: null };
  await expect(product.archive(target, product.name)).rejects.toThrow('归档暂时失败');
  await product.archive(target, product.name);
  await product.archive(target, product.name);
  await capture.dispose();
  expect(archiveAttempts).toBe(2);
  expect(invoke.mock.calls.map(([name]) => name)).not.toContain('cancel_native_recording');
  expect(fallback).not.toHaveBeenCalled();
});

it('驱动查询失败或未接入时拒绝录音，不静默切换到浏览器', async () => {
  invoke.mockRejectedValueOnce(new Error('IPC unavailable'));
  await expect(startRecording(vi.fn())).rejects.toThrow('IPC unavailable');
  invoke.mockResolvedValueOnce({
    native: { capture: false, pause: false },
    webviewFallback: false,
  });
  await expect(startRecording(vi.fn())).rejects.toThrow('尚未接入录音驱动');
  expect(fallback).not.toHaveBeenCalled();
});

it('仅显式允许时启用旧 WebView 驱动', async () => {
  invoke.mockResolvedValueOnce({
    native: { capture: false, pause: false },
    webviewFallback: true,
  });
  const compatible = { canPause: true };
  fallback.mockResolvedValueOnce(compatible);
  expect(await startRecording(vi.fn())).toBe(compatible);
});
