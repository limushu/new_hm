import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, FileText, Maximize2 } from 'lucide-react';
import { materialSource } from '../../platform/documents';
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { command } from '../../services/repository';
import type { Material, SaveAction } from '../../domain/types';
import { useSubsystems } from '../../platform/SubsystemProvider';
import { supports } from '../../platform/subsystems';
import { isAudioMaterial } from '../../platform/speech';
import Transcription from './Transcription';
import './material-content.css';

export default function MaterialContent({
  item,
  save,
  onExpand,
}: {
  item: Material;
  save?: SaveAction;
  onExpand?: () => void;
}) {
  const media = useRef<HTMLMediaElement>(null);
  const connectMedia = useCallback((node: HTMLMediaElement | null) => {
    if (media.current && media.current !== node) media.current.pause();
    media.current = node;
  }, []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [text, setText] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [transcribe, setTranscribe] = useState(false);
  const { manifest } = useSubsystems();
  const extension = item.name.split('.').pop()?.toLowerCase();
  const image = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(extension ?? '');
  useEffect(() => {
    let canceled = false;
    setText(null);
    setUrl('');
    setPdf(null);
    setPage(1);
    setZoom(1);
    let loading: PDFDocumentLoadingTask | undefined;
    setError('');
    if (extension === 'md' || extension === 'txt') {
      void command('read_text_document', { id: item.id })
        .then((value) => {
          if (!canceled) setText(value);
        })
        .catch((reason) => {
          if (!canceled) setError(String(reason));
        });
      return () => {
        canceled = true;
      };
    }
    void command('material_preview', { id: item.id })
      .then(async (path) => {
        const source = materialSource(path);
        if (canceled) return;
        setUrl(source);
        if (extension === 'pdf') {
          const lib = await import('pdfjs-dist');
          lib.GlobalWorkerOptions.workerSrc = worker;
          loading = lib.getDocument({
            url: source,
            cMapUrl: '/pdfjs/cmaps/',
            cMapPacked: true,
            standardFontDataUrl: '/pdfjs/standard_fonts/',
            wasmUrl: '/pdfjs/wasm/',
          });
          const document = await loading.promise;
          if (canceled) {
            await loading.destroy();
            return;
          }
          setPdf(document);
        }
      })
      .catch((reason) => {
        if (!canceled) setError(String(reason));
      });
    return () => {
      canceled = true;
      void loading?.destroy();
    };
  }, [item.id, extension]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let canceled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    void pdf
      .getPage(page)
      .then((value) => {
        if (canceled || !canvas.current) return;
        const ratio = Math.min(devicePixelRatio, 2);
        const viewport = value.getViewport({ scale: zoom });
        const element = canvas.current;
        const context = element.getContext('2d');
        if (!context) throw new Error('无法创建预览画布');
        element.width = viewport.width * ratio;
        element.height = viewport.height * ratio;
        element.style.width = `${viewport.width}px`;
        element.style.height = `${viewport.height}px`;
        task = value.render({
          canvas: element,
          canvasContext: context,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        return task.promise;
      })
      .catch((reason) => {
        if (!canceled) setError(String(reason));
      });
    return () => {
      canceled = true;
      task?.cancel();
    };
  }, [pdf, page, zoom]);
  return (
    <>
      <section
        className={`material-content ${isAudioMaterial(item.name) ? 'is-audio' : ''}`}
        aria-label="材料内容"
      >
        <div className="material-content-tools">
          {(pdf || image) && (
            <div className="preview-controls">
              <button
                type="button"
                className="icon-button"
                aria-label="缩小"
                onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
              >
                <Minus />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="icon-button"
                aria-label="放大"
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
              >
                <Plus />
              </button>
              {pdf && (
                <>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="上一页"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft />
                  </button>
                  <span>
                    {page} / {pdf.numPages}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="下一页"
                    disabled={page === pdf.numPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight />
                  </button>
                </>
              )}
            </div>
          )}

          {onExpand && (image || ['pdf', 'md', 'txt', 'mp4'].includes(extension ?? '')) && (
            <button type="button" className="material-expand" onClick={onExpand}>
              <Maximize2 /> 全屏预览
            </button>
          )}
        </div>
        <div className="material-content-body">
          {error ? (
            <p role="alert" className="error-message">
              {error}
            </p>
          ) : text !== null ? (
            <pre className="text-document-preview">{text}</pre>
          ) : !url ? (
            <p className="quiet-empty">正在打开…</p>
          ) : extension === 'pdf' ? (
            <canvas ref={canvas} />
          ) : image ? (
            <img src={url} style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} alt={item.name} />
          ) : extension === 'mp4' ? (
            <video ref={connectMedia} src={url} controls playsInline preload="metadata" />
          ) : isAudioMaterial(item.name) ? (
            <audio
              aria-label={`播放 ${item.name}`}
              ref={connectMedia}
              src={url}
              controls
              preload="metadata"
            />
          ) : (
            <p className="field-hint">此格式可从材料页导出，使用对应应用打开。</p>
          )}
        </div>
        {save && isAudioMaterial(item.name) && supports(manifest, 'transcribe-audio') && (
          <button
            type="button"
            className="preview-transcribe"
            onClick={() => {
              media.current?.pause();
              setTranscribe(true);
            }}
          >
            <FileText />
            转成文字
          </button>
        )}
      </section>
      {transcribe && save && (
        <Transcription item={item} save={save} onClose={() => setTranscribe(false)} />
      )}
    </>
  );
}
