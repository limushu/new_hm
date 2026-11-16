import Button from '../../components/Button';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  startRecording,
  type RecordingCapture,
  type RecordingProduct,
} from '../../platform/recording';
import Dialog from '../../components/Dialog';
import type { Material, MaterialTarget, SaveAction } from '../../domain/types';
import { nativeRuntime } from '../../services/repository';
import { useSubsystems } from '../../platform/SubsystemProvider';
import { supports } from '../../platform/subsystems';
import Transcription from './Transcription';
export default function Recorder({
  target,
  save,
  onClose,
  properties,
}: {
  target: MaterialTarget;
  save: SaveAction;
  onClose: () => void;
  properties?: ReactNode;
}) {
  const [name, setName] = useState(
    `录音 ${new Date().toLocaleString('sv-SE').replaceAll(':', '-')}`,
  );
  const [status, setStatus] = useState<'idle' | 'recording' | 'paused' | 'stopped'>('idle');
  const [product, setProduct] = useState<RecordingProduct | null>(null);
  const [transcript, setTranscript] = useState<Material | null>(null);
  const { manifest } = useSubsystems();
  const archived = useRef<string | null>(null);
  const blob = product?.blob;
  const [canPause, setCanPause] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const capture = useRef<RecordingCapture | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void capture.current?.dispose().catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (status !== 'recording') return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);
  useEffect(() => {
    if (status !== 'recording' && status !== 'paused') return;
    let canceled = false;
    let checking = false;
    const check = async () => {
      if (checking || busy.current || !capture.current?.state) return;
      checking = true;
      try {
        const state = await capture.current.state();
        if (!canceled && (state === 'paused' || state === 'interrupted')) {
          setStatus('paused');
          if (status === 'recording')
            setError('录音已暂停，请返回应用后继续，或结束并保存已有录音。');
        }
      } catch (reason) {
        if (!canceled) setError(String(reason));
      } finally {
        checking = false;
      }
    };
    const timer = setInterval(() => void check(), 1000);
    document.addEventListener('visibilitychange', check);
    return () => {
      canceled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [status]);
  async function start() {
    if (busy.current) return;
    busy.current = true;
    setStarting(true);
    setError('');
    try {
      const value = await startRecording((message) => {
        if (mounted.current) setError(message);
      });
      if (!mounted.current) {
        await value.dispose();
        return;
      }
      capture.current = value;
      setCanPause(value.canPause);
      setStatus('recording');
    } catch (reason) {
      if (mounted.current) setError(`无法开始录音：${String(reason)}`);
    } finally {
      busy.current = false;
      if (mounted.current) setStarting(false);
    }
  }
  async function control(action: 'pause' | 'resume' | 'finish') {
    if (busy.current || !capture.current) return;
    busy.current = true;
    setError('');
    try {
      if (action === 'finish') {
        const result = await capture.current.finish();
        if (!mounted.current) return;
        setProduct(result);
        const extension = result.name.match(/\.[^.]+$/)?.[0] ?? '';
        setName((current) => current.replace(/\.[^.]+$/, '') + extension);
        setStatus('stopped');
      } else {
        await capture.current[action]();
        if (mounted.current) setStatus(action === 'pause' ? 'paused' : 'recording');
      }
    } catch (error) {
      if (mounted.current) setError(String(error));
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
  async function archiveRecording(): Promise<Material> {
    if (!product) throw new Error('请先结束录音');
    const extension = product.name.match(/\.[^.]+$/)?.[0] ?? '';
    if (extension && !name.trim().toLowerCase().endsWith(extension.toLowerCase()))
      throw new Error(`请保留 ${extension} 扩展名`);
    if (nativeRuntime) {
      archived.current = await product.archive(target, name.trim());
      const data = await save('load_workspace', {});
      const material = data.materials.find((m) => m.id === archived.current);
      if (!material) throw new Error('录音已保存，请从材料页打开后重试');
      return material;
    }
    if (!blob) throw new Error('录音内容暂不可用');
    const { registerPreviewFiles } = await import('../../services/preview');
    await save('import_material_paths', {
      target,
      paths: registerPreviewFiles([new File([blob], name, { type: 'audio/webm' })]),
    });
    const data = await save('load_workspace', {});
    const material = [...data.materials]
      .reverse()
      .find((m) => m.caseId === target.caseId && m.name === name);
    if (!material) throw new Error('录音已保存，请从材料页查看');
    return material;
  }
  if (transcript) return <Transcription item={transcript} save={save} onClose={onClose} />;
  return (
    <Dialog
      className="recording-dialog"
      title="案件录音"
      onClose={close}
      onSubmit={
        product
          ? async () => {
              await archiveRecording();
            }
          : undefined
      }
      submitLabel="保存录音"
      secondaryAction={
        product && nativeRuntime && supports(manifest, 'transcribe-audio')
          ? {
              label: '转成文字',
              run: async () => {
                setTranscript(await archiveRecording());
                return false;
              },
            }
          : undefined
      }
    >
      {properties}
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
          <Button type="button" variant="primary" disabled={starting} onClick={() => void start()}>
            {starting ? '正在启动…' : '开始录音'}
          </Button>
        )}
        {(status === 'recording' || status === 'paused') && (
          <>
            {canPause && (
              <button
                type="button"
                onClick={() => void control(status === 'recording' ? 'pause' : 'resume')}
              >
                {status === 'recording' ? '暂停' : '继续'}
              </button>
            )}
            <button type="button" onClick={() => void control('finish')}>
              结束录音
            </button>
          </>
        )}
      </div>
      {status !== 'idle' && (
        <button
          type="button"
          onClick={async () => {
            if (busy.current) return;
            busy.current = true;
            try {
              await capture.current?.dispose();
              capture.current = null;
              onClose();
            } catch (reason) {
              setError(String(reason));
            } finally {
              busy.current = false;
            }
          }}
        >
          放弃录音
        </button>
      )}
      {blob && <AudioClip blob={blob} />}
      <p className="field-hint">
        仅在点击开始后使用麦克风。结束后保存到当前案件材料中。iPhone
        锁屏、切到后台或来电时会暂停录音。
      </p>
      {product && supports(manifest, 'transcribe-audio') && (
        <p className="field-hint">点击转成文字会先保存原录音，再进行设备内识别。</p>
      )}
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
  return <audio controls src={url || undefined} />;
}
