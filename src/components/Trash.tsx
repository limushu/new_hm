import { useState } from 'react';
import { Folder, FileText, RotateCcw, Trash2 } from 'lucide-react';
import Dialog from './Dialog';
import { useAction } from './useAction';
import type { SaveAction, Workspace } from '../domain/types';
export default function Trash({ data, save }: { data: Workspace; save: SaveAction }) {
  const [purge, setPurge] = useState<{
    kind: 'case' | 'record' | 'material';
    id: string;
    title: string;
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const { busy, error, run } = useAction();
  const cases = data.cases
    .filter((c) => c.deletedAt)
    .map((c) => ({ kind: 'case' as const, id: c.id, title: c.title, context: '案件' }));
  const active = new Set(data.cases.filter((c) => !c.deletedAt).map((c) => c.id));
  const records = data.deletedRecords
    .filter((r) => active.has(r.caseId))
    .map((r) => ({
      kind: 'record' as const,
      id: r.id,
      title: r.body.slice(0, 80),
      context: data.cases.find((c) => c.id === r.caseId)!.title + ' · 工作记录',
    }));
  const materials = data.materials
    .filter((m) => active.has(m.caseId) && m.deletedAt && m.trashGroup === m.id)
    .map((m) => ({
      kind: 'material' as const,
      id: m.id,
      title: m.name,
      context: data.cases.find((c) => c.id === m.caseId)!.title + ' · 材料',
    }));
  const rows = [...cases, ...materials, ...records];
  return (
    <div className="simple-page">
      <h1>
        <Trash2 />
        回收站
      </h1>
      <p className="page-description">
        案件、材料和工作记录可以恢复。案件恢复后，其原有程序与关联信息一起保留。
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!rows.length && <p className="empty-text">回收站为空。</p>}
      {rows.map((row) => (
        <div className="trash-item" key={`${row.kind}-${row.id}`}>
          {row.kind === 'case' ? <Folder /> : <FileText />}
          <div className="row-main">
            <span>{row.title}</span>
            <small>{row.context}</small>
          </div>
          <button
            disabled={busy}
            onClick={() => void run(() => save('restore_item', { kind: row.kind, id: row.id }))}
          >
            <RotateCcw />
            恢复
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={() => {
              setConfirmed(false);
              setPurge(row);
            }}
          >
            彻底删除
          </button>
        </div>
      ))}
      {purge && (
        <Dialog
          title="彻底删除"
          onClose={() => setPurge(null)}
          danger
          submitLabel="彻底删除"
          onSubmit={async () => {
            if (!confirmed) throw new Error('请先确认彻底删除');
            await save('purge_item', { kind: purge.kind, id: purge.id, confirmed: true });
          }}
        >
          <p className="feature-description">
            “{purge.title}”将被彻底删除，无法从回收站恢复。
            {purge.kind === 'case'
              ? '案件内的程序、材料、记录和收支一并删除，独立联系人保留。'
              : ''}
          </p>
          <label className="checkbox-field">
            <input
              type="checkbox"
              aria-label="确认彻底删除"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              required
            />
            我确认彻底删除
          </label>
        </Dialog>
      )}
    </div>
  );
}
