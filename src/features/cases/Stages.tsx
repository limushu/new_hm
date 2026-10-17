import DateField from '../../components/DateField';
import Select from '../../components/Select';
import { useState } from 'react';
import { Plus, ArrowUp, ArrowDown, CheckCircle2, SkipForward } from 'lucide-react';
import Dialog from '../../components/Dialog';
import { useAction } from '../../components/useAction';
import type { CaseEvent, SaveAction, Stage, Workspace } from '../../domain/types';
import { dateKey } from '../../domain/calendar';
export default function Stages({
  caseId,
  proceedingId,
  data,
  save,
}: {
  caseId: string;
  proceedingId: string;
  data: Workspace;
  save: SaveAction;
}) {
  const rows = data.stages
    .filter((s) => s.proceedingId === proceedingId)
    .sort((a, b) => a.position - b.position);
  const [manage, setManage] = useState(false);
  const [edit, setEdit] = useState<Stage | null>(null);
  const [name, setName] = useState('');
  const [remove, setRemove] = useState<Stage | null>(null);
  const [event, setEvent] = useState<CaseEvent | null>(null);
  const { busy, error, run } = useAction();
  async function reorder(index: number, delta: number) {
    const values = [...rows];
    [values[index], values[index + delta]] = [values[index + delta], values[index]];
    await run(() => save('reorder_stages', { proceedingId, ids: values.map((s) => s.id) }));
  }
  return (
    <>
      <section className="feature-section">
        <header>
          <h3>办理阶段</h3>
          <button onClick={() => setManage(true)}>管理阶段</button>
        </header>
        <div className="stage-strip">
          {rows.map((stage) => (
            <button
              key={stage.id}
              className={`stage-chip stage-${stage.state}`}
              disabled={busy}
              title={stage.state === 'current' ? '当前阶段' : '点击切换到此阶段'}
              onClick={() => {
                if (stage.state !== 'current')
                  void run(() => save('save_stage', { input: { ...stage, state: 'current' } }));
              }}
            >
              {stage.state === 'done' ? (
                <CheckCircle2 />
              ) : stage.state === 'skipped' ? (
                <SkipForward />
              ) : (
                <i />
              )}
              {stage.name}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </section>
      <section className="feature-section">
        <header>
          <h3>程序事件与关键日期</h3>
          <button
            onClick={() =>
              setEvent({
                id: crypto.randomUUID(),
                caseId,
                proceedingId,
                title: '',
                eventDate: dateKey(new Date()),
                notes: '',
              })
            }
          >
            <Plus />
            记录事件
          </button>
        </header>
        {data.caseEvents
          .filter((e) => e.proceedingId === proceedingId)
          .map((e) => (
            <article className="case-event" key={e.id}>
              <time>{e.eventDate}</time>
              <div>
                <strong>{e.title}</strong>
                {e.notes && <p>{e.notes}</p>}
              </div>
            </article>
          ))}
        {!data.caseEvents.some((e) => e.proceedingId === proceedingId) && (
          <p className="quiet-empty">阶段切换会保留记录，也可记录开庭、鉴定、调解等事件。</p>
        )}
      </section>
      {manage && (
        <Dialog title="管理办理阶段" onClose={() => setManage(false)}>
          <div className="feature-list">
            {rows.map((stage, index) => (
              <div className="feature-row" key={stage.id}>
                <span className="row-main">
                  {stage.name}
                  <small>
                    {' '}
                    ·{' '}
                    {
                      (
                        {
                          pending: '未开始',
                          current: '当前',
                          done: '已完成',
                          skipped: '已跳过',
                        } as const
                      )[stage.state]
                    }
                  </small>
                </span>
                <div className="row-actions">
                  <button
                    type="button"
                    aria-label={`上移${stage.name}`}
                    disabled={busy || index === 0}
                    onClick={() => void reorder(index, -1)}
                  >
                    <ArrowUp />
                  </button>
                  <button
                    type="button"
                    aria-label={`下移${stage.name}`}
                    disabled={busy || index === rows.length - 1}
                    onClick={() => void reorder(index, 1)}
                  >
                    <ArrowDown />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEdit(stage);
                      setName(stage.name);
                    }}
                  >
                    改名
                  </button>
                  <button
                    type="button"
                    disabled={busy || stage.state === 'current'}
                    onClick={() =>
                      void run(() =>
                        save('save_stage', {
                          input: {
                            ...stage,
                            state: stage.state === 'skipped' ? 'pending' : 'skipped',
                          },
                        }),
                      )
                    }
                  >
                    {stage.state === 'skipped' ? '恢复' : '跳过'}
                  </button>
                  <button
                    type="button"
                    disabled={stage.state === 'current'}
                    onClick={() => setRemove(stage)}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="inline-link"
            onClick={() => {
              setEdit({
                id: crypto.randomUUID(),
                proceedingId,
                name: '',
                position: rows.length,
                state: 'pending',
              });
              setName('');
            }}
          >
            <Plus />
            新增阶段
          </button>
        </Dialog>
      )}
      {edit && (
        <Dialog
          title={edit.name ? '阶段改名' : '新增阶段'}
          onClose={() => setEdit(null)}
          onSubmit={async () => {
            await save('save_stage', { input: { ...edit, name } });
          }}
        >
          <label>
            阶段名称
            <input
              aria-label="阶段名称"
              required
              autoFocus
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </Dialog>
      )}
      {remove && (
        <Dialog
          title="删除阶段"
          onClose={() => setRemove(null)}
          danger
          submitLabel="删除"
          onSubmit={async () => {
            await save('delete_stage', { id: remove.id });
          }}
        >
          <p className="feature-description">删除“{remove.name}”？已发生的事件记录会保留。</p>
        </Dialog>
      )}
      {event && <EventForm value={event} save={save} onClose={() => setEvent(null)} />}
    </>
  );
}
function EventForm({
  value,
  save,
  onClose,
}: {
  value: CaseEvent;
  save: SaveAction;
  onClose: () => void;
}) {
  const [input, setInput] = useState(value);
  const [calendar, setCalendar] = useState(false);
  const [reminder, setReminder] = useState('none');
  const update = (patch: Partial<CaseEvent>) => setInput((v) => ({ ...v, ...patch }));
  return (
    <Dialog
      title="记录程序事件"
      onClose={onClose}
      onSubmit={async () => {
        await save('save_case_event', { input });
        if (calendar)
          await save('save_calendar_event', {
            input: {
              id: input.id,
              title: input.title,
              startDate: input.eventDate,
              endDate: input.eventDate,
              startTime: null,
              endTime: null,
              caseId: input.caseId,
              location: '',
              notes: input.notes,
              reminderMinutes: reminder === 'none' ? null : Number(reminder),
            },
          });
      }}
    >
      <label>
        事件名称
        <input
          aria-label="事件名称"
          value={input.title}
          onChange={(e) => update({ title: e.target.value })}
          required
          autoFocus
          maxLength={200}
        />
      </label>
      <label>
        日期
        <DateField
          aria-label="事件日期"
          value={input.eventDate}
          required
          onValueChange={(value) => update({ eventDate: value })}
        />
      </label>
      <label>
        说明
        <textarea
          aria-label="事件说明"
          rows={3}
          maxLength={20000}
          value={input.notes}
          onChange={(e) => update({ notes: e.target.value })}
        />
      </label>
      <label className="checkbox-field">
        <input type="checkbox" checked={calendar} onChange={(e) => setCalendar(e.target.checked)} />
        同时加入此案件的日历
      </label>
      {calendar && (
        <>
          <label>
            提醒
            <Select
              aria-label="事件提醒"
              value={reminder}
              onValueChange={(value) => setReminder(value)}
            >
              <option value="none">不提醒</option>
              <option value="0">当天 09:00</option>
              <option value="1440">提前一天 09:00</option>
              <option value="10080">提前一周 09:00</option>
            </Select>
          </label>
          <p className="field-hint">将创建与此案件关联的全天日程；可在日历中再调整时间。</p>
        </>
      )}
    </Dialog>
  );
}
