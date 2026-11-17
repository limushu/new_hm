// Shared by native IPC and foreground synchronization; no provider SDK in UI.
let businessRequests = 0;
export function businessPending() {
  return businessRequests > 0;
}
export function beginBusinessRequest() {
  businessRequests++;
  return () => {
    businessRequests--;
  };
}
export const workspaceChanged = 'anjian:workspace-changed';
export function isBusinessMutation(name: string) {
  return (
    /^(create_|update_|save_|add_|delete_|trash_|restore_|purge_|toggle_|set_case_|import_|archive_)/.test(
      name,
    ) || name === 'apply_restore_backup'
  );
}
export function canApplyIncoming(document: Document): boolean {
  if (businessPending() || document.visibilityState === 'hidden') return false;
  const visible = (element: HTMLElement) =>
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden' &&
    getComputedStyle(element).opacity !== '0' &&
    !element.closest('[inert]');
  if (
    [
      ...document.querySelectorAll<HTMLElement>(
        'dialog[open], [role="dialog"], [role="listbox"], [role="menu"], [data-sync-busy]',
      ),
    ].some(visible)
  )
    return false;
  const editors = document.querySelectorAll<HTMLElement>(
    'input, textarea, [contenteditable="true"]',
  );
  for (const editor of editors) {
    if (!visible(editor)) continue;
    if (editor instanceof HTMLInputElement) {
      if (
        editor.disabled ||
        editor.readOnly ||
        ['hidden', 'checkbox', 'radio', 'search', 'button', 'submit', 'file'].includes(editor.type)
      )
        continue;
      const label = [editor.placeholder, editor.getAttribute('aria-label')].join(' ');
      if (/搜索|查找|search/i.test(label)) continue;
    }
    if (editor instanceof HTMLTextAreaElement && (editor.disabled || editor.readOnly)) continue;
    return false;
  }
  return true;
}
/** Freeze synchronously before native apply; event capture also supports iOS 15. */
export function freezeWorkspace(document: Document) {
  const root = document.getElementById('root');
  const previous = root?.hasAttribute('inert');
  root?.setAttribute('inert', '');
  document.body.dataset.syncApplying = 'true';
  const prevent = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const events = ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'click', 'input', 'change'];
  events.forEach((name) =>
    document.addEventListener(name, prevent, { capture: true, passive: false }),
  );
  return () => {
    if (!previous) root?.removeAttribute('inert');
    delete document.body.dataset.syncApplying;
    events.forEach((name) => document.removeEventListener(name, prevent, true));
  };
}
