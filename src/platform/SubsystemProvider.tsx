import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { command } from '../services/repository';
import { supports, type RuntimeManifest } from './subsystems';
import { observeForeground } from './lifecycle';

const Context = createContext<{ manifest: RuntimeManifest | null; error: string }>({
  manifest: null,
  error: '',
});

export const useSubsystems = () => useContext(Context);

export default function SubsystemProvider({ children }: { children: ReactNode }) {
  const [manifest, setManifest] = useState<RuntimeManifest | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let canceled = false;
    void command('subsystem_manifest', {})
      .then((value) => {
        if (value.version !== 1) throw new Error('应用子系统版本不兼容');
        if (!canceled) setManifest(value);
      })
      .catch((reason) => {
        if (!canceled) setError(`系统功能暂不可用：${String(reason)}`);
      });
    return () => {
      canceled = true;
    };
  }, []);
  const foreground = supports(manifest, 'foreground-maintenance');
  useEffect(() => {
    if (!foreground) return;
    let canceled = false;
    const stop = observeForeground(() => {
      void command('resume_runtime', {}).catch((reason) => {
        if (!canceled) setError(`前台维护暂不可用：${String(reason)}`);
      });
    });
    return () => {
      canceled = true;
      stop();
    };
  }, [foreground]);
  return <Context.Provider value={{ manifest, error }}>{children}</Context.Provider>;
}
