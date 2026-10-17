import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
export default function Dialog({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel = '保存',
  danger = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit?: () => Promise<void>;
  submitLabel?: string;
  danger?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inflight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      className="workspace-dialog"
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!inflight.current) onClose();
      }}
      aria-label={title}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!onSubmit || inflight.current) return;
          inflight.current = true;
          setBusy(true);
          setError('');
          try {
            await onSubmit();
            onClose();
          } catch (reason) {
            setError(String(reason));
          } finally {
            inflight.current = false;
            setBusy(false);
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
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
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            {onSubmit ? '取消' : '关闭'}
          </button>
          {onSubmit && (
            <button
              className={danger ? 'danger-button' : 'primary-action'}
              disabled={busy}
              type="submit"
            >
              {busy ? '处理中…' : submitLabel}
            </button>
          )}
        </footer>
      </form>
    </dialog>
  );
}
