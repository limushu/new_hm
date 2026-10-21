import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { syncWindowTheme } from '../platform/host';
import { command } from '../services/repository';
import { useSubsystems } from '../platform/SubsystemProvider';
import { supports } from '../platform/subsystems';

export type Theme = 'dark' | 'light' | 'system';
const valid = (value: unknown): value is Theme =>
  ['dark', 'light', 'system'].includes(String(value));
export function cachedTheme(): Theme {
  try {
    const value = localStorage.getItem('hm-theme');
    return valid(value) ? value : 'dark';
  } catch {
    return 'dark';
  }
}
function apply(value: Theme) {
  const resolved =
    value === 'system'
      ? matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : value;
  document.documentElement.dataset.theme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'light' ? '#f7f7f5' : '#191919');
}
apply(cachedTheme());
const Context = createContext<{ theme: Theme; setTheme: (theme: Theme) => Promise<void> }>({
  theme: 'dark',
  setTheme: async () => {},
});
export const useTheme = () => useContext(Context);
export default function ThemeProvider({ children }: { children: ReactNode }) {
  const { manifest } = useSubsystems();
  const windowTheme = supports(manifest, 'window-theme');
  const [theme, setValue] = useState<Theme>(cachedTheme);
  useEffect(() => {
    let canceled = false;
    void command('get_settings', {})
      .then((s) => {
        if (!canceled && valid(s.theme)) {
          setValue(s.theme);
          try {
            localStorage.setItem('hm-theme', s.theme);
          } catch {
            /* Cosmetic cache only. */
          }
        }
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, []);
  useEffect(() => {
    apply(theme);
    if (windowTheme) void syncWindowTheme(theme).catch(() => {});
    const media = matchMedia('(prefers-color-scheme: light)');
    const change = () => {
      if (theme === 'system') apply(theme);
    };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [theme, windowTheme]);
  return (
    <Context.Provider
      value={{
        theme,
        setTheme: async (value) => {
          await command('set_setting', { key: 'theme', value });
          try {
            localStorage.setItem('hm-theme', value);
          } catch {
            /* SQLite remains authoritative. */
          }
          setValue(value);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
