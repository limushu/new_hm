import type { CSSProperties } from 'react';
import type { CaseStatus } from './types';

const defaults: Record<string, string> = {
  not_started: '#96938b',
  in_progress: '#7098b9',
  closed: '#7e9b85',
};

/** Preserve custom colors; built-in statuses share the board and property palette. */
export function statusPalette(status?: CaseStatus): CSSProperties {
  const builtin = status && defaults[status.id] === status.color.toLowerCase();
  const family = builtin
    ? ({ not_started: 'neutral', in_progress: 'blue', closed: 'green' } as Record<string, string>)[
        status.id
      ]
    : null;
  const color = status?.color ?? '#768b9a';
  return {
    '--column-bg': family
      ? `var(--board-${family}-column)`
      : `color-mix(in srgb, ${color} 7%, var(--bg))`,
    '--card-bg': family
      ? `var(--board-${family}-card)`
      : `color-mix(in srgb, ${color} 12%, var(--surface))`,
    '--card-border': family
      ? `var(--board-${family}-line)`
      : `color-mix(in srgb, ${color} 28%, var(--line))`,
    '--status-bg': family
      ? `var(--status-${family}-bg)`
      : `color-mix(in srgb, ${color} 23%, var(--surface))`,
    '--status-dot': family ? `var(--status-${family}-dot)` : color,
    '--status-foreground': family ? `var(--status-${family}-text)` : 'var(--text)',
    '--status-accent': family
      ? family === 'neutral'
        ? 'var(--muted)'
        : `var(--${family}-text)`
      : 'var(--text)',
  } as CSSProperties;
}
