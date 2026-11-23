import { useLayoutEffect, useRef } from 'react';
import { useBackNavigation } from './useBackNavigation';

/** Keep menus in the browser top layer, including inside a modal dialog. */
export function usePopover(open: boolean, close: () => void, minWidth = 180) {
  const anchor = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  useBackNavigation(
    () => {
      close();
      anchor.current?.querySelector<HTMLElement>('button, input')?.focus();
    },
    200,
    open,
  );
  useLayoutEffect(() => {
    if (!open || !anchor.current || !popup.current) return;
    const panel = popup.current;
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    Object.assign(probe.style, {
      position: 'fixed',
      visibility: 'hidden',
      pointerEvents: 'none',
      width: '0',
      height: '0',
      padding: 'var(--safe-top) var(--safe-right) var(--safe-bottom) var(--safe-left)',
    });
    document.body.append(probe);
    panel.showPopover();
    function position() {
      if (!anchor.current) return;
      const rect = anchor.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const safe = getComputedStyle(probe);
      const inset = (value: string) => parseFloat(value) || 0;
      const left = (viewport?.offsetLeft ?? 0) + 12 + inset(safe.paddingLeft);
      const top = (viewport?.offsetTop ?? 0) + 12 + inset(safe.paddingTop);
      const right =
        (viewport?.offsetLeft ?? 0) +
        (viewport?.width ?? window.innerWidth) -
        12 -
        inset(safe.paddingRight);
      const bottom =
        (viewport?.offsetTop ?? 0) +
        (viewport?.height ?? window.innerHeight) -
        12 -
        inset(safe.paddingBottom);
      const width = Math.min(Math.max(rect.width, minWidth), right - left);
      // The anchor can leave the visible area during scrolling or keyboard resize.
      const anchorTop = Math.max(top, Math.min(rect.top, bottom));
      const anchorBottom = Math.max(top, Math.min(rect.bottom, bottom));
      const below = Math.max(0, bottom - anchorBottom - 5);
      const above = Math.max(0, anchorTop - top - 5);
      const flip = below < Math.min(panel.scrollHeight, 290) && above > below;
      Object.assign(panel.style, {
        width: `${width}px`,
        left: `${Math.max(left, Math.min(rect.left, right - width))}px`,
        maxHeight: `${Math.min(380, flip ? above : below)}px`,
        bottom: 'auto',
      });
      const height = panel.getBoundingClientRect().height;
      const desiredTop = flip ? anchorTop - height - 5 : anchorBottom + 5;
      panel.style.top = `${Math.max(top, Math.min(desiredTop, bottom - height))}px`;
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
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    document.addEventListener('scroll', position, true);
    const resize = new ResizeObserver(position);
    resize.observe(panel);
    return () => {
      panel.hidePopover();
      probe.remove();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
      document.removeEventListener('scroll', position, true);
      resize.disconnect();
    };
  }, [open, close, minWidth]);
  return { anchor, popup };
}
