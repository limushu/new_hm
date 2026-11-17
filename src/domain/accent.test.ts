import { expect, it } from 'vitest';
import { accentPalette, accentPresets, contrast, defaultAccent, validAccent } from './accent';
it('accepts only six-digit colour seeds and provides a stable fallback', () => {
  expect(validAccent('#AbC123')).toBe(true);
  for (const value of ['', '#fff', '#12345678', 'red', 'url(foo)', null])
    expect(validAccent(value)).toBe(false);
  expect(accentPalette('invalid', 'light')).toEqual(accentPalette(defaultAccent, 'light'));
});
it('custom and extreme colours keep readable controls in both themes with distinct hover feedback', () => {
  for (const seed of [
    ...accentPresets.map((x) => x.color),
    '#ffffff',
    '#000000',
    '#ffff00',
    '#00ffff',
    '#ff0000',
    '#0000ff',
    '#00ff00',
  ]) {
    for (const mode of ['light', 'dark'] as const) {
      const p = accentPalette(seed, mode);
      for (const background of ['--accent-fill', '--accent-fill-hover'])
        expect(
          contrast(p['--on-primary'], p[background]),
          `${seed}/${mode}/${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      for (const background of [
        mode === 'light' ? '#ffffff' : '#202020',
        p['--accent-soft'],
        p['--accent-soft-hover'],
      ])
        expect(
          contrast(p['--accent-text'], background),
          `${seed}/${mode}/text`,
        ).toBeGreaterThanOrEqual(4.5);
      expect(p['--accent-fill']).not.toBe(p['--accent-fill-hover']);
    }
  }
});
