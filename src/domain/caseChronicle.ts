import { dateKey } from './calendar';
import type { Material, Workspace } from './types';
export interface ChronicleEntry {
  id: string;
  kind: 'event' | 'record' | 'materials';
  date: string;
  title: string;
  body: string;
  resourceId: string;
  files: Material[];
}
function localDay(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : dateKey(date);
}
/** Existing dates keep their original meaning: occurrence, recording or archiving. */
export function caseChronicle(data: Workspace, caseId: string): ChronicleEntry[] {
  const records = data.workRecords.filter((r) => r.caseId === caseId);
  const recordIds = new Set(records.map((r) => r.id));
  const files = data.materials.filter(
    (m) => m.caseId === caseId && m.kind === 'file' && !m.deletedAt,
  );
  const rows: ChronicleEntry[] = data.caseEvents
    .filter((e) => e.caseId === caseId && e.kind !== 'stage_change')
    .map((e) => ({
      id: `event:${e.id}`,
      kind: 'event',
      date: e.eventDate,
      title: e.title,
      body: e.notes,
      resourceId: e.id,
      files: [],
    }));
  for (const r of records)
    rows.push({
      id: `record:${r.id}`,
      kind: 'record',
      date: localDay(r.createdAt),
      title: r.body.split('\n')[0].slice(0, 80) || '工作记录',
      body: r.body,
      resourceId: r.id,
      files: files.filter((m) => m.recordId === r.id),
    });
  const groups = new Map<string, Material[]>();
  for (const file of files) {
    if (file.recordId && recordIds.has(file.recordId)) continue;
    const day = localDay(file.createdAt);
    groups.set(day, [...(groups.get(day) ?? []), file]);
  }
  for (const [date, materials] of groups)
    rows.push({
      id: `materials:${date}`,
      kind: 'materials',
      date,
      title: `材料归档 · ${materials.length} 份`,
      body: materials.map((m) => m.name).join('、'),
      resourceId: '',
      files: materials,
    });
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
