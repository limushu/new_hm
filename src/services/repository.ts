import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Commands } from '../domain/types';

export const nativeRuntime = isTauri();
export const previewMode =
  import.meta.env.DEV && new URLSearchParams(location.search).has('preview');

export async function command<K extends keyof Commands>(
  name: K,
  args: Commands[K]['args'],
): Promise<Commands[K]['result']> {
  if (nativeRuntime) return invoke<Commands[K]['result']>(name, args);
  if (previewMode) {
    const { previewCommand } = await import('./preview');
    return previewCommand(name, args);
  }
  throw new Error(
    '请通过桌面应用启动。开发者可运行 npm run desktop:dev；浏览器界面预览使用 ?preview=1。',
  );
}
