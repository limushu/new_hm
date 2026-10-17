import { describe, it, expect } from 'vitest';
import { emptyWorkspace, type Workspace } from './types';
import { workspaceGraph, programContacts, linkedCases } from './relations';
function fixture(): Workspace {
  return {
    ...structuredClone(emptyWorkspace),
    cases: [
      {
        id: 'case',
        title: '虚构案件',
        caseType: 'civil',
        statusId: 'in_progress',
        currentProceedingId: 'program',
        createdAt: '',
        updatedAt: '',
        deletedAt: null,
      },
    ],
    proceedings: [
      {
        id: 'program',
        caseId: 'case',
        kind: 'first_instance',
        stage: '材料准备',
        caseNumber: '',
        court: '甲法院',
        judge: '甲法官',
      },
    ],
    contacts: [
      { id: 'court', name: '甲法院', kind: 'court', phone: '', address: '', notes: '' },
      { id: 'judge', name: '甲法官', kind: 'judge', phone: '', address: '', notes: '' },
    ],
    contactLinks: [
      { id: 'a', caseId: 'case', proceedingId: 'program', contactId: 'court', role: '法院' },
      { id: 'b', caseId: 'case', proceedingId: 'program', contactId: 'judge', role: '法官' },
    ],
    contactRelations: [{ judgeId: 'judge', courtId: 'court' }],
  };
}
describe('程序与对象关系', () => {
  it('法院通过办理程序关联案件，法官与法院连通，反向案件去重', () => {
    const data = fixture();
    const graph = workspaceGraph(data);
    expect(graph.edges).toContainEqual({
      source: 'case:case',
      target: 'program:program',
      label: '办理程序',
    });
    expect(graph.edges).toContainEqual({
      source: 'program:program',
      target: 'contact:court',
      label: '法院',
    });
    expect(graph.edges).toContainEqual({
      source: 'contact:court',
      target: 'contact:judge',
      label: '法院 · 法官',
    });
    expect(graph.edges.some((e) => e.source === 'case:case' && e.target === 'contact:court')).toBe(
      false,
    );
    data.contactLinks.push({ ...data.contactLinks[1], id: 'other', role: '承办法官' });
    expect(linkedCases(data, 'judge')).toHaveLength(1);
    data.cases[0].deletedAt = 'now';
    expect(linkedCases(data, 'judge')).toHaveLength(0);
  });
  it('重复主法院关系不随意选取第一个对象', () => {
    const data = fixture();
    expect(programContacts(data, 'program').court?.id).toBe('court');
    data.contacts.push({ ...data.contacts[0], id: 'court2', name: '乙法院' });
    data.contactLinks.push({ ...data.contactLinks[0], id: 'c', contactId: 'court2' });
    expect(programContacts(data, 'program').court).toBeNull();
  });
});
