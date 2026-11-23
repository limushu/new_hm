import { useEffect } from 'react';
import { nativeRuntime } from '../services/repository';
import { backNavigation } from './backNavigation';
import { useSubsystems } from './SubsystemProvider';
import { supports } from './subsystems';

export function useSystemBack() {
  const { manifest } = useSubsystems();
  const enabled = supports(manifest, 'system-back');
  useEffect(() => {
    if (!nativeRuntime || !enabled) return;
    let active = true;
    let unregister: (() => Promise<void>) | undefined;
    void import('@tauri-apps/api/app')
      .then(async ({ onBackButtonPress, exit }) => {
        if (!active) return;
        const listener = await onBackButtonPress(() => {
          if (!active) return;
          void backNavigation
            .request()
            .then((handled) => {
              if (active && !handled) return exit(0);
            })
            .catch((error) => console.error('System back failed', error));
        });
        if (!active) await listener.unregister();
        else unregister = () => listener.unregister();
      })
      .catch((error) => console.error('System back registration failed', error));
    return () => {
      active = false;
      void unregister?.().catch(() => {});
    };
  }, [enabled]);
}
