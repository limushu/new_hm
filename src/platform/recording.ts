import { invoke } from '@tauri-apps/api/core';
import type { MaterialTarget } from '../domain/types';
import { jsonHeader } from '../services/headers';
import { nativeRuntime } from '../services/repository';

export interface RecordingProduct {
  name: string;
  blob?: Blob;
  archive(target: MaterialTarget, name: string): Promise<void>;
}
export interface RecordingCapture {
  canPause: boolean;
  pause(): Promise<void>;
  resume(): Promise<void>;
  finish(): Promise<RecordingProduct>;
  dispose(): Promise<void>;
}

export async function saveNativeRecording(target: MaterialTarget, name: string, data: Blob) {
  await invoke('save_recording', new Uint8Array(await data.arrayBuffer()), {
    headers: { 'x-hm-target': jsonHeader(target), 'x-hm-name': jsonHeader(name) },
  });
}

/** Native driver selection is supplied by Rust. WebView is an explicit legacy backend. */
export async function startRecording(
  onError: (message: string) => void,
): Promise<RecordingCapture> {
  if (nativeRuntime) {
    const backends = await invoke<{
      native: { capture: boolean; pause: boolean };
      webviewFallback: boolean;
    }>('native_recording_support');
    if (backends.native.capture) {
      await invoke('start_native_recording');
      let archived = false;
      return {
        canPause: backends.native.pause,
        pause: () => invoke('pause_native_recording'),
        resume: () => invoke('resume_native_recording'),
        async finish() {
          const name = await invoke<string>('finish_native_recording');
          return {
            name,
            async archive(target, name) {
              if (archived) return;
              await invoke('archive_native_recording', { target, name });
              archived = true;
            },
          };
        },
        async dispose() {
          if (!archived) await invoke('cancel_native_recording');
        },
      };
    }
    if (!backends.webviewFallback) throw new Error('当前平台尚未接入录音驱动');
  }
  const { startWebviewRecording } = await import('./recording-webview');
  return startWebviewRecording(onError);
}
