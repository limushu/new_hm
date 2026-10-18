import { useState, type ReactNode } from 'react';
import { ArrowUpRight, Workflow, Users, Plus, Wallet } from 'lucide-react';
import { money } from '../../domain/money';
import { planDue, planPaid } from '../finance/FeePlans';
import type { CaseFile, Contact, Workspace, SaveAction } from '../../domain/types';
import { currentStage, proceedingName } from '../../domain/proceedings';
import ContactDetail from '../contacts/ContactDetail';
import CaseLinks from './CaseLinks';
import CaseParties from './CaseParties';
export default function CaseOverview({
  item,
  data,
  save,
  onCase,
  onProgram,
  onAdd,
  actions,
  onFinance,
}: {
  item: CaseFile;
  data: Workspace;
  save: SaveAction;
  onCase: (id: string) => void;
  onProgram: (id: string) => void;
  onAdd: () => void;
  actions: ReactNode;
  onFinance: () => void;
}) {
  const [contact, setContact] = useState<Contact | null>(null);
  const programs = data.proceedings.filter((p) => p.caseId === item.id);
  const focus = programs.find((p) => p.id === item.currentProceedingId);
  const links = data.contactLinks.filter((l) => l.caseId === item.id);
  const people = data.contacts.filter((c) => links.some((l) => l.contactId === c.id));
  const ledger = data.ledgerEntries.filter((e) => e.caseId === item.id);
  const due = data.feePlans
    .filter((p) => p.caseId === item.id && planDue(p))
    .reduce((n, p) => n + Math.max(0, p.amountCents - planPaid(data, p.id)), 0);
  const income = ledger
    .filter((e) => e.kind === 'income' && e.category === '律师费')
    .reduce((n, e) => n + e.amountCents, 0);
  const reimbursement = ledger
    .filter((e) => e.kind === 'expense' && e.reimbursement === 'pending')
    .reduce((n, e) => n + e.amountCents, 0);
  return (
    <>
      <section className="case-section work-overview" data-tone="blue" aria-label="办理概况">
        <div className="section-title">
          <h3>
            <Workflow />
            办理概况 <span>{programs.length}</span>
          </h3>
          <button onClick={onAdd}>
            <Plus />
            新增流程
          </button>
        </div>
        {programs.map((p) => {
          const links = data.workLinks.filter((l) => l.proceedingId === p.id && l.kind === 'task');
          const pending = data.tasks.filter(
            (t) => !t.completed && links.some((l) => l.resourceId === t.id),
          );
          const waiting = pending.filter((t) =>
            data.taskWork.some((w) => w.taskId === t.id && w.waitingFor),
          );
          return (
            <button className="work-overview-row" key={p.id} onClick={() => onProgram(p.id)}>
              <span>
                <strong>{proceedingName(p, programs)}</strong>
                <small>
                  {p.state === 'completed' ? '已办结' : currentStage(data, p)}
                  {item.currentProceedingId === p.id ? ' · 当前关注' : ''}
                </small>
              </span>
              <span>
                {pending.length} 项待办{waiting.length ? ` · ${waiting.length} 项等待` : ''}
              </span>
              <ArrowUpRight />
            </button>
          );
        })}
        {!programs.length && <p className="quiet-empty">尚无办理流程</p>}
      </section>
      {actions}
      <CaseParties
        key={focus?.id ?? 'no-focus'}
        caseId={item.id}
        program={focus}
        data={data}
        save={save}
        onCase={onCase}
      />
      <CaseLinks caseId={item.id} data={data} save={save} onCase={onCase} />
      <section className="case-section case-people-summary" data-tone="teal">
        <div className="section-title">
          <h3>
            <Users />
            相关人员与机构
          </h3>
        </div>
        {people.length ? (
          <div className="overview-people">
            {people.map((c) => (
              <button key={c.id} onClick={() => setContact(c)}>
                <span>{c.name}</span>
                <small>
                  {[...new Set(links.filter((l) => l.contactId === c.id).map((l) => l.role))].join(
                    ' / ',
                  )}
                </small>
                <ArrowUpRight />
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-text">暂无关联人员</p>
        )}
      </section>
      <section className="case-section" data-tone="teal" aria-label="费用概况">
        <div className="section-title">
          <h3>
            <Wallet />
            费用概况
          </h3>
          <button onClick={onFinance}>
            查看费用
            <ArrowUpRight />
          </button>
        </div>
        <div className="fee-plan-totals">
          <span>
            已收律师费 <strong>¥ {money(income)}</strong>
          </span>
          <span>
            到期待收{' '}
            <strong>
              {data.feePlans.some((p) => p.caseId === item.id) ? `¥ ${money(due)}` : '未设收费节点'}
            </strong>
          </span>
          <span>
            待报销 <strong>¥ {money(reimbursement)}</strong>
          </span>
        </div>
      </section>
      {contact && (
        <ContactDetail
          contact={contact}
          data={data}
          save={save}
          onClose={() => setContact(null)}
          onCase={onCase}
        />
      )}
    </>
  );
}
