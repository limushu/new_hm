import { useState } from 'react';
import Dialog from '../../components/Dialog';
import { useAction } from '../../components/useAction';
import type { SaveAction, Workspace, WorkLink, WorkScope } from '../../domain/types';
import { caseScope, resourceLinks, scopeName } from '../../domain/workspace';
import WorkScopeField from './WorkScopeField';
export default function ResourceAssociation({
  caseId,
  kind,
  resourceId,
  data,
  save,
  onClose,
  initialScope = caseScope,
}: {
  caseId: string;
  kind: WorkLink['kind'];
  resourceId: string;
  data: Workspace;
  save: SaveAction;
  onClose: () => void;
  initialScope?: WorkScope;
}) {
  const [scope, setScope] = useState<WorkScope>(
    kind === 'material' ? initialScope : (resourceLinks(data, kind, resourceId)[0] ?? initialScope),
  );
  const [label, setLabel] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Dialog
      title="工作关联"
      onClose={onClose}
      submitLabel="关联"
      onSubmit={async () => {
        if (!scope.proceedingId) throw new Error('请选择流程');
        await save('save_work_link', {
          input: {
            id: crypto.randomUUID(),
            caseId,
            kind,
            resourceId,
            proceedingId: scope.proceedingId,
            stageId: scope.stageId,
            label,
          },
        });
      }}
    >
      {resourceLinks(data, kind, resourceId).map((l) => (
        <div className="feature-row" key={l.id}>
          <span className="row-main">
            {scopeName(data, l)}
            {l.label && <small>{l.label}</small>}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => save('delete_work_link', { id: l.id }))}
          >
            解除关联
          </button>
        </div>
      ))}
      <WorkScopeField caseId={caseId} data={data} value={scope} onChange={setScope} />
      {kind === 'material' && (
        <label>
          用途（可选）
          <input
            aria-label="材料用途"
            placeholder="证据、草稿、成果或提交回执"
            maxLength={200}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </Dialog>
  );
}
