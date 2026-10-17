import { useState } from 'react';
import { Plus, Paperclip } from 'lucide-react';
import Dialog from '../../components/Dialog';
import Materials from '../materials/Materials';
import type { RecordInput, SaveAction, Workspace, WorkRecord } from '../../domain/types';
export default function Records({
  caseId,
  data,
  save,
}: {
  caseId: string;
  data: Workspace;
  save: SaveAction;
}) {
  const [edit, setEdit] = useState<RecordInput | null>(null);
  const [remove, setRemove] = useState<WorkRecord | null>(null);
  const [attachments, setAttachments] = useState<WorkRecord | null>(null);
  const rows = data.workRecords.filter((r) => r.caseId === caseId);
  return (
    <section className="case-section">
      <div className="section-title">
        <h3>工作记录</h3>
        <button onClick={() => setEdit({ id: crypto.randomUUID(), caseId, body: '' })}>
          <Plus />
          记录
        </button>
      </div>
      {!rows.length && <p className="empty-text">暂无工作记录</p>}
      {rows.map((row) => (
        <article className="work-record" key={row.id}>
          <p>{row.body}</p>
          <footer>
            <time>{new Date(row.createdAt).toLocaleString('zh-CN')}</time>
            <div>
              <button onClick={() => setEdit({ id: row.id, caseId, body: row.body })}>编辑</button>
              <button onClick={() => setAttachments(row)}>
                <Paperclip />
                附件
                {data.materials.filter((m) => m.recordId === row.id && !m.deletedAt).length
                  ? ` ${data.materials.filter((m) => m.recordId === row.id && !m.deletedAt).length}`
                  : ''}
              </button>
              <button aria-label="将工作记录移入回收站" onClick={() => setRemove(row)}>
                移入回收站
              </button>
            </div>
          </footer>
        </article>
      ))}
      {edit && <RecordForm value={edit} save={save} onClose={() => setEdit(null)} />}
      {remove && (
        <Dialog
          title="移入回收站"
          onClose={() => setRemove(null)}
          submitLabel="移入回收站"
          danger
          onSubmit={async () => {
            await save('trash_item', { kind: 'record', id: remove.id });
          }}
        >
          <p className="feature-description">
            这条工作记录将移入回收站，可以恢复；归档材料仍保留在案件中。
          </p>
        </Dialog>
      )}
      {attachments && (
        <Dialog title="工作记录附件" onClose={() => setAttachments(null)}>
          <Materials caseId={caseId} data={data} save={save} recordId={attachments.id} />
        </Dialog>
      )}
    </section>
  );
}
function RecordForm({
  value,
  save,
  onClose,
}: {
  value: RecordInput;
  save: SaveAction;
  onClose: () => void;
}) {
  const [body, setBody] = useState(value.body);
  return (
    <Dialog
      title={value.body ? '编辑工作记录' : '添加工作记录'}
      onClose={onClose}
      submitLabel="保存记录"
      onSubmit={async () => {
        await save('save_record', { input: { ...value, body } });
      }}
    >
      <label>
        记录内容
        <textarea
          aria-label="工作记录内容"
          autoFocus
          required
          rows={6}
          maxLength={20000}
          placeholder="记录沟通、进展或下一步安排…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <p className="field-hint">保存后可通过“附件”添加文件或录音。</p>
    </Dialog>
  );
}
