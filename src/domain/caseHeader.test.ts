import { expect, test } from 'vitest';
import { mergeCaseHeader } from './caseHeader';
import { emptyWorkspace, type CaseFile } from './types';
const item: CaseFile = {
  id: 'one',
  title: 'Case one',
  caseType: 'civil',
  statusId: 'in_progress',
  currentProceedingId: null,
  createdAt: 'created',
  updatedAt: 'before',
  deletedAt: null,
};
test('native header receipts keep unrelated records and other cases intact', () => {
  const other = { ...item, id: 'two' };
  const data = {
    ...emptyWorkspace,
    cases: [item, other],
    caseTags: [{ caseId: 'two', tag: 'other' }],
  };
  const saved = { ...item, title: 'Saved title', statusId: 'closed', updatedAt: 'native-time' };
  const next = mergeCaseHeader(data, {
    item: saved,
    tags: [{ caseId: 'one', tag: '合同' }],
    tagCatalog: ['other', '合同'],
  });
  expect(next.cases).toEqual([saved, other]);
  expect(next.cases[1]).toBe(other);
  expect(next.caseTags).toEqual([
    { caseId: 'two', tag: 'other' },
    { caseId: 'one', tag: '合同' },
  ]);
  for (const key of Object.keys(emptyWorkspace) as (keyof typeof emptyWorkspace)[]) {
    if (!['cases', 'caseTags', 'tagCatalog'].includes(key)) expect(next[key]).toBe(data[key]);
  }
  expect(data.cases[0]).toBe(item);
  expect(data.caseTags).toEqual([{ caseId: 'two', tag: 'other' }]);
});
test('a status-only receipt retains the tag collections and removes no case content', () => {
  const data = {
    ...emptyWorkspace,
    cases: [item],
    caseTags: [{ caseId: 'one', tag: '合同' }],
    tagCatalog: ['合同'],
  };
  const next = mergeCaseHeader(data, {
    item: { ...item, statusId: 'closed' },
    tags: [...data.caseTags],
    tagCatalog: [...data.tagCatalog],
  });
  expect(next.caseTags).toBe(data.caseTags);
  expect(next.tagCatalog).toBe(data.tagCatalog);
  expect(next.cases[0].statusId).toBe('closed');
});
