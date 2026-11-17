import { invoke } from '@tauri-apps/api/core';
import { localizedError } from '../services/errors';
import { beginBusinessRequest, isBusinessMutation, workspaceChanged } from './syncActivity';

/** Keep machine fields for callers while ensuring String(error) is user-readable. */
export async function nativeInvoke<T>(
  name: string,
  args?: Parameters<typeof invoke>[1],
  options?: Parameters<typeof invoke>[2],
): Promise<T> {
  const mutation = isBusinessMutation(name);
  const finish = mutation ? beginBusinessRequest() : () => {};
  try {
    const result = await invoke<T>(name, args, options);
    if (mutation && typeof window !== 'undefined')
      window.dispatchEvent(new Event(workspaceChanged));
    return result;
  } catch (error) {
    throw localizedError(error);
  } finally {
    finish();
  }
}
