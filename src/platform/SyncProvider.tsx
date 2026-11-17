import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { command, nativeRuntime } from '../services/repository';
import type { SyncStatus } from '../domain/sync';
import { canApplyIncoming, freezeWorkspace, workspaceChanged } from './syncActivity';

type Workspace = { blocked: () => boolean; applied: () => Promise<void> };
const Context = createContext<{
  status: SyncStatus | null;
  refresh: () => Promise<void>;
  register: (workspace: Workspace) => () => void;
}>({ status: null, refresh: async () => {}, register: () => () => {} });
export const useCloudSync = () => useContext(Context);
export default function SyncProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const current = useRef(status);
  current.current = status;
  const workspace = useRef<Workspace | null>(null);
  const running = useRef(false);
  const refresh = useCallback(async () => {
    setStatus(await command('sync_status', {}));
  }, []);
  const register = useCallback((value: Workspace) => {
    workspace.current = value;
    return () => {
      if (workspace.current === value) workspace.current = null;
    };
  }, []);
  useEffect(() => {
    if (!nativeRuntime) return;
    let active = true;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    async function pump() {
      if (!active || running.current || document.visibilityState === 'hidden') return;
      running.current = true;
      try {
        let next = await command('sync_status', {});
        if (!active) return;
        setStatus(next);
        if (!next.enabled || !next.configured) return;
        if (
          next.incoming &&
          workspace.current &&
          !workspace.current.blocked() &&
          canApplyIncoming(document)
        ) {
          const thaw = freezeWorkspace(document);
          try {
            next = await command('sync_apply_pending', { token: next.incoming.token });
            if (next.phase === 'synced') await workspace.current.applied();
          } finally {
            thaw();
          }
        } else if (!next.conflict && !next.incoming) {
          next = await command('sync_tick', {});
        }
        if (active) setStatus(next);
      } catch {
        // Stable error codes are displayed in Settings; offline use continues.
        if (active) {
          try {
            setStatus(await command('sync_status', {}));
          } catch {
            /* retry on next foreground tick */
          }
        }
      } finally {
        running.current = false;
      }
    }
    const schedule = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void pump(), 1200);
    };
    const presence = () => {
      const foreground = document.visibilityState !== 'hidden';
      void command('sync_presence', { foreground })
        .then(() => {
          if (foreground) schedule();
        })
        .catch(() => {});
    };
    presence();
    const interval = setInterval(() => void pump(), 15000);
    const applyInterval = setInterval(() => {
      if (current.current?.incoming) void pump();
    }, 1500);
    window.addEventListener(workspaceChanged, schedule);
    document.addEventListener('visibilitychange', presence);
    window.addEventListener('online', schedule);
    return () => {
      active = false;
      clearTimeout(debounce);
      clearInterval(interval);
      clearInterval(applyInterval);
      window.removeEventListener(workspaceChanged, schedule);
      document.removeEventListener('visibilitychange', presence);
      window.removeEventListener('online', schedule);
    };
  }, []);
  return <Context.Provider value={{ status, refresh, register }}>{children}</Context.Provider>;
}
