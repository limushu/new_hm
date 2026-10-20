import { getCurrentWindow } from '@tauri-apps/api/window';
import { nativeRuntime, previewMode } from '../services/repository';

export async function syncWindowTheme(theme: 'dark' | 'light' | 'system') {
  if (nativeRuntime && !previewMode)
    await getCurrentWindow().setTheme(theme === 'system' ? null : theme);
}
