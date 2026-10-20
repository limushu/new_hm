import { invoke } from '@tauri-apps/api/core';
import type { MaterialTarget } from '../domain/types';
import { jsonHeader } from '../services/headers';

export async function saveNativeRecording(target: MaterialTarget, name: string, data: Blob) {
  await invoke('save_recording', new Uint8Array(await data.arrayBuffer()), {
    headers: { 'x-hm-target': jsonHeader(target), 'x-hm-name': jsonHeader(name) },
  });
}
