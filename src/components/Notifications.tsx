import { useEffect, useState } from 'react';
import Dialog from './Dialog';
import { command } from '../services/repository';
import { useAction } from './useAction';
import type { Reminder, Workspace } from '../domain/types';
export default function Notifications({
  data,
  onClose,
  onCase,
}: {
  data: Workspace;
  onClose: () => void;
  onCase: (id: string) => void;
}) {
  const [due, setDue] = useState<Reminder[]>([]);
  const { busy, error, run } = useAction();
  useEffect(() => {
    let canceled = false;
    void command('due_reminders', {})
      .then((rows) => {
        if (!canceled) setDue(rows);
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, []);
  const next = data.calendarEvents
    .filter(
      (e) =>
        e.reminderMinutes !== undefined &&
        e.reminderMinutes !== null &&
        (!e.caseId || data.cases.some((c) => c.id === e.caseId && !c.deletedAt)),
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .filter((e) => e.startDate >= new Date().toLocaleDateString('sv-SE'))
    .slice(0, 20);
  return (
    <Dialog title="日程提醒" onClose={onClose}>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <h3 className="minor-heading">待确认提醒</h3>
      {!due.length && <p className="quiet-empty">当前没有待确认提醒。</p>}
      {due.map((r) => (
        <div className="feature-row" key={r.eventId}>
          <span className="row-main">
            {r.title}
            <small>{r.when}</small>
          </span>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await command('acknowledge_reminder', { eventId: r.eventId, key: r.scheduleKey });
                setDue((rows) => rows.filter((row) => row.eventId !== r.eventId));
              })
            }
          >
            知道了
          </button>
        </div>
      ))}
      <h3 className="minor-heading">已设置提醒的近期日程</h3>
      {!next.length && <p className="quiet-empty">编辑日程时可选择提醒时间。</p>}
      {next.map((e) => (
        <div className="feature-row" key={e.id}>
          <span className="row-main">
            {e.title}
            <small>
              {e.startDate} {e.startTime ?? '全天'}
            </small>
          </span>
          {e.caseId && (
            <button
              className="inline-link"
              onClick={() => {
                onClose();
                onCase(e.caseId!);
              }}
            >
              查看案件
            </button>
          )}
        </div>
      ))}
    </Dialog>
  );
}
