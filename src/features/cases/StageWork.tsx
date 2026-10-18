import { useState } from 'react';
import { Files, Plus, ArrowUpRight, Wallet } from 'lucide-react';
import type { SaveAction, Workspace, WorkScope, WorkLink, LedgerEntry } from '../../domain/types';
import {
  resourceInScope,
  resourceLinks,
  scopeName,
  stageSuggestions,
} from '../../domain/workspace';
import { money } from '../../domain/money';
import { dateKey } from '../../domain/calendar';
import Dialog from '../../components/Dialog';
import Select from '../../components/Select';
import WorkTasks from './WorkTasks';
import CaseSchedule from './CaseSchedule';
import Materials from '../materials/Materials';
import Records from './Records';
import { EntryForm } from '../finance/Finance';
import FeePlans from '../finance/FeePlans';
export default function StageWork({
  caseId,
  data,
  save,
  scope,
  onMaterials,
  onFinance,
}: {
  caseId: string;
  data: Workspace;
  save: SaveAction;
  scope: WorkScope;
  onMaterials: (scope: WorkScope) => void;
  onFinance: (scope: WorkScope) => void;
}) {
  const [link, setLink] = useState<WorkLink['kind'] | null>(null);
  const [checklist, setChecklist] = useState<string | null>(null);
  const [entry, setEntry] = useState<LedgerEntry | null>(null);
  const stage = data.stages.find((s) => s.id === scope.stageId);
  const ledger = data.ledgerEntries.filter(
    (e) =>
      e.caseId === caseId &&
      (scope.stageId
        ? resourceInScope(data, 'ledger', e.id, scope)
        : e.proceedingId === scope.proceedingId),
  );
  return (
    <div className="stage-work" aria-label={`办理工作 · ${scopeName(data, scope)}`}>
      <WorkTasks
        caseId={caseId}
        data={data}
        save={save}
        scope={scope}
        onTemplate={stage ? () => setChecklist(stageSuggestions(stage.name).join('\n')) : undefined}
      />
      <CaseSchedule
        caseId={caseId}
        data={data}
        save={save}
        scope={scope}
        onAssociate={() => setLink('event')}
      />
      <section
        className="case-section stage-materials"
        data-tone="violet"
        aria-label="阶段材料与成果"
      >
        <div className="section-title">
          <h3>
            <Files />
            材料与成果
          </h3>
          <div className="work-actions">
            <button onClick={() => setLink('material')}>关联已有材料</button>
            <button onClick={() => onMaterials(scope)}>
              在材料库查看
              <ArrowUpRight />
            </button>
          </div>
        </div>
        <Materials caseId={caseId} data={data} save={save} workScope={scope} />
      </section>
      <Records caseId={caseId} data={data} save={save} scope={scope} />
      <section className="case-section" data-tone="teal" aria-label="阶段费用">
        <div className="section-title">
          <h3>
            <Wallet />
            相关收支
          </h3>
          <div className="work-actions">
            <button
              onClick={() =>
                setEntry({
                  id: crypto.randomUUID(),
                  caseId,
                  proceedingId: scope.proceedingId,
                  kind: 'expense',
                  amountCents: 0,
                  entryDate: dateKey(new Date()),
                  category: '交通费',
                  notes: '',
                  reimbursement: 'none',
                  materialId: null,
                })
              }
            >
              <Plus />
              记一笔
            </button>
            <button onClick={() => onFinance(scope)}>
              查看相关费用
              <ArrowUpRight />
            </button>
          </div>
        </div>
        {ledger.slice(0, 5).map((e) => (
          <button className="work-cost-row" key={e.id} onClick={() => setEntry(e)}>
            <time>{e.entryDate}</time>
            <span>
              {e.category}
              {e.notes ? ' · ' + e.notes : ''}
            </span>
            <strong className={e.kind === 'income' ? 'money-income' : 'money-expense'}>
              {e.kind === 'income' ? '+' : '−'} ¥ {money(e.amountCents)}
            </strong>
          </button>
        ))}
        {!ledger.length && <p className="quiet-empty">暂无相关收支</p>}
      </section>
      <FeePlans caseId={caseId} data={data} save={save} scope={scope} />
      {entry && (
        <EntryForm
          value={entry}
          data={data}
          save={save}
          initialScope={resourceLinks(data, 'ledger', entry.id)[0] ?? scope}
          onClose={() => setEntry(null)}
        />
      )}
      {link && (
        <LinkExisting
          kind={link}
          caseId={caseId}
          data={data}
          save={save}
          scope={scope}
          onClose={() => setLink(null)}
        />
      )}
      {checklist !== null && stage && (
        <Dialog
          title={`工作清单 · ${stage.name}`}
          submitLabel="添加到本阶段"
          onClose={() => setChecklist(null)}
          onSubmit={async () => {
            const titles = checklist
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean);
            if (!titles.length) throw new Error('请至少填写一项任务');
            await save('apply_stage_tasks', { stageId: stage.id, titles });
          }}
        >
          <label>
            每行一项，可直接修改
            <textarea
              aria-label="阶段工作清单"
              rows={6}
              value={checklist}
              onChange={(e) => setChecklist(e.target.value)}
            />
          </label>
          <p className="field-hint">仅添加本阶段尚无的同名任务，阶段重开不会重复生成。</p>
        </Dialog>
      )}
    </div>
  );
}
function LinkExisting({
  kind,
  caseId,
  data,
  save,
  scope,
  onClose,
}: {
  kind: WorkLink['kind'];
  caseId: string;
  data: Workspace;
  save: SaveAction;
  scope: WorkScope;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const rows =
    kind === 'material'
      ? data.materials
          .filter((m) => m.caseId === caseId && !m.deletedAt && m.kind === 'file')
          .map((m) => ({ id: m.id, title: m.name }))
      : data.calendarEvents
          .filter((e) => e.caseId === caseId)
          .map((e) => ({ id: e.id, title: `${e.startDate} · ${e.title}` }));
  return (
    <Dialog
      title={kind === 'material' ? '关联已有材料' : '关联已有日程'}
      onClose={onClose}
      submitLabel="关联"
      onSubmit={async () => {
        if (!id || !scope.proceedingId) throw new Error('请选择记录');
        await save('save_work_link', {
          input: {
            id: crypto.randomUUID(),
            caseId,
            kind,
            resourceId: id,
            proceedingId: scope.proceedingId,
            stageId: scope.stageId,
            label,
          },
        });
      }}
    >
      <label>
        搜索
        <input
          aria-label="搜索已有记录"
          value={query}
          placeholder="输入名称"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <label>
        选择记录
        <Select aria-label="选择已有记录" value={id} onValueChange={setId}>
          <option value="">请选择</option>
          {rows
            .filter((r) => r.title.toLowerCase().includes(query.toLowerCase()))
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
        </Select>
      </label>
      {kind === 'material' && (
        <label>
          用途
          <input
            aria-label="材料用途"
            placeholder="例如：证据、成果、提交回执"
            value={label}
            maxLength={200}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
      )}
      {id && resourceLinks(data, kind, id).length > 0 && (
        <p className="field-hint">
          {kind === 'material' ? '同时用于：' : '当前归属（关联后调整为此阶段）：'}
          {resourceLinks(data, kind, id)
            .map((l) => scopeName(data, l))
            .join(' / ')}
        </p>
      )}
    </Dialog>
  );
}
