import { invoke } from '@tauri-apps/api/core';
import { nativeRuntime, previewMode } from '../services/repository';

export async function syncWindowTheme(theme: 'dark' | 'light' | 'system') {
  if (nativeRuntime && !previewMode) await invoke('set_window_theme', { theme });
}
