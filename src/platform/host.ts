import { nativeInvoke as invoke } from './ipc';
import { nativeRuntime, previewMode } from '../services/repository';

export async function syncWindowTheme(theme: 'dark' | 'light' | 'system') {
  if (nativeRuntime && !previewMode) await invoke('set_window_theme', { theme });
}
