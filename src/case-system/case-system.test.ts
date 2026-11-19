import { expect, test } from 'vitest';
import { emptyWorkspace, type Material, type Workspace } from '../domain/types';
import { createCaseSystem } from './modules';
import { filterTimeline, isPlanned } from './timeline';
import { workspaceGraph } from '../domain/relations';

test('focus and timeline share one provider projection without retaining stale workspace data', () => {
  const data = fixture();
  let resourceReads = 0;
  let timelineReads = 0;
  const system = createCaseSystem([
    {
      id: 'extension.projection',
      timelineTypes: [{ id: 'extension', label: '扩展对象' }],
      resources: () => {
        resourceReads++;
        return [{ reference: { kind: 'extension', id: 'external' }, title: '扩展对象' }];
      },
      timeline: () => {
        timelineReads++;
        return [
          {
            resource: { kind: 'extension', id: 'external' },
            type: 'extension',
            title: '扩展对象',
            body: '',
            date: null,
            dateRole: 'occurred',
          },
        ];
      },
    },
  ]);
  const first = system.project(data, 'one');
  expect(resourceReads).toBe(1);
  expect(timelineReads).toBe(1);
  expect(first.objects.find((o) => o.id === 'extension:external')?.title).toBe('扩展对象');
  data.tasks.push({
    id: 'latest',
    caseId: 'one',
    title: '刚保存的待办',
    dueDate: null,
    completed: false,
  });
  const second = system.project(data, 'one');
  expect(second.timeline.some((e) => e.resource.id === 'latest')).toBe(true);
  expect(first.timeline.some((e) => e.resource.id === 'latest')).toBe(false);
  expect(resourceReads).toBe(2);
});

