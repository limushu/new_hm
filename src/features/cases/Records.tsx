import { useState } from 'react';
import { Plus, Paperclip, NotebookPen } from 'lucide-react';
import Dialog from '../../components/Dialog';
import Materials from '../materials/Materials';
import type { RecordInput, SaveAction, Workspace, WorkRecord, WorkScope } from '../../domain/types';
import { caseScope, resourceInScope, resourceLinks } from '../../domain/workspace';
import WorkScopeField from './WorkScopeField';
export default function Records({
  caseId,
  data,
  save,
  scope = caseScope,
}: {
  caseId: string;
  data: Workspace;
  save: SaveAction;
  scope?: WorkScope;
}) {
  const [edit, setEdit] = useState<RecordInput | null>(null);
  const [remove, setRemove] = useState<WorkRecord | null>(null);
  const [attachments, setAttachments] = useState<WorkRecord | null>(null);
  const rows = data.workRecords.filter(
    (r) => r.caseId === caseId && resourceInScope(data, 'record', r.id, scope),
  );
  return (
    <section className="case-section" data-tone="violet">
      <div className="section-title">
        <h3>
          <NotebookPen aria-hidden="true" />
          工作记录
        </h3>
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
      {edit && (
        <RecordForm
          value={edit}
          data={data}
          scope={resourceLinks(data, 'record', edit.id)[0] ?? scope}
          save={save}
          onClose={() => setEdit(null)}
        />
      )}
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
  data,
  scope,
}: {
  value: RecordInput;
  save: SaveAction;
  onClose: () => void;
  data: Workspace;
  scope: WorkScope;
}) {
  const [body, setBody] = useState(value.body);
  const [context, setContext] = useState(scope);
  return (
    <Dialog
      title={value.body ? '编辑工作记录' : '添加工作记录'}
      onClose={onClose}
      submitLabel="保存记录"
      onSubmit={async () => {
        await save('save_work_record', { input: { ...value, body }, ...context });
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
      <WorkScopeField caseId={value.caseId} data={data} value={context} onChange={setContext} />
    </Dialog>
  );
}
