import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import Dialog from '../../components/Dialog';
import Select from '../../components/Select';
import { proceedingName } from '../../domain/proceedings';
import type { Proceeding, SaveAction, WorkflowTemplate, Workspace } from '../../domain/types';

export default function WorkflowForm({
  caseId,
  programs,
  parent,
  data,
  save,
  onClose,
  onCreated,
}: {
  caseId: string;
  programs: Proceeding[];
  parent: string | null;
  data: Workspace;
  save: SaveAction;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [kind, setKind] = useState(data.workflowTemplates[0]?.id ?? '');
  const [name, setName] = useState(data.workflowTemplates[0]?.name ?? '');
  const [parentId, setParentId] = useState(parent);
  const [manager, setManager] = useState(false);
  const [editing, setEditing] = useState<WorkflowTemplate | null>(null);
  const [lines, setLines] = useState('');
  const [removing, setRemoving] = useState<WorkflowTemplate | null>(null);
  const template = data.workflowTemplates.find((t) => t.id === kind);
  function edit(t: WorkflowTemplate) {
    setEditing({ ...t });
    setLines(t.stages.join('\n'));
  }
  return (
    <>
      <Dialog
        title="新增办理流程"
        submitLabel="新增"
        onClose={onClose}
        onSubmit={async () => {
          if (!template) throw new Error('请选择流程模板，或新建自定义模板');
          const id = await save('add_proceeding', { caseId, kind, name: name.trim(), parentId });
          onCreated(id);
        }}
      >
        <label>
          流程模板
          <Select
            aria-label="流程模板"
            value={template?.id ?? ''}
            onValueChange={(id) => {
              setKind(id);
              setName(data.workflowTemplates.find((t) => t.id === id)?.name ?? '');
            }}
          >
            <option value="" disabled>
              选择模板
            </option>
            {data.workflowTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.category === 'litigation' ? '诉讼' : '非诉'}
              </option>
            ))}
          </Select>
        </label>
        <div className="workflow-template-actions">
          <button
            type="button"
            onClick={() =>
              edit({ id: crypto.randomUUID(), name: '', category: 'non_litigation', stages: [] })
            }
          >
            <Plus />
            自定义模板
          </button>
          <button type="button" onClick={() => setManager(true)}>
            管理模板
          </button>
        </div>
        <label>
          本次流程名称
          <input
            aria-label="流程名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
            placeholder="例如一审、合同审查"
          />
        </label>
        <label>
          承接自
          <Select
            aria-label="新流程的前序流程"
            value={parentId ?? ''}
            onValueChange={(v) => setParentId(v || null)}
          >
            <option value="">独立流程</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {proceedingName(p, programs)}
              </option>
            ))}
          </Select>
        </label>
        {template && (
          <p className="field-hint">
            初始阶段：{template.stages.join(' → ') || '不预设，可在流程内添加'}
          </p>
        )}
      </Dialog>
      {manager && (
        <Dialog title="管理流程模板" onClose={() => setManager(false)}>
          {data.workflowTemplates.map((t) => (
            <div key={t.id} className="workflow-template-row">
              <span>
                {t.name}
                <small>
                  {t.category === 'litigation' ? '诉讼' : '非诉'} · {t.stages.length} 个阶段
                </small>
              </span>
              <button
                className="icon-button"
                type="button"
                aria-label={`编辑${t.name}模板`}
                onClick={() => edit(t)}
              >
                <Pencil />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`删除${t.name}模板`}
                onClick={() => setRemoving(t)}
              >
                <Trash2 />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              edit({ id: crypto.randomUUID(), name: '', category: 'non_litigation', stages: [] })
            }
          >
            <Plus />
            新建模板
          </button>
        </Dialog>
      )}
      {editing && (
        <Dialog
          title={
            data.workflowTemplates.some((t) => t.id === editing.id)
              ? '编辑流程模板'
              : '新建流程模板'
          }
          className="workflow-template-editor"
          onClose={() => setEditing(null)}
          onSubmit={async () => {
            const input = {
              ...editing,
              name: editing.name.trim(),
              stages: lines
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
            };
            await save('save_workflow_template', { input });
            setKind(input.id);
            setName(input.name);
          }}
        >
          <label>
            模板名称
            <input
              aria-label="模板名称"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              maxLength={80}
              required
              autoFocus
            />
          </label>
          <label>
            业务类别
            <Select
              aria-label="模板业务类别"
              value={editing.category}
              onValueChange={(category) =>
                setEditing({ ...editing, category: category as WorkflowTemplate['category'] })
              }
            >
              <option value="litigation">诉讼</option>
              <option value="non_litigation">非诉</option>
            </Select>
          </label>
          <label>
            初始阶段（每行一个，可留空）
            <textarea
              aria-label="模板初始阶段"
              value={lines}
              onChange={(e) => setLines(e.target.value)}
              placeholder={'需求确认\n资料审阅\n成果交付'}
            />
          </label>
          <p className="field-hint">修改模板只影响以后新建的流程，已有流程保持原样。</p>
        </Dialog>
      )}
      {removing && (
        <Dialog
          title="删除流程模板"
          danger
          submitLabel="删除模板"
          onClose={() => setRemoving(null)}
          onSubmit={async () => {
            await save('delete_workflow_template', { id: removing.id });
          }}
        >
          <p>从可选模板中移除“{removing.name}”？已建立的流程及其资料会保留。</p>
        </Dialog>
      )}
    </>
  );
}
