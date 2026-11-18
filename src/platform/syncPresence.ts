/** Serialize presence updates and sample the hint when each request starts.
 * Native hosts can override stale WebView visibility; failures never poison
 * later foreground attempts. Shared by automatic and explicit synchronization.
 */
export function createSyncPresence(
  send: (foreground: boolean) => Promise<boolean>,
  hint: () => boolean,
): () => Promise<boolean> {
  let pending: Promise<unknown> = Promise.resolve();
  return () => {
    const next = pending.then(() => send(hint()));
    pending = next.catch(() => {});
    return next;
  };
}
