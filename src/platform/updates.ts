import type { Commands } from '../domain/types';
import { watchNativeEvent } from './events';

export const watchUpdates = (receive: (info: Commands['get_update_status']['result']) => void) =>
  watchNativeEvent('update-available', receive);

export const watchUpdateProgress = (
  receive: (progress: { downloaded: number; total: number | null }) => void,
) => watchNativeEvent('update-progress', receive);
