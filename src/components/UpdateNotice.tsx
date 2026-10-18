import { useEffect, useState } from 'react';
import { ArrowDownToLine } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { command, desktopRuntime } from '../services/repository';
import type { Commands } from '../domain/types';
type Info = Commands['get_update_status']['result'];
export default function UpdateNotice({ onOpen }: { onOpen: () => void }) {
  const [update, setUpdate] = useState<Info>(null);
  useEffect(() => {
    let canceled = false;
    let eventSeen = false;
    let stop: (() => void) | undefined;
    if (desktopRuntime)
      void listen<Info>('update-available', (e) => {
        eventSeen = true;
        if (!canceled) setUpdate(e.payload);
      })
        .then((unlisten) => {
          if (canceled) unlisten();
          else stop = unlisten;
        })
        .catch(() => {});
    void command('get_update_status', {})
      .then((info) => {
        if (!canceled && !eventSeen) setUpdate(info);
      })
      .catch(() => {});
    return () => {
      canceled = true;
      stop?.();
    };
  }, []);
  if (!update) return null;
  return (
    <button className="sidebar-update" onClick={onOpen} aria-label={`更新案笺到 ${update.version}`}>
      <ArrowDownToLine />
      <span>
        发现新版本<small>案笺 {update.version} · 查看更新</small>
      </span>
    </button>
  );
}
