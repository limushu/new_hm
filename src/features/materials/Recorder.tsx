import { useEffect, useRef, useState } from 'react';
import { saveNativeRecording } from '../../platform/recording';
import Dialog from '../../components/Dialog';
import type { MaterialTarget, SaveAction } from '../../domain/types';
import { nativeRuntime } from '../../services/repository';
export default function Recorder({
  target,
  save,
  onClose,
}: {
  target: MaterialTarget;
  save: SaveAction;
  onClose: () => void;
}) {
  const [name, setName] = useState(
    `录音 ${new Date().toLocaleString('sv-SE').replaceAll(':', '-')}.webm`,
  );
  const [status, setStatus] = useState<'idle' | 'recording' | 'paused' | 'stopped'>('idle');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const busy = useRef(false);
  useEffect(
    () => () => {
      if (recorder.current?.state !== 'inactive') recorder.current?.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );
  useEffect(() => {
    if (status !== 'recording') return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);
  async function start() {
    if (busy.current) return;
    busy.current = true;
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前设备不支持录音');
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/webm'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      if (!type) throw new Error('当前平台暂不支持此录音格式');
      const value = new MediaRecorder(stream.current, { mimeType: type });
      recorder.current = value;
      chunks.current = [];
      value.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      value.onerror = () => {
        setError('录音中断，已录制的部分仍可结束并保存。');
      };
      value.onstop = () => {
        setBlob(new Blob(chunks.current, { type: 'audio/webm' }));
        setStatus('stopped');
        stream.current?.getTracks().forEach((track) => track.stop());
      };
      value.start(1000);
      setStatus('recording');
    } catch (reason) {
      stream.current?.getTracks().forEach((track) => track.stop());
      setError(`无法开始录音：${String(reason)}`);
    } finally {
      busy.current = false;
    }
  }
  const close = () => {
    if (status === 'recording' || status === 'paused') {
      setError('请先结束录音，再保存或放弃。');
      return;
    }
    onClose();
  };
  return (
    <Dialog
      title="案件录音"
      onClose={close}
      onSubmit={
        blob
          ? async () => {
              if (!name.trim().toLowerCase().endsWith('.webm'))
                throw new Error('请保留 .webm 扩展名');
              if (nativeRuntime) {
                await saveNativeRecording(target, name.trim(), blob);
                await save('load_workspace', {});
              } else {
                const { registerPreviewFiles } = await import('../../services/preview');
                await save('import_material_paths', {
                  target,
                  paths: registerPreviewFiles([new File([blob], name, { type: 'audio/webm' })]),
                });
              }
            }
          : undefined
      }
      submitLabel="保存录音"
    >
      <label>
        录音名称
        <input
          aria-label="录音名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={180}
        />
      </label>
      <p className="recording-clock">
        {Math.floor(seconds / 60)
          .toString()
          .padStart(2, '0')}
        :{(seconds % 60).toString().padStart(2, '0')}
      </p>
      <div className="feature-toolbar">
        {status === 'idle' && (
          <button type="button" className="primary-action" onClick={() => void start()}>
            开始录音
          </button>
        )}
        {(status === 'recording' || status === 'paused') && (
          <>
            <button
              type="button"
              onClick={() => {
                if (status === 'recording') {
                  recorder.current?.pause();
                  setStatus('paused');
                } else {
                  recorder.current?.resume();
                  setStatus('recording');
                }
              }}
            >
              {status === 'recording' ? '暂停' : '继续'}
            </button>
            <button type="button" onClick={() => recorder.current?.stop()}>
              结束录音
            </button>
          </>
        )}
      </div>
      {blob && <AudioClip blob={blob} />}
      <p className="field-hint">仅在点击开始后使用麦克风。结束后保存到当前案件材料中。</p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </Dialog>
  );
}
function AudioClip({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return <audio controls src={url} />;
}
