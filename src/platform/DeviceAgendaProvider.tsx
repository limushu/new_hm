import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
  type ReactNode,
} from 'react';
import { command, nativeRuntime } from '../services/repository';
import type { Commands } from '../domain/types';
import type { AgendaStatus, DeviceAuthorization } from '../domain/agenda';
import { watchNativeEvent } from './events';
import { observeForeground } from './lifecycle';
import { useSubsystems } from './SubsystemProvider';
import { supports } from './subsystems';

type ContextValue = {
  status: AgendaStatus | null;
  refresh: () => Promise<void>;
  afterSave: (name: keyof Commands, args: unknown) => Promise<void>;
  requestNotifications: () => Promise<DeviceAuthorization>;
};
const Context = createContext<ContextValue>({
  status: null,
  refresh: async () => {},
  afterSave: async () => {},
  requestNotifications: async () => 'unavailable',
});
const Actions = createContext<Pick<ContextValue, 'refresh' | 'afterSave' | 'requestNotifications'>>(
  {
    refresh: async () => {},
    afterSave: async () => {},
    requestNotifications: async () => 'unavailable',
  },
);
export const useDeviceAgendaActions = () => useContext(Actions);
export const useDeviceAgenda = () => useContext(Context);
export default function DeviceAgendaProvider({ children }: { children: ReactNode }) {
  const { manifest } = useSubsystems();
  const installed =
    supports(manifest, 'system-notifications') || supports(manifest, 'system-calendar');
  const [status, setStatus] = useState<AgendaStatus | null>(null);
  const current = useRef(status);
  current.current = status;
  const [notice, setNotice] = useState('');
  const refresh = useCallback(async () => {
    if (!installed) return;
    const snapshot = await command('agenda_refresh', {});
    if (snapshot) setStatus(snapshot);
  }, [installed]);
  const requestNotifications = useCallback(async () => {
    const permission = await command('agenda_request_notifications', {});
    await refresh();
    return permission;
  }, [refresh]);
  const afterSave = useCallback(
    async (name: keyof Commands, args: unknown) => {
      if (!installed || !['save_calendar_event', 'save_work_event'].includes(name)) return;
      const event = (args as { input?: { reminderMinutes?: number | null } }).input;
      if (event?.reminderMinutes == null) return;
      try {
        const permission = current.current?.notifications.authorization;
        if (permission === 'not-determined') {
          if ((await requestNotifications()) !== 'granted')
            setNotice('日程已保存，系统提醒未开启。可在设置中允许通知。');
        } else if (permission !== 'granted')
          setNotice('日程已保存，系统提醒未开启。可在设置中允许通知。');
      } catch {
        setNotice('日程已保存，系统提醒暂未开启。可在设置中重试。');
      }
    },
    [installed, requestNotifications],
  );
  useEffect(() => {
    if (!installed) return;
    let active = true;
    let stopEvent: (() => void) | undefined;
    let stopForeground = () => {};
    void Promise.resolve().then(async () => {
      if (!active) return;
      if (nativeRuntime) {
        try {
          const stop = await watchNativeEvent<AgendaStatus>('agenda-status', (value) => {
            if (active) setStatus(value);
          });
          if (!active) {
            stop();
            return;
          }
          stopEvent = stop;
        } catch {
          /* Runtime without an event bridge can still refresh snapshots. */
        }
      }
      if (active)
        stopForeground = observeForeground(() => {
          void refresh().catch(() => {});
        });
    });
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh().catch(() => {});
    }, 60000);
    return () => {
      active = false;
      stopEvent?.();
      stopForeground();
      clearInterval(timer);
    };
  }, [installed, refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 8000);
    return () => clearTimeout(timer);
  }, [notice]);
  const actions = useMemo(
    () => ({ refresh, afterSave, requestNotifications }),
    [refresh, afterSave, requestNotifications],
  );
  return (
    <Actions.Provider value={actions}>
      <Context.Provider value={{ status, refresh, afterSave, requestNotifications }}>
        {children}
        {notice && (
          <div role="status" className="device-agenda-notice">
            {notice}
            <button type="button" aria-label="关闭提醒提示" onClick={() => setNotice('')}>
              关闭
            </button>
          </div>
        )}
      </Context.Provider>
    </Actions.Provider>
  );
}
