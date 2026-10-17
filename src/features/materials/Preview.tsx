import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { command, desktopRuntime } from '../../services/repository';
import type { Material } from '../../domain/types';
import './materials.css';
export default function Preview({ item, onClose }: { item: Material; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const extension = item.name.split('.').pop()?.toLowerCase();
  const image = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(extension ?? '');
  useEffect(() => {
    dialog.current?.showModal();
    let canceled = false;
    let loading: PDFDocumentLoadingTask | undefined;
    void command('material_preview', { id: item.id })
      .then(async (path) => {
        const source = desktopRuntime ? convertFileSrc(path) : path;
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
    <dialog
      className="material-preview"
      aria-label={`预览 ${item.name}`}
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <strong>{item.name}</strong>
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
        <button type="button" className="icon-button" aria-label="关闭预览" onClick={onClose}>
          <X />
        </button>
      </header>
      <div className="preview-content">
        {error ? (
          <p role="alert" className="error-message">
            {error}
          </p>
        ) : !url ? (
          <p className="quiet-empty">正在打开…</p>
        ) : extension === 'pdf' ? (
          <canvas ref={canvas} />
        ) : image ? (
          <img src={url} style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} alt={item.name} />
        ) : extension === 'mp4' ? (
          <video src={url} controls />
        ) : (
          <audio src={url} controls />
        )}
      </div>
    </dialog>
  );
}
