import { convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWebview, type DragDropEvent } from '@tauri-apps/api/webview';
import { nativeRuntime } from '../services/repository';

export const materialSource = (path: string) => (nativeRuntime ? convertFileSrc(path) : path);

export async function watchMaterialDrop(receive: (event: DragDropEvent) => void) {
  if (!nativeRuntime) return () => {};
  const stop = await getCurrentWebview().onDragDropEvent(({ payload }) => receive(payload));
  return () => {
    void Promise.resolve(stop()).catch(() => {});
  };
}