function fixture(): Workspace {
  const file: Material = {
    id: 'file',
    caseId: 'one',
    proceedingId: null,
    parentId: null,
    name: 'evidence.txt',
    kind: 'file',
    size: 10,
    notes: '',
    recordId: 'record',
    createdAt: new Date(2026, 10, 15, 12).toISOString(),
    deletedAt: null,
    trashGroup: null,
  };
  return {
    ...emptyWorkspace,
    cases: [
      {
        id: 'one',
        title: 'One',
        caseType: 'other',
        statusId: 'in_progress',
        currentProceedingId: null,
        createdAt: '',
        updatedAt: '',
        deletedAt: null,
      },
    ],
    caseEvents: [
      {
        id: 'fact',
        caseId: 'one',
        proceedingId: null,
        title: 'Original fact',
        eventDate: '2020-01-02',
        notes: '',
      },
    ],
    workRecords: [
      {
        id: 'record',
        caseId: 'one',
        body: 'Notes',
        createdAt: new Date(2026, 10, 15, 12).toISOString(),
      },
    ],
    materials: [file, { ...file, id: 'foreign', caseId: 'other' }],
    tasks: [{ id: 'task', caseId: 'one', title: 'Undated task', dueDate: null, completed: true }],
    ledgerEntries: [
      {
        id: 'cash',
        caseId: 'one',
        proceedingId: null,
        kind: 'expense',
        amountCents: 12345,
        entryDate: '2026-11-14',
        category: 'Travel',
        notes: 'Train fare',
        reimbursement: 'none',
        materialId: 'file',
      },
    ],
    resourceMetadata: [
      {
        caseId: 'one',
        resource: { kind: 'ledger', id: 'cash' },
        importance: 'important',
        tags: ['cost'],
      },
    ],
  };
}
test('all modules use stable references and retain occurrence, archive, due and transaction date meaning', () => {
  const data = fixture(),
    rows = createCaseSystem().timeline(data, 'one');
  expect(rows.find((r) => r.resource.kind === 'milestone')?.date).toBe('2020-01-02');
  expect(rows.find((r) => r.resource.kind === 'material')?.dateRole).toBe('archived');
  expect(rows.find((r) => r.resource.kind === 'task')?.date).toBeNull();
  expect(rows.find((r) => r.resource.kind === 'task')?.dateRole).toBe('due');
  expect(rows.find((r) => r.resource.kind === 'ledger')?.dateRole).toBe('transaction');
  expect(rows.some((r) => r.resource.id === 'foreign')).toBe(false);
  expect(rows.find((r) => r.resource.kind === 'ledger')).not.toHaveProperty('amountCents');
  expect(data.ledgerEntries[0].amountCents).toBe(12345);
});
test('importance, type and tags are independent intersecting filters', () => {
  const rows = createCaseSystem().timeline(fixture(), 'one');
  expect(
    filterTimeline(rows, { importantOnly: true, types: ['ledger'], tags: ['cost'] }).map(
      (r) => r.id,
    ),
  ).toEqual(['ledger:cash']);
  expect(filterTimeline(rows, { importantOnly: true, types: ['progress'] })).toEqual([]);
});
test('attachments stay on their event by default and remain discoverable by type, importance or orphaning', () => {
  const system = createCaseSystem(),
    data = fixture(),
    rows = system.timeline(data, 'one');
  expect(rows.find((r) => r.id === 'record:record')?.related).toContainEqual({
    kind: 'material',
    id: 'file',
  });
  expect(filterTimeline(rows, {}).some((r) => r.id === 'material:file')).toBe(false);
  expect(filterTimeline(rows, { types: ['document'] }).map((r) => r.id)).toEqual(['material:file']);
  data.workRecords = [];
  data.ledgerEntries = [];
  expect(
    filterTimeline(system.timeline(data, 'one'), {}).some((r) => r.id === 'material:file'),
  ).toBe(true);
});
test('unknown dates remain unknown and future timestamps do not become plans automatically', () => {
  const data = fixture();
  data.materials[0].createdAt = '';
  const rows = createCaseSystem().timeline(data, 'one');
  expect(rows.find((r) => r.id === 'material:file')?.date).toBeNull();
  expect(isPlanned({ ...rows[0], date: '2099-01-01', dateRole: 'archived' }, '2026-11-15')).toBe(
    false,
  );
  expect(isPlanned({ ...rows[0], date: '2099-01-01', dateRole: 'occurred' }, '2026-11-15')).toBe(
    true,
  );
});
test('a module adds a resource, projection and relationships through registration without changing the engine', () => {
  const data = fixture(),
    ref = { kind: 'example.analysis', id: 'analysis' };
  data.resourceMetadata.push({
    caseId: 'one',
    resource: ref,
    importance: 'important',
    tags: ['review'],
  });
  data.resourceRelations.push({
    id: 'link',
    caseId: 'one',
    source: ref,
    target: { kind: 'material', id: 'file' },
    kind: 'evidence',
    label: 'Basis',
  });
  const system = createCaseSystem([
    {
      id: 'example.analysis',
      timelineTypes: [{ id: 'analysis', label: 'Analysis' }],
      resources: () => [{ reference: ref, title: 'Analysis' }],
      timeline: () => [
        {
          resource: ref,
          type: 'analysis',
          title: 'Analysis',
          body: '',
          date: null,
          dateRole: 'recorded',
        },
      ],
    },
  ]);
  const item = system.timeline(data, 'one').find((r) => r.resource.kind === ref.kind)!;
  expect(item.importance).toBe('important');
  expect(item.related).toContainEqual({ kind: 'material', id: 'file' });
  expect(
    filterTimeline(system.timeline(data, 'one'), { relatedTo: ref }).some(
      (r) => r.id === 'material:file',
    ),
  ).toBe(true);
  expect(system.extensions().every((e) => !e.plan && !e.templates && !e.documentEditor)).toBe(true);
  expect(() => system.register({ id: 'core.records', timelineTypes: [] })).toThrow(
    'Duplicate case module',
  );
  expect(() =>
    system.register({ id: 'bad', timelineTypes: [{ id: 'ledger', label: 'Duplicate' }] }),
  ).toThrow('Duplicate timeline type');
});
test('case relations include unlinked parties and institutions in the graph and exclude deleted cases', () => {
  const data = fixture();
  data.caseParties = [
    { id: 'p', caseId: 'one', contactId: null, name: 'Client', side: 'client', serviceType: '' },
  ];
  data.contacts = [
    { id: 'org', name: 'Department', kind: 'organization', phone: '', address: '', notes: '' },
  ];
  data.resourceRelations = [
    {
      id: 'relation',
      caseId: 'one',
      source: { kind: 'party', id: 'p' },
      target: { kind: 'contact', id: 'org' },
      kind: 'affiliated_with',
      label: 'Employed by',
    },
  ];
  const graph = workspaceGraph(data);
  expect(graph.nodes.some((n) => n.id === 'party:p')).toBe(true);
  expect(graph.edges).toContainEqual({
    source: 'party:p',
    target: 'contact:org',
    label: 'Employed by',
  });
  data.cases[0].deletedAt = '2026-11-15';
  expect(workspaceGraph(data).edges.some((e) => e.label === 'Employed by')).toBe(false);
  expect(createCaseSystem().timeline(data, 'one')).toEqual([]);
});

test('non-temporal actors and files share object properties without inventing occurrence dates', () => {
  const data = fixture();
  data.caseParties = [
    {
      id: 'person',
      caseId: 'one',
      contactId: null,
      name: 'Plaintiff',
      side: 'client',
      serviceType: '',
    },
  ];
  data.resourceMetadata.push({
    caseId: 'one',
    resource: { kind: 'party', id: 'person' },
    importance: 'important',
    tags: ['key person'],
  });
  const objects = createCaseSystem().objects(data, 'one');
  const actor = objects.find((o) => o.resource.kind === 'party')!;
  expect(actor.importance).toBe('important');
  expect(actor.tags).toEqual(['key person']);
  expect(actor.businessTime).toBeNull();
  expect(objects.find((o) => o.id === 'material:file')?.importance).toBe('normal');
  expect(
    objects.every((o) => o.id && o.caseId && o.type && o.resource && Array.isArray(o.tags)),
  ).toBe(true);
});
