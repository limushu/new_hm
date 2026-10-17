import { useRef, useState } from 'react';
export function useAction() {
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return {
    busy,
    error,
    setError,
    run: async (action: () => Promise<unknown>) => {
      if (active.current) return false;
      active.current = true;
      setBusy(true);
      setError('');
      try {
        await action();
        return true;
      } catch (reason) {
        setError(String(reason));
        return false;
      } finally {
        active.current = false;
        setBusy(false);
      }
    },
  };
}
