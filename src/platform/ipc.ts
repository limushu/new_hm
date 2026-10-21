import { invoke } from '@tauri-apps/api/core';
import { localizedError } from '../services/errors';

/** Keep machine fields for callers while ensuring String(error) is user-readable. */
export async function nativeInvoke<T>(
  name: string,
  args?: Parameters<typeof invoke>[1],
  options?: Parameters<typeof invoke>[2],
): Promise<T> {
  try {
    return await invoke<T>(name, args, options);
  } catch (error) {
    throw localizedError(error);
  }
}
