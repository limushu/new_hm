/** Shared visible-window geometry. System keyboard and browser chrome are host
 * concerns; pages consume the same CSS values instead of moving their own bars.
 * Pinch zoom keeps the normal layout so zooming never rearranges the document.
 */
export function observeViewport(window: Window, root: HTMLElement): () => void {
  const viewport = window.visualViewport;
  const update = () => {
    const zoomed = viewport && Math.abs(viewport.scale - 1) > 0.02;
    const height = viewport && !zoomed ? viewport.height : window.innerHeight;
    const offset = viewport && !zoomed ? viewport.offsetTop : 0;
    const bottom = Math.max(0, window.innerHeight - height - offset);
    root.style.setProperty('--viewport-height', `${height}px`);
    root.style.setProperty('--viewport-bottom', `${bottom}px`);
    root.toggleAttribute('data-keyboard-open', bottom > 80);
  };
  update();
  window.addEventListener('resize', update);
  viewport?.addEventListener('resize', update);
  viewport?.addEventListener('scroll', update);
  return () => {
    window.removeEventListener('resize', update);
    viewport?.removeEventListener('resize', update);
    viewport?.removeEventListener('scroll', update);
    root.style.removeProperty('--viewport-height');
    root.style.removeProperty('--viewport-bottom');
    root.removeAttribute('data-keyboard-open');
  };
}
