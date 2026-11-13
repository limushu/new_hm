import { expect, test } from 'vitest';
import { caseChronicle } from './caseChronicle';
import { emptyWorkspace, type Material } from './types';
const material = (id: string, recordId: string | null = null): Material => ({
  id,
  caseId: 'one',
  proceedingId: null,
  parentId: null,
  name: `${id}.txt`,
  kind: 'file',
  size: 10,
  notes: '',
  recordId,
  createdAt: new Date(2026, 10, 13, 12).toISOString(),
  deletedAt: null,
  trashGroup: null,
});

test('timeline preserves occurrence date, keeps attachments on their record and excludes other cases', () => {
  const rows = caseChronicle(
    {
      ...emptyWorkspace,
      caseEvents: [
        {
          id: 'old',
          caseId: 'one',
          proceedingId: null,
          title: 'Historical fact',
          eventDate: '2020-01-02',
          notes: '',
        },
        {
          id: 'auto',
          caseId: 'one',
          proceedingId: null,
          title: 'Internal stage update',
          eventDate: '2026-11-13',
          notes: '',
          kind: 'stage_change',
        },
      ],
      workRecords: [
        {
          id: 'record',
          caseId: 'one',
          body: 'Recorded today',
          createdAt: new Date(2026, 10, 13, 12).toISOString(),
        },
      ],
      materials: [
        material('attached', 'record'),
        material('free'),
        { ...material('foreign'), caseId: 'two' },
      ],
    },
    'one',
  );
  expect(rows.find((r) => r.kind === 'event')?.date).toBe('2020-01-02');
  expect(rows.find((r) => r.kind === 'record')?.files.map((f) => f.id)).toEqual(['attached']);
  expect(rows.find((r) => r.kind === 'materials')?.files.map((f) => f.id)).toEqual(['free']);
  expect(rows.some((r) => r.resourceId === 'auto')).toBe(false);
});

test('a retained attachment remains visible after its record is trashed; unknown dates stay unknown', () => {
  const rows = caseChronicle(
    {
      ...emptyWorkspace,
      materials: [
        { ...material('orphan', 'deleted-record'), createdAt: '' },
        { ...material('deleted'), deletedAt: '2026-11-13' },
      ],
    },
    'one',
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].date).toBe('');
  expect(rows[0].files.map((f) => f.id)).toEqual(['orphan']);
});
