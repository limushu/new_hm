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
        data.caseParties.some((p) => p.caseId === c.id && p.contactId === contactId) ||
        data.resourceRelations.some(
          (r) =>
            r.caseId === c.id &&
            [r.source, r.target].some((ref) => ref.kind === 'contact' && ref.id === contactId),
        )),
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
  kind: 'case' | 'program' | 'party' | Contact['kind'];
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
  const actorNode = (caseId: string, ref: { kind: string; id: string }) => {
    if (ref.kind === 'contact' && data.contacts.some((c) => c.id === ref.id))
      return `contact:${ref.id}`;
    if (ref.kind === 'party') {
      const party = data.caseParties.find((p) => p.id === ref.id && p.caseId === caseId);
      return party ? (party.contactId ? `contact:${party.contactId}` : `party:${party.id}`) : null;
    }
    return null;
  };
  for (const party of data.caseParties.filter(
    (p) => !p.contactId && active.some((c) => c.id === p.caseId),
  )) {
    nodes.push({
      id: `party:${party.id}`,
      entityId: party.id,
      label: party.name || '姓名待补充',
      kind: 'party',
      meta: '本案当事人',
    });
    edges.push({
      source: `case:${party.caseId}`,
      target: `party:${party.id}`,
      label: { client: '我方委托人', opponent: '对方当事人', other: '其他当事人' }[party.side],
    });
  }
  for (const r of data.resourceRelations.filter((r) => active.some((c) => c.id === r.caseId))) {
    const source = actorNode(r.caseId, r.source),
      target = actorNode(r.caseId, r.target);
    if (source && target && source !== target)
      edges.push({ source, target, label: r.label || r.kind });
    for (const node of [source, target])
      if (node) edges.push({ source: `case:${r.caseId}`, target: node, label: '本案关联对象' });
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
