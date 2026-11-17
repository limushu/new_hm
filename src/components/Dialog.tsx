import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import Button from './Button';
export default function Dialog({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel = '保存',
  danger = false,
  className = '',
  secondaryAction,
  showFooter = true,
  cancelAction,
  submitDisabled = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit?: () => Promise<void | false>;
  secondaryAction?: { label: string; run: () => Promise<void | false> };
  showFooter?: boolean;
  cancelAction?: () => void;
  submitDisabled?: boolean;
  submitLabel?: string;
  danger?: boolean;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const inflight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function commit(action: () => Promise<void | false>) {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError('');
    try {
      if ((await action()) !== false) onClose();
    } catch (reason) {
      setError(String(reason));
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    dialog.current?.showModal();
    // Native dialogs otherwise focus the first button (close), drawing a
    // keyboard ring around it even when the sheet was opened with a finger.
    heading.current?.focus({ preventScroll: true });
    return () => dialog.current?.close();
  }, []);
  // Modal forms must be siblings in the DOM: a dialog opened from another
  // dialog must not become a nested HTML form (which can navigate on submit).
  return createPortal(
    <dialog
      className={`workspace-dialog ${className}`}
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!inflight.current) onClose();
      }}
      aria-label={title}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (onSubmit) await commit(onSubmit);
        }}
      >
        <header>
          <h2 ref={heading} tabIndex={-1} className="dialog-heading">
            {title}
          </h2>
          <button
            type="button"
            className="icon-button dialog-close"
            aria-label="关闭"
            disabled={busy}
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <fieldset disabled={busy}>{children}</fieldset>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {showFooter && (
          <footer>
            <Button variant="ghost" disabled={busy} onClick={cancelAction ?? onClose}>
              {onSubmit ? '取消' : '关闭'}
            </Button>
            {onSubmit && (
              <>
                {secondaryAction && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      const form = dialog.current?.querySelector('form');
                      if (form?.reportValidity()) void commit(secondaryAction.run);
                    }}
                  >
                    {secondaryAction.label}
                  </Button>
                )}
                <Button
                  variant={danger ? 'danger' : 'primary'}
                  disabled={busy || submitDisabled}
                  type="submit"
                >
                  {busy ? '处理中…' : submitLabel}
                </Button>
              </>
            )}
          </footer>
        )}
      </form>
    </dialog>,
    document.body,
  );
}
