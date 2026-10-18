import { useRef, useState } from 'react';
import { Upload, Paperclip, X, FileText } from 'lucide-react';
import Select from '../../components/Select';
import { command, desktopRuntime } from '../../services/repository';
import type { Workspace } from '../../domain/types';
export interface PendingReceipt {
  id: string;
  path: string;
  name: string;
}
export default function ReceiptField({
  caseId,
  data,
  value,
  onChange,
  pending,
  onPending,
}: {
  caseId: string;
  data: Workspace;
  value: string | null;
  onChange: (id: string | null) => void;
  pending: PendingReceipt | null;
  onPending: (file: PendingReceipt | null) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [select, setSelect] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const stored = data.materials.find((m) => m.id === value);
  async function choose() {
    if (!desktopRuntime) {
      file.current?.click();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const path = await command('pick_receipt_file', {});
      if (path)
        onPending({ id: crypto.randomUUID(), path, name: path.split(/[\\/]/).pop() ?? path });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="receipt-field" aria-label="报销凭据">
      <header>
        <span>
          <Paperclip />
          凭据
        </span>
        <small>可选</small>
      </header>
      {pending || stored ? (
        <div className="receipt-selected">
          <FileText />
          <span>
            {pending?.name ?? stored?.name}
            <small>{pending ? '随本次收支一起保存' : '已归档'}</small>
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="移除本次凭据关联"
            onClick={() => {
              onPending(null);
              onChange(null);
            }}
          >
            <X />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="receipt-upload"
          disabled={busy}
          onClick={() => void choose()}
        >
          <Upload />
          <span>
            上传发票或报销凭据<small>保存时自动归档到本案</small>
          </span>
        </button>
      )}
      <div className="receipt-options">
        {(pending || stored) && (
          <button type="button" disabled={busy} onClick={() => void choose()}>
            更换文件
          </button>
        )}
        <button type="button" onClick={() => setSelect(!select)}>
          选择已有材料
        </button>
      </div>
      {select && (
        <Select
          aria-label="收支凭证"
          value={value ?? ''}
          onValueChange={(id) => {
            onChange(id || null);
            onPending(null);
            setSelect(false);
          }}
        >
          <option value="">不关联凭证</option>
          {data.materials
            .filter((m) => m.caseId === caseId && !m.deletedAt && m.kind === 'file')
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </Select>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <input
        ref={file}
        type="file"
        aria-label="上传报销凭据文件"
        hidden
        onChange={async (e) => {
          const chosen = e.target.files?.[0];
          e.target.value = '';
          if (!chosen) return;
          const { registerPreviewFiles } = await import('../../services/preview');
          const [path] = registerPreviewFiles([chosen]);
          onPending({ id: crypto.randomUUID(), path, name: chosen.name });
        }}
      />
    </section>
  );
}
