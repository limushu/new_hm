import { useEffect, useState } from 'react';
import { ArrowDownToLine } from 'lucide-react';
import { watchUpdates } from '../platform/updates';
import { createPortal } from 'react-dom';
import { command, nativeRuntime } from '../services/repository';
import type { Commands } from '../domain/types';
import UpdateDialog from './UpdateDialog';
import { useSubsystems } from '../platform/SubsystemProvider';
import { supports } from '../platform/subsystems';
type Info = Commands['get_update_status']['result'];
export default function UpdateNotice() {
  const { manifest } = useSubsystems();
  const enabled = supports(manifest, 'signed-updates');
  const [update, setUpdate] = useState<Info>(null);
  const [selected, setSelected] = useState<Info>(null);
  useEffect(() => {
    if (!enabled) return;
    let canceled = false;
    let eventSeen = false;
    let stop: (() => void) | undefined;
    void (async () => {
      if (nativeRuntime) {
        try {
          const unlisten = await watchUpdates((info) => {
            eventSeen = true;
            if (!canceled) setUpdate(info);
          });
          if (canceled) unlisten();
          else stop = unlisten;
        } catch {
          // A snapshot can still recover a previously discovered update.
        }
      }
      if (canceled) return;
      // Subscribe first, then reconcile. Events discovered before capability
      // negotiation are persisted by the native updater and recovered here.
      const info = await command('get_update_status', {});
      if (!canceled && !eventSeen) setUpdate(info);
    })().catch(() => {});
    return () => {
      canceled = true;
      stop?.();
    };
  }, [enabled]);
  if (!enabled || (!update && !selected)) return null;
  return (
    <div className="update-notice-slot">
      {update &&
        createPortal(
          <button
            className="sidebar-update"
            onClick={() => setSelected(update)}
            aria-label={`更新案笺到 ${update.version}`}
          >
            <ArrowDownToLine />
            <span>
              发现新版本<small>案笺 {update.version} · 查看更新</small>
            </span>
          </button>,
          document.body,
        )}
      {selected && <UpdateDialog update={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
