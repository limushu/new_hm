import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { command } from '../services/repository';
import './welcome.css';

export default function Welcome({ onDone }: { onDone: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    element?.querySelector<HTMLButtonElement>('.welcome-start')?.focus();
    return () => element?.close();
  }, []);
  async function finish() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await command('set_setting', { key: 'onboarding_done', value: 'true' });
      onDone();
    } catch {
      setError('未能保存欢迎设置，请重试。');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="welcome-screen"
      aria-label="欢迎使用案笺"
      onCancel={(e) => {
        e.preventDefault();
        void finish();
      }}
    >
      <button className="welcome-skip" onClick={() => void finish()} disabled={busy}>
        跳过
      </button>
      <div className="welcome-content">
        <div className="welcome-art" aria-hidden="true">
          <span className="welcome-orbit orbit-one" />
          <span className="welcome-orbit orbit-two" />
          <img src="/app-icon.svg" alt="" width="112" height="112" />
          <i className="welcome-spark spark-one" />
          <i className="welcome-spark spark-two" />
          <i className="welcome-spark spark-three" />
        </div>
        <h1>案笺</h1>
        <p>每一份托付，都有清晰的脉络。</p>
        <button
          autoFocus
          className="primary-action welcome-start"
          disabled={busy}
          onClick={() => void finish()}
        >
          {busy ? '正在进入…' : '开始使用'}
          <ArrowRight />
        </button>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </div>
    </dialog>
  );
}
