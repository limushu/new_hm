import ObjectInspector from './ObjectInspector';
import { materialIcon } from '../materials/Materials';
import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  CheckSquare,
  Ellipsis,
  Files,
  Flag,
  ListFilter,
  Mic,
  NotebookPen,
  Star,
  Wallet,
} from 'lucide-react';
import Dialog from '../../components/Dialog';
import Select from '../../components/Select';
import type { SaveAction, Workspace } from '../../domain/types';
import { dateKey } from '../../domain/calendar';
import { money } from '../../domain/money';
import { caseSystem } from '../../case-system/modules';
import { filterTimeline, isPlanned, timelineDateLabels } from '../../case-system/timeline';
import {
  resourceKey,
  type TimelineEntry,
  type TimelineFilter,
  type ResourceRef,
} from '../../case-system/contracts';
import ResourceSettings from './ResourceSettings';
const icons = {
  progress: Flag,
  node: Flag,
  record: NotebookPen,
  material: Files,
  document: Files,
  recording: Mic,
  ledger: Wallet,
  task: CheckSquare,
  event: CalendarDays,
};

export default function CaseTimeline({
  caseId,
  data,
  save,
}: {
  caseId: string;
  data: Workspace;
  save: SaveAction;
}) {
  const [filter, setFilter] = useState<TimelineFilter>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [limit, setLimit] = useState(8);
  const [opened, setOpened] = useState<ResourceRef | null>(null);
  const [settings, setSettings] = useState<TimelineEntry | null>(null);
  const entries = useMemo(() => caseSystem.timeline(data, caseId), [data, caseId]);
  const today = dateKey(new Date());
  const filtered = filterTimeline(entries, filter);
  const visible = filtered.filter((e) => !isPlanned(e, today));
  const plans = filtered.filter((e) => isPlanned(e, today));
  const types = caseSystem.types();
  const labels = new Map(types.map((t) => [t.id, t.label]));
  const tags = [...new Set(entries.flatMap((e) => e.tags))].sort();
  const active = filter.importantOnly || filter.types?.length || filter.tags?.length;
  const filesById = new Map(
    data.materials.filter((m) => m.caseId === caseId && !m.deletedAt).map((m) => [m.id, m]),
  );
  function open(entry: TimelineEntry) {
    if (entry) setOpened(entry.resource);
  }
  function files(entry: TimelineEntry) {
    return entry.related
      .filter((r) => r.kind === 'material')
      .flatMap((r) => {
        const m = filesById.get(r.id);
        return m?.kind === 'file' ? [m] : [];
      });
  }
  function row(entry: TimelineEntry) {
    const Icon = icons[entry.type as keyof typeof icons] ?? Files;
    const cash =
      entry.resource.kind === 'ledger'
        ? data.ledgerEntries.find((e) => e.id === entry.resource.id)
        : null;
    const done =
      entry.resource.kind === 'task' &&
      data.tasks.some((t) => t.id === entry.resource.id && t.completed);
    return (
      <li key={entry.id} className="chronicle-entry" data-resource={entry.id}>
        <div className="chronicle-date">
          <time>{entry.date || '日期未设置'}</time>
          <small>{timelineDateLabels[entry.dateRole]}</small>
        </div>
        <span className="chronicle-marker">
          <Icon />
        </span>
        <article>
          <div className="timeline-entry-heading">
            <button className="chronicle-entry-title" onClick={() => open(entry)}>
              {entry.importance === 'important' && <Star aria-label="重要" />}
              {entry.title || labels.get(entry.type) || entry.type}
              <ArrowUpRight />
            </button>
            <button
              className="timeline-entry-settings"
              aria-label={`设置条目 ${entry.title}`}
              onClick={() => setSettings(entry)}
            >
              <Ellipsis />
            </button>
          </div>
          <span className="timeline-entry-type">
            {labels.get(entry.type) || entry.type}
            {done ? ' · 已完成' : ''}
          </span>
          {cash && (
            <strong className="timeline-money">
              {cash.kind === 'income' ? '收入' : '支出'} ¥ {money(cash.amountCents)}
            </strong>
          )}
          {entry.body && entry.body !== entry.title && (
            <p className="chronicle-excerpt">{entry.body}</p>
          )}
          {!!entry.tags.length && (
            <div className="timeline-tags">
              {entry.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>
          )}
          <div className="chronicle-file-chips">
            {files(entry)
              .slice(0, 2)
              .map((m) => (
                <button
                  key={m.id}
                  onClick={() =>
                    open(entries.find((e) => resourceKey(e.resource) === `material:${m.id}`)!)
                  }
                >
                  {materialIcon(m)}
                  <span>{m.name}</span>
                </button>
              ))}
          </div>
        </article>
      </li>
    );
  }
  return (
    <section className="case-timeline" aria-label="案件统一时间轴">
      <div className="chronicle-heading">
        <h3>案件时间轴</h3>
        <button onClick={() => setFilterOpen(true)}>
          <ListFilter />
          筛选{active ? ' · 已筛选' : ''}
        </button>
      </div>
      {!!active && (
        <div className="timeline-filter-summary">
          <span>
            {filter.importantOnly ? '重要 · ' : ''}
            {filter.types?.map((t) => labels.get(t)).join('、')}
            {filter.tags?.map((t) => ` #${t}`).join('')}
          </span>
          <button
            onClick={() => {
              setFilter({});
              setLimit(8);
            }}
          >
            清除筛选
          </button>
        </div>
      )}
      {plans.length > 0 && (
        <details className="chronicle-plans">
          <summary>后续计划 · {plans.length}</summary>
          {plans.map((e) => (
            <button key={e.id} onClick={() => open(e)}>
              <time>{e.date}</time>
              <span>{e.title}</span>
              <small>计划</small>
            </button>
          ))}
        </details>
      )}
      <ol className="chronicle-timeline">{visible.slice(0, limit).map(row)}</ol>
      {!visible.length && (
        <p className="quiet-empty">
          {active ? '没有符合筛选条件的条目' : '尚无案件条目，可从下方「创建」添加。'}
        </p>
      )}
      {visible.length > limit && (
        <button className="chronicle-load-more" onClick={() => setLimit((v) => v + 12)}>
          查看更早记录 · 还有 {visible.length - limit} 条
        </button>
      )}
      {filterOpen && (
        <Dialog title="筛选案件时间轴" onClose={() => setFilterOpen(false)}>
          <label className="resource-important">
            <input
              type="checkbox"
              checked={!!filter.importantOnly}
              onChange={(e) => {
                setFilter({ ...filter, importantOnly: e.target.checked });
                setLimit(8);
              }}
            />
            只看重要条目
          </label>
          <label>
            类型
            <Select
              aria-label="时间轴类型"
              value={filter.types?.[0] ?? ''}
              onValueChange={(v) => {
                setFilter({ ...filter, types: v ? [v] : [] });
                setLimit(8);
              }}
            >
              <option value="">全部类型</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </label>
          <label>
            标签
            <Select
              aria-label="时间轴标签"
              value={filter.tags?.[0] ?? ''}
              onValueChange={(v) => {
                setFilter({ ...filter, tags: v ? [v] : [] });
                setLimit(8);
              }}
            >
              <option value="">全部标签</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </Select>
          </label>
        </Dialog>
      )}
      {settings && (
        <ResourceSettings
          entry={settings}
          data={data}
          save={save}
          onClose={() => setSettings(null)}
        />
      )}
      {opened && (
        <ObjectInspector
          key={resourceKey(opened)}
          caseId={caseId}
          resource={opened}
          data={data}
          save={save}
          onClose={() => setOpened(null)}
        />
      )}
    </section>
  );
}
