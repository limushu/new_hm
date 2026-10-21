/** Foreground opportunities only: no timer or promise of OS background execution. */
export function observeForeground(resume: () => void): () => void {
  const visible = () => {
    if (document.visibilityState === 'visible') resume();
  };
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('pageshow', visible);
  visible();
  return () => {
    document.removeEventListener('visibilitychange', visible);
    window.removeEventListener('pageshow', visible);
  };
}
