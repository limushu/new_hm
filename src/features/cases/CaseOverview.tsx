import { useState } from 'react';
import { ArrowUpRight, Crosshair, Users } from 'lucide-react';
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
}: {
  item: CaseFile;
  data: Workspace;
  save: SaveAction;
  onCase: (id: string) => void;
  onProgram: (id: string) => void;
}) {
  const [contact, setContact] = useState<Contact | null>(null);
  const programs = data.proceedings.filter((p) => p.caseId === item.id);
  const focus = programs.find((p) => p.id === item.currentProceedingId);
  const links = data.contactLinks.filter(
    (l) => l.caseId === item.id && (!l.proceedingId || l.proceedingId === focus?.id),
  );
  const people = data.contacts.filter((c) => links.some((l) => l.contactId === c.id));
  return (
    <>
      <section className="case-focus-summary" aria-label="当前办理概况">
        <div>
          <span className="eyebrow">
            <Crosshair />
            当前关注
          </span>
          <strong className={!focus ? 'is-empty' : undefined}>
            {focus
              ? `${proceedingName(focus, programs)} · ${currentStage(data, focus)}`
              : '尚未指定关注流程'}
          </strong>
          {focus && (focus.caseNumber || focus.court || focus.judge) && (
            <p>{[focus.caseNumber, focus.court, focus.judge].filter(Boolean).join(' · ')}</p>
          )}
        </div>
        {focus && (
          <button onClick={() => onProgram(focus.id)}>
            查看当前流程
            <ArrowUpRight />
          </button>
        )}
      </section>
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
