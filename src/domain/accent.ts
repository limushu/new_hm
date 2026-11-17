/** User colour seeds are mapped to accessible roles, independently of platform. */
export const defaultAccent = '#557c69';
export const accentPresets = [
  { name: '青绿', color: defaultAccent },
  { name: '蓝灰', color: '#5b7896' },
  { name: '紫藤', color: '#817095' },
  { name: '暖棕', color: '#97774f' },
  { name: '玫瑰', color: '#a16f7c' },
  { name: '石墨', color: '#747474' },
] as const;
export const validAccent = (value: unknown): value is string =>
  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
type RGB = [number, number, number];
function rgb(hex: string): RGB {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
}
function luminance(hex: string) {
  const values = rgb(hex).map((n) => {
    const x = n / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
export function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function hsl(hex: string) {
  const [r, g, b] = rgb(hex).map((x) => x / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  const l = (max + min) / 2;
  const s = delta ? delta / (1 - Math.abs(2 * l - 1)) : 0;
  const h = delta
    ? ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 +
        360) %
      360
    : 0;
  return { h, s, l };
}
function tone(h: number, s: number, l: number) {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (
    '#' + [channel(0), channel(8), channel(4)].map((x) => x.toString(16).padStart(2, '0')).join('')
  );
}
export function accentPalette(seed: string, mode: 'light' | 'dark'): Record<string, string> {
  const { h, s, l } = hsl(validAccent(seed) ? seed : defaultAccent);
  const saturation = Math.min(s, 0.65),
    dark = mode === 'dark';
  const surface = dark ? '#202020' : '#ffffff';
  const onFill = dark ? '#191919' : '#ffffff';
  const soft = tone(h, saturation, dark ? 0.19 : 0.94);
  const softHover = tone(h, saturation, dark ? 0.23 : 0.91);
  const readable = (lightness: number, backgrounds: string[], direction: number) => {
    let value = lightness;
    for (let i = 0; i <= 100; i++) {
      const color = tone(h, saturation, value);
      if (backgrounds.every((bg) => contrast(color, bg) >= 4.5)) return color;
      value = Math.max(0, Math.min(1, value + direction * 0.01));
    }
    return direction > 0 ? '#ffffff' : '#000000';
  };
  const base = Math.max(0.32, Math.min(0.5, l));
  const fill = readable(dark ? base + 0.07 : base - 0.03, [onFill], dark ? 1 : -1);
  const fillLightness = hsl(fill).l;
  return {
    '--accent-fill': fill,
    '--accent-fill-hover': readable(fillLightness + (dark ? 0.05 : -0.05), [onFill], dark ? 1 : -1),
    '--accent-text': readable(dark ? 0.68 : 0.33, [surface, soft, softHover], dark ? 1 : -1),
    '--accent-soft': soft,
    '--accent-soft-hover': softHover,
    '--accent-faint': tone(h, saturation, dark ? 0.15 : 0.97),
    '--accent-line': tone(h, saturation, dark ? 0.31 : 0.81),
    '--on-primary': onFill,
  };
}
