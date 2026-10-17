import { useLayoutEffect, useRef } from 'react';

/** Keep menus in the browser top layer, including inside a modal dialog. */
export function usePopover(open: boolean, close: () => void, minWidth = 180) {
  const anchor = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open || !anchor.current || !popup.current) return;
    const panel = popup.current;
    panel.showPopover();
    function position() {
      if (!anchor.current) return;
      const rect = anchor.current.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, minWidth), window.innerWidth - 24);
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const flip = below < Math.min(panel.scrollHeight, 290) && above > below;
      Object.assign(panel.style, {
        width: `${width}px`,
        left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`,
        maxHeight: `${Math.max(60, Math.min(380, flip ? above : below))}px`,
        top: flip ? 'auto' : `${rect.bottom + 5}px`,
        bottom: flip ? `${window.innerHeight - rect.top + 5}px` : 'auto',
      });
    }
    position();
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!panel.contains(target) && !anchor.current?.contains(target)) close();
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        anchor.current?.querySelector<HTMLElement>('button, input')?.focus();
      }
    }
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    return () => {
      panel.hidePopover();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
    };
  }, [open, close, minWidth]);
  return { anchor, popup };
}
