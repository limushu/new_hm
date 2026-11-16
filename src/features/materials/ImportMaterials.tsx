import Button from '../../components/Button';
import { useRef, useState, type ReactNode } from 'react';
import Dialog from '../../components/Dialog';
import { useAction } from '../../components/useAction';
import type { MaterialTarget, SaveAction } from '../../domain/types';
import { nativeRuntime } from '../../services/repository';
import { errorMessage } from '../../services/errors';
export default function ImportMaterials({
  target,
  save,
  onClose,
  properties,
  onRetryProperties,
}: {
  target: MaterialTarget;
  save: SaveAction;
  onClose: () => void;
  properties?: ReactNode;
  onRetryProperties?: () => Promise<unknown>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { run, busy, error } = useAction();
  const [notice, setNotice] = useState('');
  async function pick(files?: FileList | null) {
    await run(async () => {
      const report = nativeRuntime
        ? await save('pick_materials', { target })
        : files
          ? await save('import_material_paths', {
              target,
              paths: (await import('../../services/preview')).registerPreviewFiles([...files]),
            })
          : null;
      if (!report) return;
      setNotice(report.imported ? `已归档 ${report.imported} 份材料` : '未选择材料');
      if (report.errors.length)
        throw new Error(
          report.errors
            .map((e) => (typeof e === 'string' ? e : `${e.name}：${errorMessage(e.error)}`))
            .join('；'),
        );
    });
  }
  return (
    <Dialog title="导入本地材料" onClose={onClose}>
      <p className="field-hint">
        选择已有文件，归档到本案；原始文件保留。重要程度、标签和关联节点应用于本次导入的材料。
      </p>
      {properties}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-label="选择本地材料"
        onChange={(e) => void pick(e.target.files)}
      />
      <Button
        variant="primary"
        disabled={busy}
        type="button"
        onClick={() => (nativeRuntime ? void pick() : input.current?.click())}
      >
        {busy ? '正在归档…' : '选择本地文件'}
      </Button>
      {notice && <p role="status">{notice}</p>}
      {error && error.includes('公共属性未保存') && onRetryProperties && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await onRetryProperties();
              setNotice('公共属性已保存');
            })
          }
        >
          重试保存属性
        </button>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </Dialog>
  );
}
