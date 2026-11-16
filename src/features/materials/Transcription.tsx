import { useEffect, useRef, useState } from 'react';
import Dialog from '../../components/Dialog';
import Select from '../../components/Select';
import type { Material, SaveAction } from '../../domain/types';
import { errorMessage } from '../../services/errors';
import {
  cancelTranscription,
  discardTranscription,
  speechHasText,
  speechRunning,
  speechSupport,
  speechTime,
  startTranscription,
  transcriptionDraft,
  transcriptionState,
  type SpeechSnapshot,
  type SpeechSupport,
} from '../../platform/speech';
import './transcription.css';

export default function Transcription({
  item,
  save,
  onClose,
}: {
  item: Material;
  save: SaveAction;
  onClose: () => void;
}) {
  const [language, setLanguage] = useState('zh-CN');
  const [support, setSupport] = useState<SpeechSupport | null>(null);
  const [snapshot, setSnapshot] = useState<SpeechSnapshot | null>(null);
  const [body, setBody] = useState('');
  const [name, setName] = useState(`${item.name.replace(/\.[^.]+$/, '').slice(0, 140)} 转写.md`);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [restart, setRestart] = useState(false);
  const job = useRef<string | null>(null);
  const inflight = useRef<Promise<unknown> | null>(null);
  const mounted = useRef(true);
  const saved = useRef(false);
  const documentId = useRef(crypto.randomUUID());
  const polling = useRef(false);
  const revision = useRef(0);
  const active = speechRunning(snapshot);
  function accept(value: SpeechSnapshot) {
    if (!mounted.current) return;
    setSnapshot(value);
    setBody(transcriptionDraft(item.name, value));
    if (value.error) setError(errorMessage(value.error));
  }
  async function begin(selectedLanguage: string) {
    setBusy(true);
    setError('');
    const id = crypto.randomUUID();
    try {
      if (job.current) await discardTranscription(job.current);
      revision.current++;
      setSnapshot(null);
      setBody('');
      const available = await speechSupport(selectedLanguage);
      if (!mounted.current) return;
      setSupport(available);
      if (!available.installed || !available.onDevice)
        throw new Error('这台设备暂不支持所选语言的设备内识别，请更换语言或稍后重试。');
      if (available.authorization === 'denied' || available.authorization === 'restricted')
        throw new Error('请在 iPhone 设置中允许案笺使用语音识别，再返回重试。');
      job.current = id;
      documentId.current = crypto.randomUUID();
      const request = startTranscription(id, item.id, selectedLanguage);
      inflight.current = request;
      accept(await request);
    } catch (reason) {
      if (mounted.current) setError(errorMessage(reason));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    let alive = true;
    void speechSupport('zh-CN')
      .then((value) => {
        if (!alive) return;
        setSupport(value);
        if (value.installed && value.onDevice) void begin('zh-CN');
      })
      .catch((reason) => {
        if (alive) setError(errorMessage(reason));
      });
    return () => {
      alive = false;
      mounted.current = false;
      const id = job.current;
      if (id)
        void Promise.resolve(inflight.current)
          .catch(() => {})
          .then(() => discardTranscription(id))
          .catch(() => {});
    };
    // One intentional user action opens this sheet and starts its first job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!active || !job.current) return;
    let alive = true;
    const id = job.current;
    const poll = async () => {
      if (polling.current || document.visibilityState === 'hidden') return;
      polling.current = true;
      const version = revision.current;
      try {
        const value = await transcriptionState(id);
        if (alive && version === revision.current) accept(value);
      } catch (reason) {
        if (alive) setError(errorMessage(reason));
      } finally {
        polling.current = false;
      }
    };
    const timer = setInterval(() => void poll(), 700);
    document.addEventListener('visibilitychange', poll);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [active]);
  const close = () => {
    if (!saved.current && (body.trim() || active || busy)) setDiscard(true);
    else onClose();
  };
  return (
    <>
      <Dialog
        title="语音转文字"
        className="transcription-dialog"
        onClose={close}
        submitLabel={snapshot?.phase === 'completed' ? '保存转写稿' : '保存已识别部分'}
        onSubmit={
          !active && !busy && speechHasText(snapshot)
            ? async () => {
                if (!job.current || !body.trim()) throw new Error('请先完成转写并填写文字内容');
                const title = name.trim();
                if (!title || /[\\/:*?"<>|\u0000-\u001f]/.test(title))
                  throw new Error('请填写有效的文档名称');
                await save('save_transcription', {
                  id: job.current,
                  documentId: documentId.current,
                  name: /\.md$/i.test(title) ? title : `${title}.md`,
                  body,
                });
                saved.current = true;
              }
            : undefined
        }
      >
        <p className="transcription-source">
          原录音已保留<span>{item.name}</span>
        </p>
        <label>
          识别语言
          <Select
            aria-label="转写语言"
            value={language}
            disabled={active || busy}
            onValueChange={setLanguage}
          >
            <option value="zh-CN">普通话</option>
            <option value="en-US">英语</option>
          </Select>
        </label>
        {!support && !error && (
          <p role="status" className="field-hint">
            正在检查设备内识别…
          </p>
        )}
        {support && !support.onDevice && (
          <p role="status" className="field-hint">
            这台设备暂不支持当前语言的设备内识别。可更换语言后重试。
          </p>
        )}
        {busy && (
          <p role="status" className="field-hint">
            正在准备转写…
          </p>
        )}
        {active && (
          <div className="transcription-progress" role="status">
            <span>{snapshot?.phase === 'authorizing' ? '等待语音识别授权…' : '正在转成文字…'}</span>
            <progress max={snapshot?.totalSeconds || 1} value={snapshot?.completedSeconds || 0} />
            <small>
              {speechTime(snapshot?.completedSeconds || 0)} /{' '}
              {speechTime(snapshot?.totalSeconds || 0)}
            </small>
          </div>
        )}
        {snapshot?.phase === 'completed' && (
          <p role="status" className="field-hint">
            {speechHasText(snapshot)
              ? '转写完成，可修改文字后保存。'
              : '没有识别到文字，可更换语言后重新转写。'}
          </p>
        )}
        {(snapshot?.phase === 'failed' || snapshot?.phase === 'canceled') &&
          speechHasText(snapshot) && (
            <p className="field-hint">转写尚未完成，以下是已识别的部分，可以编辑并保存。</p>
          )}
        {(speechHasText(snapshot) || !!body) && (
          <>
            <label>
              文档名称
              <input
                aria-label="转写稿名称"
                value={name}
                maxLength={170}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              文字
              <textarea
                className="transcription-body"
                aria-label="转写文字"
                rows={10}
                readOnly={active || busy}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
          </>
        )}
        <div className="transcription-controls">
          {active ? (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!job.current) return;
                revision.current++;
                setBusy(true);
                try {
                  accept(await cancelTranscription(job.current));
                } catch (reason) {
                  setError(errorMessage(reason));
                } finally {
                  setBusy(false);
                }
              }}
            >
              停止转写
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !support}
              onClick={() => {
                if (body.trim()) setRestart(true);
                else void begin(language);
              }}
            >
              {snapshot ? '重新转写' : '开始转写'}
            </button>
          )}
        </div>
        <p className="field-hint">
          设备内识别，转写时请保持应用在前台。识别可能有误，请对照原录音核对后保存。
        </p>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </Dialog>
      {discard && (
        <Dialog
          title="放弃未保存的转写？"
          submitLabel="放弃转写"
          danger
          onClose={() => setDiscard(false)}
          onSubmit={async () => {
            if (job.current) await discardTranscription(job.current);
            saved.current = true;
            onClose();
          }}
        >
          <p>原录音已经保存。当前任务会停止，尚未保存的文字将被放弃。</p>
        </Dialog>
      )}
      {restart && (
        <Dialog
          title="重新转写？"
          submitLabel="重新转写"
          onClose={() => setRestart(false)}
          onSubmit={async () => {
            await begin(language);
            setRestart(false);
          }}
        >
          <p>重新识别会替换当前尚未保存的文字。原录音会保留。</p>
        </Dialog>
      )}
    </>
  );
}
