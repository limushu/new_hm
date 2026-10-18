import Select from '../../components/Select';
import { useState } from 'react';
import Dialog from '../../components/Dialog';
import type { SaveAction, Workspace } from '../../domain/types';
export default function CaseLinks({
  caseId,
  data,
  save,
  onCase,
}: {
  caseId: string;
  data: Workspace;
  save: SaveAction;
  onCase: (id: string) => void;
}) {
  const detail = data.caseDetails.find((d) => d.caseId === caseId) ?? {
    caseId,
    agreedFeeCents: 0,
    relatedCaseId: null,
    notes: '',
  };
  const [editing, setEditing] = useState(false);
  const [related, setRelated] = useState(detail.relatedCaseId ?? '');
  const [notes, setNotes] = useState(detail.notes);
  const original = data.cases.find((c) => c.id === detail.relatedCaseId && !c.deletedAt);
  const relatedCases = data.caseDetails
    .filter((d) => d.relatedCaseId === caseId)
    .map((d) => data.cases.find((c) => c.id === d.caseId && !c.deletedAt))
    .filter((c) => !!c);
  return (
    <section className="feature-section">
      <header>
        <h3>案情摘要与相关案件</h3>
        <button
          onClick={() => {
            setRelated(detail.relatedCaseId ?? '');
            setNotes(detail.notes);
            setEditing(true);
          }}
        >
          编辑
        </button>
      </header>
      {detail.notes && <p className="contact-notes">{detail.notes}</p>}
      {original && (
        <button className="contact-case-link" onClick={() => onCase(original.id)}>
          <span>{original.title}</span>
          <small>关联原案</small>
        </button>
      )}
      {relatedCases.map((c) => (
        <button key={c.id} className="contact-case-link" onClick={() => onCase(c.id)}>
          <span>{c.title}</span>
          <small>由此案关联的新案件</small>
        </button>
      ))}
      {!detail.notes && !original && !relatedCases.length && (
        <p className="quiet-empty">暂无案情摘要</p>
      )}
      {editing && (
        <Dialog
          title="案件备注与原案"
          onClose={() => setEditing(false)}
          onSubmit={async () => {
            await save('save_case_detail', {
              input: { ...detail, relatedCaseId: related || null, notes },
            });
          }}
        >
          <label>
            关联原案（可选）
            <Select
              aria-label="关联原案"
              value={related}
              onValueChange={(value) => setRelated(value)}
            >
              <option value="">不关联</option>
              {data.cases
                .filter((c) => !c.deletedAt && c.id !== caseId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
            </Select>
          </label>
          <label>
            备注
            <textarea
              aria-label="案件备注"
              value={notes}
              rows={4}
              maxLength={20000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </Dialog>
      )}
    </section>
  );
}
