import { dateKey } from '../domain/calendar';
import type { Material, Workspace } from '../domain/types';
import { CaseSystem, type CaseModule, type TimelineDraft } from './registry';

function localDay(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : dateKey(date);
}
const materialRef = (m: Material) => ({ kind: 'material', id: m.id });
const scopedFiles = (data: Workspace, caseId: string) =>
  data.materials.filter((m) => m.caseId === caseId && m.kind === 'file' && !m.deletedAt);
function draft(
  kind: string,
  id: string,
  type: string,
  title: string,
  body: string,
  date: string | null,
  dateRole: TimelineDraft['dateRole'],
): TimelineDraft {
  return { resource: { kind, id }, type, title, body, date: date || null, dateRole };
}
export const builtinCaseModules: readonly CaseModule[] = [
  {
    id: 'core.progress',
    timelineTypes: [
      { id: 'progress', label: '进展' },
      { id: 'node', label: '关键节点' },
    ],
    timeline: (data, id) => [
      ...data.caseEvents
        .filter((e) => e.caseId === id)
        .map((e) =>
          draft(
            'milestone',
            e.id,
            e.kind === 'stage_change' ? 'progress' : 'node',
            e.title,
            e.notes,
            e.eventDate,
            'occurred',
          ),
        ),
      ...data.proceedings
        .filter((p) => p.caseId === id)
        .map((p) => draft('proceeding', p.id, 'node', p.name, p.caseNumber, null, 'occurred')),
    ],
  },
  {
    id: 'core.records',
    timelineTypes: [{ id: 'record', label: '记录' }],
    timeline: (data, id) => {
      const files = scopedFiles(data, id),
        attached = new Map<string, Material[]>();
      for (const m of files)
        if (m.recordId) attached.set(m.recordId, [...(attached.get(m.recordId) ?? []), m]);
      return data.workRecords
        .filter((r) => r.caseId === id)
        .map((r) => ({
          ...draft(
            'record',
            r.id,
            'record',
            r.body.split('\n')[0].slice(0, 80),
            r.body,
            localDay(r.createdAt),
            'recorded',
          ),
          related: (attached.get(r.id) ?? []).map(materialRef),
        }));
    },
  },
  {
    id: 'core.materials',
    timelineTypes: [
      { id: 'material', label: '材料' },
      { id: 'document', label: '文书与笔记' },
      { id: 'recording', label: '录音' },
    ],
    timeline: (data, id) =>
      scopedFiles(data, id).map((m) => {
        const type = /\.(md|txt|docx?|odt)$/i.test(m.name)
          ? 'document'
          : /\.(m4a|mp3|wav|webm|ogg|mp4)$/i.test(m.name)
            ? 'recording'
            : 'material';
        return draft('material', m.id, type, m.name, m.notes, localDay(m.createdAt), 'archived');
      }),
  },
  {
    id: 'core.finance',
    timelineTypes: [{ id: 'ledger', label: '收支' }],
    timeline: (data, id) =>
      data.ledgerEntries
        .filter((e) => e.caseId === id)
        .map((e) => ({
          ...draft(
            'ledger',
            e.id,
            'ledger',
            e.notes || e.category,
            e.notes,
            e.entryDate,
            'transaction',
          ),
          related: e.materialId ? [{ kind: 'material', id: e.materialId }] : [],
        })),
  },
  {
    id: 'core.tasks',
    timelineTypes: [{ id: 'task', label: '待办' }],
    timeline: (data, id) =>
      data.tasks
        .filter((t) => t.caseId === id)
        .map((t) => draft('task', t.id, 'task', t.title, '', t.dueDate, 'due')),
  },
  {
    id: 'core.schedule',
    timelineTypes: [{ id: 'event', label: '日程' }],
    timeline: (data, id) =>
      data.calendarEvents
        .filter((e) => e.caseId === id)
        .map((e) => draft('event', e.id, 'event', e.title, e.notes, e.startDate, 'scheduled')),
  },
];
export function createCaseSystem(extra: readonly CaseModule[] = []): CaseSystem {
  const result = new CaseSystem();
  for (const module of [...builtinCaseModules, ...extra]) result.register(module);
  return result;
}
export const caseSystem = createCaseSystem();
