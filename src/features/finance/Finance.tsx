import { cents, money } from '../../domain/money';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import Dialog from '../../components/Dialog';
import type { CaseDetail, LedgerEntry, SaveAction, Workspace } from '../../domain/types';
import { programLabels } from '../../domain/types';
import { dateKey } from '../../domain/calendar';
import { command } from '../../services/repository';
import { useAction } from '../../components/useAction';
export default function Finance({
  caseId,
  data,
  save,
}: {
  caseId: string;
  data: Workspace;
  save: SaveAction;
}) {
  const detail = data.caseDetails.find((d) => d.caseId === caseId) ?? {
    caseId,
    agreedFeeCents: 0,
    relatedCaseId: null,
    notes: '',
  };
  const [edit, setEdit] = useState<LedgerEntry | null>(null);
  const [fee, setFee] = useState<string | null>(null);
  const [remove, setRemove] = useState<LedgerEntry | null>(null);
  const [filter, setFilter] = useState('all');
  const { error, run } = useAction();
  const rows = data.ledgerEntries.filter((row) => row.caseId === caseId);
  const total = (predicate: (row: LedgerEntry) => boolean) =>
    rows.filter(predicate).reduce((sum, row) => sum + row.amountCents, 0);
  const income = total((r) => r.kind === 'income');
  const expense = total((r) => r.kind === 'expense');
  const fees = total((r) => r.kind === 'income' && r.category === '律师费');
  const pending = total((r) => r.kind === 'expense' && r.reimbursement === 'pending');
  const received = total((r) => r.kind === 'expense' && r.reimbursement === 'received');
  return (
    <section className="feature-section">
      <header>
        <h3>案件收支</h3>
        <button
          onClick={() =>
            setEdit({
              id: crypto.randomUUID(),
              caseId,
              proceedingId: null,
              kind: 'income',
              amountCents: 0,
              entryDate: dateKey(new Date()),
              category: '律师费',
              notes: '',
              reimbursement: 'none',
              materialId: null,
            })
          }
        >
          <Plus />
          记一笔
        </button>
      </header>
      <div className="finance-summary">
        {[
          ['收入合计', income],
          ['支出合计', expense],
          ['待报销', pending],
          ['已报销', received],
        ].map(([label, value]) => (
          <div key={label}>
            <small>{label}</small>
            <strong>¥ {money(value as number)}</strong>
          </div>
        ))}
      </div>
      <div className="fee-summary">
        <span>
          约定律师费 <strong>¥ {money(detail.agreedFeeCents)}</strong>
        </span>
        <span>已收律师费 ¥ {money(fees)}</span>
        <span>待收 ¥ {money(Math.max(0, detail.agreedFeeCents - fees))}</span>
        <button onClick={() => setFee((detail.agreedFeeCents / 100).toFixed(2))}>修改约定</button>
      </div>
      <p className="field-hint">
        待收仅按“律师费”类别的收入统计。垫付款报销单独跟踪，不重复计入律师费收入。
      </p>
      <div className="feature-toolbar">
        <select aria-label="筛选收支" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">全部收支</option>
          <option value="income">收入</option>
          <option value="expense">支出</option>
          <option value="pending">待报销</option>
        </select>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {rows
        .filter(
          (r) =>
            filter === 'all' ||
            (filter === 'pending' ? r.reimbursement === 'pending' : r.kind === filter),
        )
        .map((row) => (
          <div className="feature-row ledger-row" key={row.id}>
            <time>{row.entryDate}</time>
            <button className="row-main" onClick={() => setEdit(row)}>
              <span>{row.category || (row.kind === 'income' ? '收入' : '支出')}</span>
              <small>
                {row.notes}
                {row.reimbursement !== 'none'
                  ? ` · ${row.reimbursement === 'pending' ? '待报销' : '已报销'}`
                  : ''}
                {row.proceedingId
                  ? ` · ${programLabels[data.proceedings.find((p) => p.id === row.proceedingId)!.kind]}`
                  : ''}
              </small>
            </button>
            <span className={row.kind === 'income' ? 'money-income' : 'money-expense'}>
              {row.kind === 'income' ? '+' : '−'} {money(row.amountCents)}
            </span>
            {row.materialId && (
              <button
                className="receipt-link"
                title="使用系统应用打开凭证"
                onClick={() => void run(() => command('open_material', { id: row.materialId! }))}
              >
                凭证
              </button>
            )}
          </div>
        ))}
      {!rows.length && <p className="quiet-empty">暂无收支，先记录一笔收入或支出。</p>}
      {edit && (
        <EntryForm
          value={edit}
          data={data}
          save={save}
          onClose={() => setEdit(null)}
          onDelete={
            data.ledgerEntries.some((r) => r.id === edit.id) ? () => setRemove(edit) : undefined
          }
        />
      )}
      {fee !== null && (
        <Dialog
          title="约定律师费"
          onClose={() => setFee(null)}
          onSubmit={async () => {
            await save('save_case_detail', {
              input: { ...detail, agreedFeeCents: cents(fee) } satisfies CaseDetail,
            });
          }}
        >
          <label>
            约定金额（元）
            <input
              aria-label="约定律师费"
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              required
            />
          </label>
        </Dialog>
      )}
      {remove && (
        <Dialog
          title="删除收支记录"
          onClose={() => setRemove(null)}
          danger
          submitLabel="删除"
          onSubmit={async () => {
            await save('delete_ledger', { id: remove.id });
            setEdit(null);
          }}
        >
          <p className="feature-description">
            删除 {remove.entryDate} 的这笔 ¥ {money(remove.amountCents)}{' '}
            {remove.kind === 'income' ? '收入' : '支出'}？
          </p>
        </Dialog>
      )}
    </section>
  );
}
function EntryForm({
  value,
  data,
  save,
  onClose,
  onDelete,
}: {
  value: LedgerEntry;
  data: Workspace;
  save: SaveAction;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [input, setInput] = useState(value);
  const [amount, setAmount] = useState(
    value.amountCents ? (value.amountCents / 100).toFixed(2) : '',
  );
  const update = (patch: Partial<LedgerEntry>) => setInput((v) => ({ ...v, ...patch }));
  return (
    <Dialog
      title={value.amountCents ? '编辑收支' : '记一笔收支'}
      onClose={onClose}
      onSubmit={async () => {
        const amountCents = cents(amount);
        if (!amountCents) throw new Error('金额必须大于0');
        await save('save_ledger', { input: { ...input, amountCents } });
      }}
    >
      <div className="form-columns">
        <label>
          类型
          <select
            aria-label="收支类型"
            value={input.kind}
            onChange={(e) =>
              update({
                kind: e.target.value as LedgerEntry['kind'],
                reimbursement: 'none',
                category: e.target.value === 'income' ? '律师费' : '交通费',
              })
            }
          >
            <option value="income">收入</option>
            <option value="expense">支出</option>
          </select>
        </label>
        <label>
          金额（元）
          <input
            aria-label="收支金额"
            required
            inputMode="decimal"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
      </div>
      <div className="form-columns">
        <label>
          日期
          <input
            type="date"
            aria-label="收支日期"
            value={input.entryDate}
            onChange={(e) => update({ entryDate: e.target.value })}
            required
          />
        </label>
        <label>
          类别
          <input
            aria-label="收支类别"
            value={input.category}
            maxLength={60}
            onChange={(e) => update({ category: e.target.value })}
          />
        </label>
      </div>
      <label>
        所属程序
        <select
          aria-label="收支所属程序"
          value={input.proceedingId ?? ''}
          onChange={(e) => update({ proceedingId: e.target.value || null })}
        >
          <option value="">案件共用</option>
          {data.proceedings
            .filter((p) => p.caseId === input.caseId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {programLabels[p.kind]}
              </option>
            ))}
        </select>
      </label>
      {input.kind === 'expense' && (
        <label>
          当事人报销
          <select
            aria-label="报销状态"
            value={input.reimbursement}
            onChange={(e) =>
              update({ reimbursement: e.target.value as LedgerEntry['reimbursement'] })
            }
          >
            <option value="none">无需报销</option>
            <option value="pending">待报销</option>
            <option value="received">已报销</option>
          </select>
        </label>
      )}
      <label>
        凭证（可选）
        <select
          aria-label="收支凭证"
          value={input.materialId ?? ''}
          onChange={(e) => update({ materialId: e.target.value || null })}
        >
          <option value="">不关联凭证</option>
          {data.materials
            .filter((m) => m.caseId === input.caseId && !m.deletedAt && m.kind === 'file')
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        备注
        <textarea
          aria-label="收支备注"
          value={input.notes}
          maxLength={10000}
          rows={3}
          onChange={(e) => update({ notes: e.target.value })}
        />
      </label>
      {onDelete && (
        <button type="button" className="inline-link danger" onClick={onDelete}>
          删除这笔收支
        </button>
      )}
    </Dialog>
  );
}
