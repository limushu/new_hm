import { listen } from '@tauri-apps/api/event';
import { nativeRuntime } from '../services/repository';

export async function watchNativeEvent<T>(event: string, receive: (value: T) => void) {
  if (!nativeRuntime) return () => {};
  const stop = await listen<T>(event, ({ payload }) => receive(payload));
  return () => {
    void Promise.resolve(stop()).catch(() => {});
  };
}
