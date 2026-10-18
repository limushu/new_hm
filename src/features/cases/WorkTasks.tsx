import { useState } from 'react';
import { Plus, CheckSquare, ArrowUpRight, ListChecks } from 'lucide-react';
import DateField from '../../components/DateField';
import Dialog from '../../components/Dialog';
import { useAction } from '../../components/useAction';
import type { SaveAction, Task, Workspace, WorkScope } from '../../domain/types';
import { caseScope, resourceInScope, resourceLinks, scopeName } from '../../domain/workspace';
import WorkScopeField from './WorkScopeField';
export default function WorkTasks({
  caseId,
  data,
  save,
  scope = caseScope,
  onWork,
  onTemplate,
}: {
  caseId: string;
  data: Workspace;
  save: SaveAction;
  scope?: WorkScope;
  onWork?: (scope: WorkScope) => void;
  onTemplate?: () => void;
}) {
  const [edit, setEdit] = useState<Task | null>(null);
  const { busy, error, run } = useAction();
  const rows = data.tasks.filter(
    (t) => t.caseId === caseId && resourceInScope(data, 'task', t.id, scope),
  );
  const pending = rows
    .filter((t) => !t.completed)
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const done = rows.filter((t) => t.completed);
  function row(t: Task) {
    const meta = data.taskWork.find((w) => w.taskId === t.id);
    const link = resourceLinks(data, 'task', t.id)[0];
    return (
      <div className={`work-task-row ${t.completed ? 'completed' : ''}`} key={t.id}>
        <input
          type="checkbox"
          aria-label={`完成${t.title}`}
          checked={t.completed}
          disabled={busy}
          onChange={(e) => {
            const completed = e.target.checked;
            void run(() => save('toggle_task', { id: t.id, completed }));
          }}
        />
        <button className="work-task-main" onClick={() => setEdit(t)}>
          <span>{t.title}</span>
          {!t.completed && meta?.waitingFor && (
            <small className="work-waiting">等待：{meta.waitingFor}</small>
          )}
          {t.completed && meta?.outcome && <small>{meta.outcome}</small>}
        </button>
        {t.dueDate && <time>{t.dueDate}</time>}
        {!scope.proceedingId && link && (
          <button className="work-origin" onClick={() => onWork?.(link)}>
            {scopeName(data, link)}
            <ArrowUpRight />
          </button>
        )}
      </div>
    );
  }
  return (
    <section className="case-section work-tasks" data-tone="amber" aria-label="工作待办">
      <div className="section-title">
        <h3>
          <CheckSquare />
          待办 <span>{pending.length}</span>
        </h3>
        <div className="work-actions">
          {onTemplate && (
            <button onClick={onTemplate}>
              <ListChecks />
              使用工作清单
            </button>
          )}
          <button
            className="work-add-action"
            onClick={() =>
              setEdit({
                id: crypto.randomUUID(),
                caseId,
                title: '',
                dueDate: null,
                completed: false,
              })
            }
          >
            <Plus />
            添加待办
          </button>
        </div>
      </div>
      {pending.map(row)}
      {!pending.length && <p className="quiet-empty">暂无待办</p>}
      {!!done.length && (
        <details className="case-history">
          <summary>已完成 · {done.length}</summary>
          {done.map(row)}
        </details>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {edit && (
        <WorkTaskEditor
          key={edit.id}
          task={edit}
          data={data}
          save={save}
          initialScope={scope}
          onClose={() => setEdit(null)}
        />
      )}
    </section>
  );
}
export function WorkTaskEditor({
  task,
  data,
  save,
  initialScope = caseScope,
  onClose,
}: {
  task: Task;
  data: Workspace;
  save: SaveAction;
  initialScope?: WorkScope;
  onClose: () => void;
}) {
  const meta = data.taskWork.find((w) => w.taskId === task.id);
  const link = resourceLinks(data, 'task', task.id)[0];
  const [value, setValue] = useState(task);
  const [scope, setScope] = useState<WorkScope>(link ?? initialScope);
  const [waiting, setWaiting] = useState(meta?.waitingFor ?? '');
  const [outcome, setOutcome] = useState(meta?.outcome ?? '');
  return (
    <Dialog
      title={data.tasks.some((t) => t.id === task.id) ? '编辑待办' : '新建待办'}
      onClose={onClose}
      submitLabel="保存待办"
      onSubmit={async () => {
        await save('save_work_task', {
          input: { task: value, ...scope, waitingFor: waiting, outcome },
        });
      }}
    >
      <label>
        待办内容
        <input
          aria-label="待办内容"
          required
          autoFocus
          maxLength={500}
          value={value.title}
          placeholder="要做什么？"
          onChange={(e) => setValue({ ...value, title: e.target.value })}
        />
      </label>
      <label>
        截止日期（可选）
        <DateField
          aria-label="截止日期"
          value={value.dueDate ?? ''}
          onValueChange={(v) => setValue({ ...value, dueDate: v || null })}
        />
      </label>
      <WorkScopeField caseId={task.caseId} data={data} value={scope} onChange={setScope} />
      <label>
        等待谁 / 什么（可选）
        <input
          aria-label="等待事项"
          value={waiting}
          maxLength={200}
          placeholder="例如：客户补充银行流水"
          onChange={(e) => setWaiting(e.target.value)}
        />
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={value.completed}
          onChange={(e) => setValue({ ...value, completed: e.target.checked })}
        />
        已完成
      </label>
      <label>
        处理结果（可选）
        <textarea
          aria-label="处理结果"
          rows={2}
          maxLength={10000}
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
        />
      </label>
    </Dialog>
  );
}
