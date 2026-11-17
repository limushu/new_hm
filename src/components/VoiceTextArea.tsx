import { useEffect, useId, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { Mic } from 'lucide-react';
import Button from './Button';
import {
  DictationSession,
  appendDictation,
  dictationText,
  type DictationSnapshot,
} from '../platform/dictation';
import { speechRunning, speechTime } from '../platform/speech';
import { useSubsystems } from '../platform/SubsystemProvider';
import { supports } from '../platform/subsystems';
import { errorMessage } from '../services/errors';
import './voice-textarea.css';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  onVoiceActivity?: (active: boolean) => void;
};
export default function VoiceTextArea({
  label,
  value,
  onValueChange,
  onVoiceActivity,
  ...props
}: Props) {
  const id = useId();
  const { manifest } = useSubsystems();
  const available = supports(manifest, 'record-audio') && supports(manifest, 'transcribe-audio');
  const [snapshot, setSnapshot] = useState<DictationSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const session = useRef<DictationSession | null>(null);
  const mounted = useRef(true);
  const operating = useRef(false);
  const polling = useRef(false);
  const applied = useRef(false);
  const current = useRef({ value, onValueChange, maxLength: props.maxLength });
  current.current = { value, onValueChange, maxLength: props.maxLength };
  const recognizing = speechRunning(snapshot?.speech ?? null);
  useEffect(() => {
    onVoiceActivity?.(open);
    return () => onVoiceActivity?.(false);
  }, [open, onVoiceActivity]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void session.current?.dispose().catch(() => {});
    };
  }, []);
  async function release() {
    const owner = session.current;
    if (!owner) return;
    operating.current = true;
    setBusy(true);
    setSnapshot(null);
    try {
      await owner.dispose();
      if (mounted.current && session.current === owner) {
        session.current = null;
        setOpen(false);
        setPending(null);
      }
    } catch (reason) {
      if (mounted.current) setError(errorMessage(reason));
    } finally {
      operating.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function insert(text: string) {
    const latest = current.current;
    const next = appendDictation(latest.value, text, latest.maxLength);
    if (next == null) {
      setPending(text);
      setNotice('识别文字超过正文长度限制，请先精简后追加。');
      return false;
    }
    latest.onValueChange(next);
    setNotice('文字已追加，请核对后保存。');
    return true;
  }
  useEffect(() => {
    const result = snapshot?.speech;
    if (!result || recognizing || applied.current) return;
    applied.current = true;
    const text = dictationText(result);
    if (result.error) setError(errorMessage(result.error));
    if (result.phase === 'completed' && text) {
      if (insert(text)) void release();
    } else if (text) {
      setPending(text);
      setNotice('这是已识别的部分，可核对后追加。');
    } else {
      setNotice(
        result.phase === 'completed'
          ? '没有识别到文字，可以重新录入。'
          : '语音输入已停止，原有文字保留。',
      );
      void release();
    }
    // Each terminal snapshot is consumed once; insertion reads the latest draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, recognizing]);
  useEffect(() => {
    if (snapshot?.capture !== 'recording') return;
    const timer = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [snapshot?.capture]);
  useEffect(() => {
    if (!open || (!snapshot?.capture && !recognizing)) return;
    const owner = session.current;
    let alive = true;
    async function poll() {
      if (!owner || polling.current || operating.current || document.visibilityState === 'hidden')
        return;
      polling.current = true;
      try {
        const next = await owner.snapshot();
        if (alive && mounted.current && session.current === owner && !operating.current)
          setSnapshot(next);
      } catch (reason) {
        if (alive && mounted.current && !operating.current) setError(errorMessage(reason));
      } finally {
        polling.current = false;
      }
    }
    const timer = setInterval(() => void poll(), 700);
    document.addEventListener('visibilitychange', poll);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [open, snapshot?.capture, recognizing]);
  async function start() {
    if (operating.current || session.current) return;
    const owner = new DictationSession();
    session.current = owner;
    operating.current = true;
    applied.current = false;
    setOpen(true);
    setBusy(true);
    setSeconds(0);
    setError('');
    setNotice('');
    setPending(null);
    try {
      const next = await owner.start();
      if (mounted.current && session.current === owner) setSnapshot(next);
    } catch (reason) {
      if (mounted.current) setError(errorMessage(reason));
      await release();
    } finally {
      operating.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function control() {
    if (operating.current || !session.current) return;
    operating.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await (recognizing ? session.current.stop() : session.current.finish());
      if (mounted.current) setSnapshot(next);
    } catch (reason) {
      if (mounted.current) setError(errorMessage(reason));
    } finally {
      operating.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="voice-text-field" data-sync-busy={open || undefined}>
      <div className="voice-text-heading">
        <label htmlFor={props.id ?? id}>{label}</label>
        {available && !open && !props.readOnly && (
          <Button variant="ghost" icon={Mic} disabled={props.disabled} onClick={() => void start()}>
            语音输入
          </Button>
        )}
      </div>
      <textarea
        {...props}
        id={props.id ?? id}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      />
      {open && (
        <div className="voice-input-panel">
          <p role="status" className="voice-input-status">
            {busy
              ? '正在处理…'
              : snapshot?.capture === 'recording'
                ? `正在录音 ${speechTime(seconds)}`
                : recognizing
                  ? '正在转成文字…'
                  : snapshot?.capture === 'finished'
                    ? '录音已结束，可重试转写。'
                    : snapshot?.capture
                      ? '录音已暂停，可以转写已有内容。'
                      : pending !== null
                        ? '识别文字待核对'
                        : '正在结束语音输入…'}
          </p>
          {snapshot?.capture && !busy && (
            <p className="field-hint">普通话 · 结束后转写并追加到正文</p>
          )}
          {recognizing && (
            <progress
              aria-label="语音识别进度"
              max={snapshot?.speech?.totalSeconds || 1}
              value={snapshot?.speech?.completedSeconds || 0}
            />
          )}
          {pending !== null && (
            <label>
              已识别文字
              <textarea
                aria-label="待追加的识别文字"
                rows={4}
                value={pending}
                onChange={(e) => setPending(e.target.value)}
              />
            </label>
          )}
          <div className="voice-input-actions">
            {(snapshot?.capture || recognizing) && (
              <Button disabled={busy} onClick={() => void control()}>
                {recognizing
                  ? '停止转写'
                  : snapshot?.capture === 'finished'
                    ? '重试转写'
                    : '结束并转文字'}
              </Button>
            )}
            {pending !== null && (
              <Button
                disabled={
                  busy ||
                  !pending.trim() ||
                  appendDictation(value, pending, props.maxLength) == null
                }
                onClick={() => {
                  if (insert(pending)) void release();
                }}
              >
                追加到正文
              </Button>
            )}
            <Button variant="ghost" disabled={busy} onClick={() => void release()}>
              放弃语音输入
            </Button>
          </div>
        </div>
      )}
      {notice && (
        <p role="status" className="field-hint">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </div>
  );
}
