import { useState } from 'react';
import type { LedgerEntry } from '../../domain/types';
const colors = ['#7d9eae', '#af9a75', '#8c9d83', '#9c88a6', '#a6817b', '#779f99'];
const money = (n: number) =>
  (n / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function FinanceChart({
  rows,
  agreed,
  onCategory,
}: {
  rows: LedgerEntry[];
  agreed: number;
  onCategory: (kind: 'income' | 'expense', category: string | null) => void;
}) {
  const [kind, setKind] = useState<'income' | 'expense'>('income');
  const [chosen, setChosen] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const amounts = new Map<string, number>();
  rows
    .filter((r) => r.kind === kind)
    .forEach((r) =>
      amounts.set(
        r.category || '未分类',
        (amounts.get(r.category || '未分类') || 0) + r.amountCents,
      ),
    );
  const parts = [...amounts].sort((a, b) => b[1] - a[1]);
  const total = parts.reduce((sum, [, amount]) => sum + amount, 0);
  const paid = rows
    .filter((r) => r.kind === 'income' && r.category === '律师费')
    .reduce((sum, r) => sum + r.amountCents, 0);
  const active = parts.find(([name]) => name === (hover || chosen));
  let offset = 0;
  return (
    <div className="finance-visuals">
      <section className="finance-composition" aria-label="收支分类图">
        <header>
          <h4>{kind === 'income' ? '收入构成' : '支出构成'}</h4>
          <div className="chart-kind">
            {(['income', 'expense'] as const).map((type) => (
              <button
                key={type}
                aria-pressed={kind === type}
                onClick={() => {
                  setKind(type);
                  setChosen(null);
                  setHover(null);
                  onCategory(type, null);
                }}
              >
                {type === 'income' ? '收入' : '支出'}
              </button>
            ))}
          </div>
        </header>
        <div className="finance-chart-body">
          <div className="finance-donut">
            <svg
              viewBox="0 0 160 160"
              role="img"
              aria-label={`${kind === 'income' ? '收入' : '支出'}分类，总额 ${money(total)} 元`}
            >
              <circle
                cx="80"
                cy="80"
                r="62"
                fill="none"
                stroke="var(--line-strong)"
                strokeWidth="17"
              />
              {parts.map(([name, amount], i) => {
                const length = (amount / total) * 100;
                const start = offset;
                offset += length;
                return (
                  <circle
                    key={name}
                    cx="80"
                    cy="80"
                    r="62"
                    fill="none"
                    stroke={colors[i % colors.length]}
                    strokeWidth={(hover || chosen) === name ? 21 : 17}
                    pathLength="100"
                    strokeDasharray={`${length} ${100 - length}`}
                    strokeDashoffset={-start}
                    transform="rotate(-90 80 80)"
                    onMouseEnter={() => setHover(name)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <title>
                      {name} · ¥{money(amount)} · {length.toFixed(1)}%
                    </title>
                  </circle>
                );
              })}
            </svg>
            <div className="donut-total">
              <small>{active?.[0] || '合计'}</small>
              <strong>¥ {money(active?.[1] ?? total)}</strong>
            </div>
          </div>
          <div className="chart-legend">
            {parts.length ? (
              parts.map(([name, amount], i) => (
                <button
                  key={name}
                  aria-pressed={chosen === name}
                  onMouseEnter={() => setHover(name)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(name)}
                  onBlur={() => setHover(null)}
                  onClick={() => {
                    const next = chosen === name ? null : name;
                    setChosen(next);
                    onCategory(kind, next);
                  }}
                >
                  <i style={{ background: colors[i % colors.length] }} />
                  <span>
                    {name}
                    <small>{((amount / total) * 100).toFixed(1)}%</small>
                  </span>
                  <strong>¥ {money(amount)}</strong>
                </button>
              ))
            ) : (
              <p className="empty-text">暂无{kind === 'income' ? '收入' : '支出'}记录</p>
            )}
          </div>
        </div>
        <p className="field-hint">点击分类查看对应明细；图表按本案全部记录统计。</p>
      </section>
      <section className="fee-progress">
        <h4>律师费收款</h4>
        <strong>
          ¥ {money(paid)} <small>/ {money(agreed)}</small>
        </strong>
        <progress
          max={Math.max(agreed, 1)}
          value={Math.min(paid, agreed)}
          aria-label="已收律师费占约定金额"
        />
        <p>
          {!agreed
            ? '尚未设置约定律师费'
            : paid > agreed
              ? `已收超出约定 ¥ ${money(paid - agreed)}`
              : `待收 ¥ ${money(Math.max(0, agreed - paid))}`}
        </p>
        <small>只统计“律师费”收入，垫付款报销单独核算。</small>
      </section>
    </div>
  );
}
