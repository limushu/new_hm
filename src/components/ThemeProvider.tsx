import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { syncWindowTheme } from '../platform/host';
import { command } from '../services/repository';
import { useSubsystems } from '../platform/SubsystemProvider';
import { supports } from '../platform/subsystems';
import { accentPalette, defaultAccent, validAccent } from '../domain/accent';

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
function cachedAccent() {
  try {
    const value = localStorage.getItem('hm-accent-color');
    return validAccent(value) ? value : defaultAccent;
  } catch {
    return defaultAccent;
  }
}
function apply(value: Theme, accent: string) {
  const resolved =
    value === 'system'
      ? matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : value;
  document.documentElement.dataset.theme = resolved;
  for (const [key, color] of Object.entries(accentPalette(accent, resolved)))
    document.documentElement.style.setProperty(key, color);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'light' ? '#f7f7f5' : '#191919');
}
apply(cachedTheme(), cachedAccent());
const Context = createContext<{
  theme: Theme;
  accent: string;
  setTheme: (theme: Theme) => Promise<void>;
  setAccent: (color: string) => Promise<void>;
}>({
  theme: 'dark',
  accent: defaultAccent,
  setTheme: async () => {},
  setAccent: async () => {},
});
export const useTheme = () => useContext(Context);
export default function ThemeProvider({ children }: { children: ReactNode }) {
  const { manifest } = useSubsystems();
  const windowTheme = supports(manifest, 'window-theme');
  const [theme, setValue] = useState<Theme>(cachedTheme);
  const [accent, setAccentValue] = useState(cachedAccent);
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
        if (!canceled) {
          const color = validAccent(s.accent_color) ? s.accent_color : defaultAccent;
          setAccentValue(color);
          try {
            localStorage.setItem('hm-accent-color', color);
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
    apply(theme, accent);
    const media = matchMedia('(prefers-color-scheme: light)');
    const change = () => {
      if (theme === 'system') apply(theme, accent);
    };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [theme, accent]);
  useEffect(() => {
    if (windowTheme) void syncWindowTheme(theme).catch(() => {});
  }, [theme, windowTheme]);
  return (
    <Context.Provider
      value={{
        theme,
        accent,
        setAccent: async (color) => {
          if (!validAccent(color)) throw new Error('请填写 #RRGGBB 颜色代码');
          const value = color.toLowerCase();
          await command('set_setting', { key: 'accent_color', value });
          try {
            localStorage.setItem('hm-accent-color', value);
          } catch {
            /* SQLite remains authoritative. */
          }
          setAccentValue(value);
        },
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
