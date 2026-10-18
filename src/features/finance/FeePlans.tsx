import { useState } from 'react';
import { Plus } from 'lucide-react';
import Dialog from '../../components/Dialog';
import DateField from '../../components/DateField';
import Select from '../../components/Select';
import WorkScopeField from '../cases/WorkScopeField';
import type { FeePlan, SaveAction, Workspace, WorkScope } from '../../domain/types';
import { caseScope, matchesScope, scopeName } from '../../domain/workspace';
import { dateKey } from '../../domain/calendar';
import { cents, money } from '../../domain/money';
export function planPaid(data: Workspace, id: string) {
  return data.feeAllocations.filter((a) => a.planId === id).reduce((v, a) => v + a.amountCents, 0);
}
export function planDue(plan: FeePlan) {
  return plan.ready || (!plan.condition && !!plan.dueDate && plan.dueDate <= dateKey(new Date()));
}
export default function FeePlans({
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
  const [edit, setEdit] = useState<FeePlan | null>(null);
  const [allocation, setAllocation] = useState<FeePlan | null>(null);
  const [remove, setRemove] = useState<FeePlan | null>(null);
  const rows = data.feePlans.filter((p) => p.caseId === caseId && matchesScope(p, scope));
  const due = rows
    .filter(planDue)
    .reduce((n, p) => n + Math.max(0, p.amountCents - planPaid(data, p.id)), 0);
  const pending = rows
    .filter((p) => !planDue(p))
    .reduce((n, p) => n + Math.max(0, p.amountCents - planPaid(data, p.id)), 0);
  return (
    <section className="fee-plans case-section" aria-label="收费安排">
      <div className="section-title">
        <h3>收费安排</h3>
        <button
          onClick={() =>
            setEdit({
              id: crypto.randomUUID(),
              caseId,
              ...scope,
              title: '',
              amountCents: 0,
              dueDate: null,
              condition: '',
              ready: false,
            })
          }
        >
          <Plus />
          添加收费节点
        </button>
      </div>
      {!!rows.length && (
        <div className="fee-plan-totals">
          <span>
            到期待收 <strong>¥ {money(due)}</strong>
          </span>
          <span>
            未到期待收 <strong>¥ {money(pending)}</strong>
          </span>
        </div>
      )}
      {rows.map((p) => {
        const paid = planPaid(data, p.id),
          remaining = Math.max(0, p.amountCents - paid);
        return (
          <article className="fee-plan-row" key={p.id}>
            <button className="row-main" onClick={() => setEdit(p)}>
              <strong>{p.title}</strong>
              <small>
                {[scopeName(data, p), p.dueDate, p.condition].filter(Boolean).join(' · ')}
              </small>
            </button>
            <span className={`work-state ${remaining && planDue(p) ? 'is-due' : ''}`}>
              {remaining === 0 ? '已收齐' : planDue(p) ? '到期待收' : '未到期'}
            </span>
            <span>
              ¥ {money(p.amountCents)}
              <small>已核销 {money(paid)}</small>
            </span>
            <button onClick={() => setAllocation(p)}>核销收款</button>
            <button aria-label={`删除收费节点${p.title}`} onClick={() => setRemove(p)}>
              删除
            </button>
          </article>
        );
      })}
      {!rows.length && <p className="quiet-empty">尚无收费安排</p>}
      {edit && <PlanForm value={edit} data={data} save={save} onClose={() => setEdit(null)} />}
      {allocation && (
        <AllocationForm
          value={allocation}
          data={data}
          save={save}
          onClose={() => setAllocation(null)}
        />
      )}
      {remove && (
        <Dialog
          title="删除收费节点"
          danger
          submitLabel="删除"
          onClose={() => setRemove(null)}
          onSubmit={async () => {
            await save('delete_fee_plan', { id: remove.id });
          }}
        >
          <p>删除“{remove.title}”及其核销关联？实际收支记录会保留。</p>
        </Dialog>
      )}
    </section>
  );
}
function PlanForm({
  value,
  data,
  save,
  onClose,
}: {
  value: FeePlan;
  data: Workspace;
  save: SaveAction;
  onClose: () => void;
}) {
  const [p, setP] = useState(value);
  const [amount, setAmount] = useState(
    value.amountCents ? money(value.amountCents).replaceAll(',', '') : '',
  );
  return (
    <Dialog
      title="收费节点"
      onClose={onClose}
      onSubmit={async () => {
        const amountCents = cents(amount);
        if (!amountCents) throw new Error('金额必须大于0');
        await save('save_fee_plan', { input: { ...p, amountCents } });
      }}
    >
      <label>
        名称
        <input
          aria-label="收费节点名称"
          required
          autoFocus
          maxLength={200}
          value={p.title}
          placeholder="例如：签约首期款"
          onChange={(e) => setP({ ...p, title: e.target.value })}
        />
      </label>
      <label>
        应收金额（元）
        <input
          aria-label="节点应收金额"
          required
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <WorkScopeField
        caseId={p.caseId}
        data={data}
        value={p}
        onChange={(s) => setP({ ...p, ...s })}
      />
      <label>
        约定付款日期（可选）
        <DateField
          aria-label="约定付款日期"
          value={p.dueDate ?? ''}
          onValueChange={(v) => setP({ ...p, dueDate: v || null })}
        />
      </label>
      <label>
        付款条件（可选）
        <textarea
          aria-label="付款条件"
          rows={2}
          value={p.condition}
          maxLength={10000}
          placeholder="例如：收到裁判文书后支付"
          onChange={(e) => setP({ ...p, condition: e.target.value })}
        />
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={p.ready}
          onChange={(e) => setP({ ...p, ready: e.target.checked })}
        />
        已确认满足收款条件
      </label>
    </Dialog>
  );
}
function AllocationForm({
  value,
  data,
  save,
  onClose,
}: {
  value: FeePlan;
  data: Workspace;
  save: SaveAction;
  onClose: () => void;
}) {
  const [ledgerId, setLedger] = useState('');
  const [amount, setAmount] = useState('');
  const income = data.ledgerEntries.filter(
    (e) => e.caseId === value.caseId && e.kind === 'income' && e.category === '律师费',
  );
  return (
    <Dialog
      title={`核销收款 · ${value.title}`}
      onClose={onClose}
      onSubmit={async () => {
        if (!ledgerId) throw new Error('请选择实际收款');
        await save('save_fee_allocation', {
          input: { planId: value.id, ledgerId, amountCents: cents(amount) },
        });
      }}
    >
      <label>
        实际收到的律师费
        <Select
          aria-label="核销收款记录"
          value={ledgerId}
          onValueChange={(id) => {
            setLedger(id);
            const used = data.feeAllocations.find(
              (a) => a.planId === value.id && a.ledgerId === id,
            );
            setAmount(used ? String(used.amountCents / 100) : '');
          }}
        >
          <option value="">选择收款</option>
          {income.map((e) => (
            <option value={e.id} key={e.id}>
              {e.entryDate} · ¥ {money(e.amountCents)}
              {e.notes ? ' · ' + e.notes : ''}
            </option>
          ))}
        </Select>
      </label>
      <label>
        本节点核销金额（元）
        <input
          aria-label="核销金额"
          required
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      {data.feeAllocations
        .filter((a) => a.planId === value.id)
        .map((a) => (
          <p key={a.ledgerId}>
            {income.find((e) => e.id === a.ledgerId)?.entryDate} · 已核销 ¥ {money(a.amountCents)}
          </p>
        ))}
      <p className="field-hint">关联实际收款，不新增账目。修改为 0 可解除本笔核销。</p>
    </Dialog>
  );
}
