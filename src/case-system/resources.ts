import type { Workspace } from '../domain/types';
import { resourceKey, type ResourceRef } from './contracts';

export interface CaseResource {
  reference: ResourceRef;
  title: string;
}
/** View lookup only. The native resolver rechecks ownership for every write. */
export function caseResources(
  data: Workspace,
  caseId: string,
  includeDirectory = false,
): CaseResource[] {
  if (!data.cases.some((c) => c.id === caseId && !c.deletedAt)) return [];
  const rows: CaseResource[] = [];
  const add = (kind: string, id: string, title: string) =>
    rows.push({ reference: { kind, id }, title });
  for (const c of data.cases.filter((c) => c.id === caseId)) add('case', c.id, c.title);
  for (const p of data.proceedings.filter((p) => p.caseId === caseId))
    add('proceeding', p.id, p.name);
  for (const e of data.caseEvents.filter((e) => e.caseId === caseId))
    add('milestone', e.id, e.title);
  for (const e of data.calendarEvents.filter((e) => e.caseId === caseId))
    add('event', e.id, e.title);
  for (const t of data.tasks.filter((t) => t.caseId === caseId)) add('task', t.id, t.title);
  for (const r of data.workRecords.filter((r) => r.caseId === caseId))
    add('record', r.id, r.body.split('\n')[0].slice(0, 80));
  for (const m of data.materials.filter((m) => m.caseId === caseId && !m.deletedAt))
    add('material', m.id, m.name);
  for (const e of data.ledgerEntries.filter((e) => e.caseId === caseId))
    add('ledger', e.id, e.notes || e.category);
  for (const p of data.caseParties.filter((p) => p.caseId === caseId)) add('party', p.id, p.name);
  const contacts = new Set([
    ...data.contactLinks.filter((l) => l.caseId === caseId).map((l) => l.contactId),
    ...data.caseParties.filter((p) => p.caseId === caseId && p.contactId).map((p) => p.contactId!),
    ...data.resourceRelations
      .filter((r) => r.caseId === caseId)
      .flatMap((r) => [r.source, r.target].filter((x) => x.kind === 'contact').map((x) => x.id)),
  ]);
  for (const c of data.contacts.filter((c) => includeDirectory || contacts.has(c.id)))
    add('contact', c.id, c.name);
  return rows;
}
export function resourceIndex(data: Workspace, caseId: string, includeDirectory = false) {
  return new Map(
    caseResources(data, caseId, includeDirectory).map((r) => [resourceKey(r.reference), r]),
  );
}
