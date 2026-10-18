import { useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import type { CalendarEvent, SaveAction, Workspace, WorkScope } from '../../domain/types';
import { caseScope, resourceInScope } from '../../domain/workspace';
import { dateKey } from '../../domain/calendar';
import { emptyEvent, eventRange } from '../calendar/schedule';
import EventEditor from '../calendar/EventEditor';
export default function CaseSchedule({
  caseId,
  data,
  save,
  scope = caseScope,
  onAssociate,
}: {
  caseId: string;
  data: Workspace;
  save: SaveAction;
  scope?: WorkScope;
  onAssociate?: () => void;
}) {
  const [edit, setEdit] = useState<CalendarEvent | null>(null);
  const today = dateKey(new Date());
  const rows = data.calendarEvents
    .filter((e) => e.caseId === caseId && resourceInScope(data, 'event', e.id, scope))
    .sort((a, b) =>
      (a.startDate + (a.startTime || '')).localeCompare(b.startDate + (b.startTime || '')),
    );
  const upcoming = rows.filter((e) => e.endDate >= today);
  const past = rows.filter((e) => e.endDate < today).reverse();
  function entry(event: CalendarEvent) {
    return (
      <button key={event.id} className="case-schedule-row" onClick={() => setEdit(event)}>
        <CalendarDays />
        <span>
          <strong>{event.title}</strong>
          <small>
            {event.startDate} · {eventRange(event)}
            {event.location ? ` · ${event.location}` : ''}
          </small>
        </span>
      </button>
    );
  }
  return (
    <section className="case-section case-schedule" data-tone="blue">
      <div className="section-title">
        <h3>
          <CalendarDays aria-hidden="true" />
          案件日程 <span>{upcoming.length}</span>
        </h3>
        <div className="work-actions">
          {onAssociate && <button onClick={onAssociate}>关联已有日程</button>}
          <button onClick={() => setEdit({ ...emptyEvent(today), caseId })}>
            <Plus />
            添加案件日程
          </button>
        </div>
      </div>
      {upcoming.length ? upcoming.map(entry) : <p className="empty-text">暂无待进行的日程</p>}
      {past.length > 0 && (
        <details className="case-history">
          <summary>已过日程 · {past.length}</summary>
          {past.map(entry)}
        </details>
      )}
      {edit && (
        <EventEditor
          data={data}
          initialScope={scope}
          event={edit}
          existing={rows.some((e) => e.id === edit.id)}
          cases={data.cases}
          save={save}
          onClose={() => setEdit(null)}
          onSaved={() => setEdit(null)}
        />
      )}
    </section>
  );
}
