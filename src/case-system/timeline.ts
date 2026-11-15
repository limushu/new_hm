import type { TimelineEntry, TimelineFilter } from './contracts';
import { sameResource } from './contracts';
/** No invented completion dates, automatic priorities or accounting amounts. */
export function filterTimeline(
  entries: readonly TimelineEntry[],
  filter: TimelineFilter,
): TimelineEntry[] {
  const explicit =
    filter.importantOnly || filter.types?.length || filter.tags?.length || filter.relatedTo;
  const embedded = new Set(
    entries
      .filter((e) => e.resource.kind !== 'material')
      .flatMap((e) => e.related.filter((r) => r.kind === 'material').map((r) => r.id)),
  );
  return entries.filter(
    (e) =>
      (!!explicit ||
        e.resource.kind !== 'material' ||
        !embedded.has(e.resource.id) ||
        e.importance === 'important' ||
        e.tags.length > 0) &&
      (!filter.importantOnly || e.importance === 'important') &&
      (!filter.types?.length || filter.types.includes(e.type)) &&
      (!filter.tags?.length || filter.tags.every((tag) => e.tags.includes(tag))) &&
      (!filter.relatedTo ||
        sameResource(e.resource, filter.relatedTo) ||
        e.related.some((r) => sameResource(r, filter.relatedTo!))),
  );
}
export const timelineDateLabels = {
  occurred: '发生日期',
  recorded: '记录时间',
  archived: '归档时间',
  scheduled: '计划日期',
  due: '截止日期',
  transaction: '收支日期',
} as const;
export function isPlanned(entry: TimelineEntry, today: string): boolean {
  return (
    !!entry.date && entry.date > today && ['occurred', 'scheduled', 'due'].includes(entry.dateRole)
  );
}
