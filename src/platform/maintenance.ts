import { watchNativeEvent } from './events';

export const watchMaintenance = (receive: (health: Record<string, string>) => void) =>
  watchNativeEvent('background-status', receive);
