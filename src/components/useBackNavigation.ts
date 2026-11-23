import { useEffect, useRef } from 'react';
import { backNavigation } from '../platform/backNavigation';

export function useBackNavigation(
  handler: () => boolean | void | Promise<boolean | void>,
  priority = 0,
  enabled = true,
) {
  const current = useRef(handler);
  current.current = handler;
  useEffect(
    () => (enabled ? backNavigation.register(() => current.current(), priority) : undefined),
    [priority, enabled],
  );
}
