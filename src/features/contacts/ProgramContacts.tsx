import { useState } from 'react';
import { ArrowUpRight, Building2, UserRound } from 'lucide-react';
import type { Contact, Proceeding, SaveAction, Workspace } from '../../domain/types';
import { programContacts } from '../../domain/relations';
import { useAction } from '../../components/useAction';
import ContactPicker from './ContactPicker';
import ContactForm from './ContactForm';
import ContactDetail from './ContactDetail';
import { emptyContact } from './model';
export default function ProgramContacts({
  program,
  data,
  save,
  onCase,
}: {
  program: Proceeding;
  data: Workspace;
  save: SaveAction;
  onCase: (id: string) => void;
}) {
  const { court, judge } = programContacts(data, program.id);
  const { busy, error, run } = useAction();
  const [create, setCreate] = useState<Contact | null>(null);
  const [detail, setDetail] = useState<Contact | null>(null);
  const judges = data.contacts.filter(
    (c) =>
      c.kind === 'judge' &&
      (c.id === judge?.id ||
        !court ||
        !data.contactRelations.some((r) => r.judgeId === c.id) ||
        data.contactRelations.some((r) => r.judgeId === c.id && r.courtId === court.id)),
  );
  async function apply(c: Contact | null, kind: 'court' | 'judge') {
    let courtId = kind === 'court' ? (c?.id ?? null) : (court?.id ?? null);
    let judgeId = kind === 'judge' ? (c?.id ?? null) : (judge?.id ?? null);
    if (kind === 'court' && courtId !== court?.id) judgeId = null;
    if (kind === 'judge' && c && !courtId) {
      const related = data.contactRelations.filter((r) => r.judgeId === c.id);
      if (related.length === 1) courtId = related[0].courtId;
      else throw new Error('请先选择办理法院');
    }
    await save('set_proceeding_contacts', {
      input: { proceedingId: program.id, courtId, judgeId },
    });
  }
  return (
    <div className="program-contacts">
      <div className="program-relation-field">
        <div className="relation-label">
          <Building2 />
          <span>办理法院</span>
          {court && (
            <button type="button" aria-label="查看法院关联" onClick={() => setDetail(court)}>
              <ArrowUpRight />
            </button>
          )}
        </div>
        <ContactPicker
          label="办理法院"
          contacts={data.contacts.filter((c) => c.kind === 'court')}
          value={court?.id ?? null}
          disabled={busy}
          onSelect={(c) => void run(() => apply(c, 'court'))}
          onCreate={(name) => setCreate(emptyContact('court', name))}
          placeholder="搜索或选择法院"
        />
        {!court && program.court && (
          <p className="field-hint">原记录：{program.court} · 请选择对应对象</p>
        )}
      </div>
      <div className="program-relation-field">
        <div className="relation-label">
          <UserRound />
          <span>承办法官</span>
          {judge && (
            <button type="button" aria-label="查看法官关联" onClick={() => setDetail(judge)}>
              <ArrowUpRight />
            </button>
          )}
        </div>
        <ContactPicker
          label="承办法官"
          contacts={judges}
          value={judge?.id ?? null}
          disabled={busy}
          onSelect={(c) => void run(() => apply(c, 'judge'))}
          onCreate={court ? (name) => setCreate(emptyContact('judge', name)) : undefined}
          description={(c) =>
            data.contactRelations
              .filter((r) => r.judgeId === c.id)
              .map((r) => data.contacts.find((x) => x.id === r.courtId)?.name)
              .join(' · ') || '尚未关联法院'
          }
          placeholder={court ? '选择该法院的法官' : '搜索或先选择法院'}
        />
        {!judge && program.judge && (
          <p className="field-hint">原记录：{program.judge} · 请选择对应对象</p>
        )}
      </div>
      <p className="program-relation-hint">
        {court
          ? '优先显示该法院及尚未关联法院的法官。修改法院后，请重新确认承办法官。'
          : '选择已有法院和法官，即可建立程序关系，无需再次手动关联。'}
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {create && (
        <ContactForm
          value={create}
          allowedKinds={[create.kind]}
          initialCourtId={create.kind === 'judge' ? court?.id : null}
          data={data}
          save={save}
          onClose={() => setCreate(null)}
          onSaved={async (c) => {
            await apply(c, c.kind === 'court' ? 'court' : 'judge');
          }}
        />
      )}
      {detail && (
        <ContactDetail
          contact={detail}
          data={data}
          save={save}
          onClose={() => setDetail(null)}
          onCase={onCase}
        />
      )}
    </div>
  );
}
