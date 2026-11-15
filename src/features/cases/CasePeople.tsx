import { ResourceRelations } from './ResourceSettings';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Building2, Network, UserRound, ArrowUpRight } from 'lucide-react';
import Dialog from '../../components/Dialog';
import type { SaveAction, Workspace, Contact } from '../../domain/types';
import { proceedingName } from '../../domain/proceedings';
import ContactDetail from '../contacts/ContactDetail';
import CaseParties from './CaseParties';
import { CaseContacts } from '../contacts/Contacts';
const RelationGraph = lazy(() => import('../contacts/RelationGraph'));

export default function CasePeople({
  caseId,
  data,
  save,
  onCase,
  onClose,
}: {
  caseId: string;
  data: Workspace;
  save: SaveAction;
  onCase: (id: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Contact | null>(null);
  const [graph, setGraph] = useState(false);
  const programs = data.proceedings.filter((p) => p.caseId === caseId);
  const item = data.cases.find((c) => c.id === caseId);
  const links = data.contactLinks.filter((l) => l.caseId === caseId);
  const parties = data.caseParties.filter((p) => p.caseId === caseId);
  const people = data.contacts.filter(
    (c) =>
      links.some((l) => l.contactId === c.id) ||
      parties.some((p) => p.contactId === c.id) ||
      data.resourceRelations.some(
        (r) =>
          r.caseId === caseId &&
          [r.source, r.target].some((x) => x.kind === 'contact' && x.id === c.id),
      ),
  );
  const institutions = people.filter((c) => c.kind === 'court' || c.kind === 'organization');
  const persons = people.filter((c) => c.kind !== 'court' && c.kind !== 'organization');
  const unlinkedRoles = programs.flatMap((p) =>
    [
      { name: p.court, role: '办理法院', institution: true },
      { name: p.judge, role: '承办法官', institution: false },
    ]
      .filter((r) => r.name.trim() && !people.some((c) => c.name === r.name))
      .map((r) => ({ ...r, id: `${p.id}:${r.role}`, program: proceedingName(p, programs) })),
  );
  const scoped = useMemo(
    () => ({
      ...data,
      cases: data.cases.filter((c) => c.id === caseId),
      resourceRelations: data.resourceRelations.filter((r) => r.caseId === caseId),
      proceedings: programs,
      caseParties: parties,
      contactLinks: links,
      contacts: people,
      contactRelations: data.contactRelations.filter(
        (r) => people.some((c) => c.id === r.courtId) && people.some((c) => c.id === r.judgeId),
      ),
    }),
    [data, caseId],
  );
  function row(c: Contact) {
    const roles = [
      ...new Set([
        ...links
          .filter((l) => l.contactId === c.id)
          .map((l) => {
            const program = programs.find((p) => p.id === l.proceedingId);
            return `${l.role}${program ? ` · ${proceedingName(program, programs)}` : ''}`;
          }),
        ...parties
          .filter((p) => p.contactId === c.id)
          .map((p) =>
            p.side === 'client'
              ? '我方委托人'
              : p.side === 'opponent'
                ? '对方当事人'
                : '其他参与人',
          ),
        ...data.proceedingPartyRoles
          .filter((r) => parties.some((p) => p.id === r.partyId && p.contactId === c.id))
          .flatMap((r) => {
            const program = programs.find((p) => p.id === r.proceedingId);
            return program && r.role ? [`${r.role} · ${proceedingName(program, programs)}`] : [];
          }),
      ]),
    ];
    return (
      <button className="case-person-row" key={c.id} onClick={() => setSelected(c)}>
        <span className={`case-person-avatar ${c.kind}`}>
          {c.kind === 'court' || c.kind === 'organization' ? <Building2 /> : c.name.slice(0, 1)}
        </span>
        <span>
          <strong>{c.name}</strong>
          <small>{roles.join(' / ') || (c.kind === 'judge' ? '法官' : '相关人')}</small>
        </span>
        <ArrowUpRight />
      </button>
    );
  }
  return (
    <>
      <Dialog title="相关人及机构" className="case-people-dialog" onClose={onClose}>
        <div className="case-people-heading">
          <p>
            {
              new Set([
                ...persons.map((p) => p.name),
                ...parties.filter((p) => !p.contactId).map((p) => p.name),
                ...unlinkedRoles.filter((r) => !r.institution).map((r) => r.name),
              ]).size
            }{' '}
            位相关人 ·{' '}
            {
              new Set([
                ...institutions.map((p) => p.name),
                ...unlinkedRoles.filter((r) => r.institution).map((r) => r.name),
              ]).size
            }{' '}
            家机构
          </p>
          <button onClick={() => setGraph(true)}>
            <Network />
            查看关系图
          </button>
        </div>
        {(institutions.length > 0 || unlinkedRoles.some((r) => r.institution)) && (
          <section className="case-person-group">
            <h3>法院与机构</h3>
            {institutions.map(row)}
            {unlinkedRoles
              .filter((r) => r.institution)
              .map((r) => (
                <div className="case-person-row" key={r.id}>
                  <span className="case-person-avatar court">
                    <Building2 />
                  </span>
                  <span>
                    <strong>{r.name}</strong>
                    <small>
                      {r.role} · {r.program}
                    </small>
                  </span>
                </div>
              ))}
          </section>
        )}
        <section className="case-person-group">
          <h3>相关人物</h3>
          {persons.map(row)}
          {unlinkedRoles
            .filter((r) => !r.institution)
            .map((r) => (
              <div className="case-person-row" key={r.id}>
                <span className="case-person-avatar">
                  <UserRound />
                </span>
                <span>
                  <strong>{r.name}</strong>
                  <small>
                    {r.role} · {r.program}
                  </small>
                </span>
              </div>
            ))}
          {parties
            .filter((p) => !p.contactId)
            .map((p) => (
              <div className="case-person-row" key={p.id}>
                <span className="case-person-avatar">
                  <UserRound />
                </span>
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {p.side === 'client'
                      ? '我方委托人'
                      : p.side === 'opponent'
                        ? '对方当事人'
                        : '其他参与人'}{' '}
                    · 尚未关联联系对象
                  </small>
                </span>
              </div>
            ))}
          {!persons.length && !parties.length && !unlinkedRoles.some((r) => !r.institution) && (
            <p className="quiet-empty">尚未关联相关人物</p>
          )}
        </section>
        <ResourceRelations caseId={caseId} data={data} save={save} actorsOnly />
        <details className="case-people-maintain">
          <summary>维护当事人与关联对象</summary>
          <CaseParties
            caseId={caseId}
            program={programs.find((p) => p.id === item?.currentProceedingId)}
            data={data}
            save={save}
            onCase={onCase}
          />
          <CaseContacts caseId={caseId} data={data} save={save} onCase={onCase} />
        </details>
      </Dialog>
      {selected && (
        <ContactDetail
          contact={selected}
          data={data}
          save={save}
          onCase={onCase}
          onClose={() => setSelected(null)}
        />
      )}
      {graph && (
        <Dialog
          title="案件关系图"
          className="case-relationship-dialog"
          onClose={() => setGraph(false)}
        >
          <Suspense fallback={<p>正在打开关系图…</p>}>
            <RelationGraph
              data={scoped}
              focusId={`case:${caseId}`}
              onCase={onCase}
              onContact={(id) => {
                const c = data.contacts.find((c) => c.id === id);
                if (c) setSelected(c);
              }}
            />
          </Suspense>
        </Dialog>
      )}
    </>
  );
}
