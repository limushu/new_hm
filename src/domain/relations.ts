import type { Workspace, Contact } from './types';
export function programContacts(data: Workspace, id: string) {
  const links = data.contactLinks.filter((l) => l.proceedingId === id);
  const unique = (kind: Contact['kind'], role: string) => {
    const candidates = data.contacts.filter(
      (c) => c.kind === kind && links.some((l) => l.contactId === c.id && l.role === role),
    );
    return candidates.length === 1 ? candidates[0] : null;
  };
  return {
    court: unique('court', '法院'),
    judge: unique('judge', '法官'),
  };
}
export function linkedCases(data: Workspace, contactId: string) {
  return data.cases.filter(
    (c) =>
      !c.deletedAt &&
      (data.contactLinks.some((l) => l.caseId === c.id && l.contactId === contactId) ||
        data.caseParties.some((p) => p.caseId === c.id && p.contactId === contactId)),
  );
}
export function relatedContacts(data: Workspace, contact: Contact) {
  const ids = data.contactRelations.flatMap((r) =>
    r.judgeId === contact.id ? [r.courtId] : r.courtId === contact.id ? [r.judgeId] : [],
  );
  return data.contacts.filter((c) => ids.includes(c.id));
}
export interface RelationNode {
  id: string;
  label: string;
  kind: 'case' | 'program' | Contact['kind'];
  entityId: string;
  meta: string;
}
export interface RelationEdge {
  source: string;
  target: string;
  label: string;
}
export function workspaceGraph(data: Workspace) {
  const nodes: RelationNode[] = [];
  const edges: RelationEdge[] = [];
  const active = data.cases.filter((c) => !c.deletedAt);
  const programs = data.proceedings.filter((p) => active.some((c) => c.id === p.caseId));
  for (const c of active)
    nodes.push({ id: `case:${c.id}`, entityId: c.id, label: c.title, kind: 'case', meta: '案件' });
  for (const p of programs) {
    nodes.push({
      id: `program:${p.id}`,
      entityId: p.id,
      label: p.name,
      kind: 'program',
      meta: p.caseNumber || p.stage,
    });
    edges.push({ source: `case:${p.caseId}`, target: `program:${p.id}`, label: '办理流程' });
  }
  for (const c of data.contacts)
    nodes.push({
      id: `contact:${c.id}`,
      entityId: c.id,
      label: c.name,
      kind: c.kind,
      meta: c.phone,
    });
  for (const l of data.contactLinks.filter((l) => active.some((c) => c.id === l.caseId))) {
    edges.push({
      source: l.proceedingId ? `program:${l.proceedingId}` : `case:${l.caseId}`,
      target: `contact:${l.contactId}`,
      label: l.role,
    });
  }
  for (const r of data.contactRelations)
    edges.push({
      source: `contact:${r.courtId}`,
      target: `contact:${r.judgeId}`,
      label: '法院 · 法官',
    });
  for (const p of data.caseParties) {
    if (p.contactId && active.some((c) => c.id === p.caseId))
      edges.push({
        source: `case:${p.caseId}`,
        target: `contact:${p.contactId}`,
        label: { client: '我方委托人', opponent: '对方当事人', other: '其他当事人' }[p.side],
      });
  }
  for (const r of data.proceedingPartyRoles) {
    const party = data.caseParties.find((p) => p.id === r.partyId);
    if (party?.contactId && programs.some((p) => p.id === r.proceedingId))
      edges.push({
        source: `program:${r.proceedingId}`,
        target: `contact:${party.contactId}`,
        label: r.role,
      });
  }
  return {
    nodes,
    edges: edges.filter(
      (e, index) =>
        edges.findIndex(
          (x) => x.source === e.source && x.target === e.target && x.label === e.label,
        ) === index,
    ),
  };
}
