import DateField from '../../components/DateField';
import Select from '../../components/Select';
import { cents, money } from '../../domain/money';
import { useState } from 'react';
import { Plus, Paperclip } from 'lucide-react';
import Dialog from '../../components/Dialog';
import type { CaseDetail, LedgerEntry, SaveAction, Workspace } from '../../domain/types';
import { proceedingName } from '../../domain/proceedings';
import { dateKey } from '../../domain/calendar';
import { command } from '../../services/repository';
import { useAction } from '../../components/useAction';
import FinanceChart from './FinanceChart';
import './finance-chart.css';
import ReceiptField, { type PendingReceipt } from './ReceiptField';
import './receipts.css';
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
  const [category, setCategory] = useState<string | null>(null);
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
        <Select
          aria-label="筛选收支"
          value={filter}
          onValueChange={(value) => {
            setFilter(value);
            setCategory(null);
          }}
        >
          <option value="all">全部收支</option>
          <option value="income">收入</option>
          <option value="expense">支出</option>
          <option value="pending">待报销</option>
        </Select>
      </div>
      <FinanceChart
        rows={rows}
        agreed={detail.agreedFeeCents}
        onCategory={(kind, name) => {
          setFilter(kind);
          setCategory(name);
        }}
      />
      {category && (
        <button className="inline-link" onClick={() => setCategory(null)}>
          正在查看：{category} · 清除分类筛选
        </button>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {rows
        .filter(
          (r) =>
            (filter === 'all' ||
              (filter === 'pending' ? r.reimbursement === 'pending' : r.kind === filter)) &&
            (!category || (r.category || '未分类') === category),
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
                  ? ` · ${proceedingName(data.proceedings.find((p) => p.id === row.proceedingId)!, data.proceedings)}`
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
            {!row.materialId && (
              <button className="receipt-link" onClick={() => setEdit(row)}>
                <Paperclip />
                添加凭据
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
  const [receipt, setReceipt] = useState<PendingReceipt | null>(null);
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
        if (receipt)
          await save('save_ledger_with_receipt', {
            input: { ...input, amountCents },
            sourcePath: receipt.path,
            receiptId: receipt.id,
          });
        else await save('save_ledger', { input: { ...input, amountCents } });
      }}
    >
      <div className="form-columns">
        <label>
          类型
          <Select
            aria-label="收支类型"
            value={input.kind}
            onValueChange={(value) =>
              update({
                kind: value as LedgerEntry['kind'],
                reimbursement: 'none',
                category: value === 'income' ? '律师费' : '交通费',
              })
            }
          >
            <option value="income">收入</option>
            <option value="expense">支出</option>
          </Select>
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
      <ReceiptField
        caseId={input.caseId}
        data={data}
        value={input.materialId}
        onChange={(materialId) => update({ materialId })}
        pending={receipt}
        onPending={setReceipt}
      />
      <div className="form-columns">
        <label>
          日期
          <DateField
            aria-label="收支日期"
            value={input.entryDate}
            onValueChange={(value) => update({ entryDate: value })}
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
        所属流程
        <Select
          aria-label="收支所属程序"
          value={input.proceedingId ?? ''}
          onValueChange={(value) => update({ proceedingId: value || null })}
        >
          <option value="">案件共用</option>
          {data.proceedings
            .filter((p) => p.caseId === input.caseId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {proceedingName(p, data.proceedings)}
              </option>
            ))}
        </Select>
      </label>
      {input.kind === 'expense' && (
        <label>
          当事人报销
          <Select
            aria-label="报销状态"
            value={input.reimbursement}
            onValueChange={(value) =>
              update({ reimbursement: value as LedgerEntry['reimbursement'] })
            }
          >
            <option value="none">无需报销</option>
            <option value="pending">待报销</option>
            <option value="received">已报销</option>
          </Select>
        </label>
      )}
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
