import DateField from '../../components/DateField';
import Select from '../../components/Select';
import { useState, type ReactNode } from 'react';
import { Plus, ArrowUp, ArrowDown, CheckCircle2, SkipForward } from 'lucide-react';
import Dialog from '../../components/Dialog';
import { useAction } from '../../components/useAction';
import type { CaseEvent, SaveAction, Stage, Workspace } from '../../domain/types';
import { dateKey } from '../../domain/calendar';
const stageLabels = {
  pending: '待办理',
  current: '当前办理',
  done: '已完成',
  skipped: '已跳过',
} as const;
export default function Stages({
  caseId,
  proceedingId,
  data,
  save,
  children,
}: {
  caseId: string;
  proceedingId: string;
  data: Workspace;
  save: SaveAction;
  children?: ReactNode;
}) {
  const closed = data.proceedings.find((p) => p.id === proceedingId)?.state === 'completed';
  const history = data.caseEvents.filter(
    (e) => e.proceedingId === proceedingId && e.kind === 'stage_change',
  );
  const rows = data.stages
    .filter((s) => s.proceedingId === proceedingId)
    .sort((a, b) => a.position - b.position);
  const [manage, setManage] = useState(false);
  const [edit, setEdit] = useState<Stage | null>(null);
  const [name, setName] = useState('');
  const [remove, setRemove] = useState<Stage | null>(null);
  const [event, setEvent] = useState<CaseEvent | null>(null);
  const [statusStage, setStatusStage] = useState<Stage | null>(null);
  const [nextState, setNextState] = useState<Stage['state']>('pending');
  function adjust(stage: Stage) {
    setStatusStage(stage);
    setNextState(stage.state === 'done' || stage.state === 'skipped' ? 'pending' : stage.state);
  }
  const { busy, error, run } = useAction();
  async function reorder(index: number, delta: number) {
    const values = [...rows];
    [values[index], values[index + delta]] = [values[index + delta], values[index]];
    await run(() => save('reorder_stages', { proceedingId, ids: values.map((s) => s.id) }));
  }
  return (
    <>
      <section className="feature-section program-stage-section" aria-label="办理阶段">
        <header>
          <div className="program-current-stage">
            <h3>{closed ? '最后办理阶段' : '当前办理'}</h3>
            <strong className={!rows.some((s) => s.state === 'current') ? 'is-empty' : undefined}>
              {rows.find((s) => s.state === 'current')?.name || '尚未指定阶段'}
            </strong>
          </div>
          <button disabled={closed} onClick={() => setManage(true)}>
            管理阶段
          </button>
        </header>
        <div className="stage-strip">
          {rows.map((stage) => (
            <button
              key={stage.id}
              className={`stage-chip stage-${stage.state}`}
              disabled={busy || closed}
              title={`${stageLabels[stage.state]} · ${stage.state === 'pending' ? '点击设为当前阶段' : '点击调整状态'}`}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!busy && !closed) adjust(stage);
              }}
              onClick={() => {
                if (stage.state === 'pending')
                  void run(() => save('save_stage', { input: { ...stage, state: 'current' } }));
                else adjust(stage);
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
        {rows.length === 0 && <p className="quiet-empty">暂无阶段，可在“管理阶段”中添加。</p>}
        <details className="stage-help">
          <summary>阶段如何调整</summary>
          <p className="stage-guidance">
            顺序仅作办理参考，切换当前阶段不会自动完成其他阶段。点击已完成阶段可重新打开，也可在“管理阶段”中调整状态。
          </p>
        </details>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </section>
      {children}
      <section className="feature-section" aria-label="程序事项">
        <header>
          <h3>程序事项</h3>
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
          .filter((e) => e.proceedingId === proceedingId && e.kind !== 'stage_change')
          .map((e) => (
            <article className="case-event" key={e.id}>
              <time>{e.eventDate}</time>
              <div>
                <strong>{e.title}</strong>
                {e.notes && <p>{e.notes}</p>}
              </div>
            </article>
          ))}
        {!data.caseEvents.some(
          (e) => e.proceedingId === proceedingId && e.kind !== 'stage_change',
        ) && <p className="quiet-empty">暂无程序事项</p>}
      </section>
      {history.length > 0 && (
        <details className="case-history">
          <summary>阶段变更记录 · {history.length}</summary>
          <p className="field-hint">
            最新变更在前。这里保留完成、重开和当前阶段调整的历史，不限制实际办理顺序。
          </p>
          <div className="stage-history-list">
            {history.map((e) => (
              <article className="case-event" key={e.id}>
                <time>{e.eventDate}</time>
                <div>
                  <strong>{e.title}</strong>
                  {e.notes && <p>{e.notes}</p>}
                </div>
              </article>
            ))}
          </div>
        </details>
      )}
      {manage && (
        <Dialog title="管理办理阶段" onClose={() => setManage(false)}>
          <div className="feature-list">
            {rows.map((stage, index) => (
              <div className="feature-row" key={stage.id}>
                <span className="row-main">
                  {stage.name}
                  <small> · {stageLabels[stage.state]}</small>
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
                    disabled={busy}
                    aria-label={`调整${stage.name}状态`}
                    onClick={() => adjust(stage)}
                  >
                    {stage.state === 'done' || stage.state === 'skipped' ? '重新打开' : '状态'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`删除阶段${stage.name}`}
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
      {statusStage && (
        <Dialog
          title={`调整阶段状态 · ${statusStage.name}`}
          onClose={() => setStatusStage(null)}
          submitLabel="应用"
          onSubmit={async () => {
            await save('save_stage', { input: { ...statusStage, state: nextState } });
          }}
        >
          <p className="feature-description">
            {statusStage.name} · {stageLabels[statusStage.state]}
          </p>
          <label>
            调整为
            <Select
              aria-label="阶段状态"
              value={nextState}
              onValueChange={(value) => setNextState(value as Stage['state'])}
            >
              {Object.entries(stageLabels).map(([state, label]) => (
                <option key={state} value={state}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <p className="field-hint">
            重新打开只调整此阶段，其他阶段的完成状态保持不变。设为当前时，原当前阶段回到待办理；不会自动标记完成。历史记录保留。
          </p>
          <button
            type="button"
            className="case-delete-action"
            onClick={() => {
              setRemove(statusStage);
              setStatusStage(null);
            }}
          >
            删除此阶段
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
          <p className="field-hint">
            程序材料和其他阶段不受影响。
            {remove.state === 'current' &&
              '此阶段正在办理，删除后将暂不指定当前阶段，由你重新选择。'}
          </p>
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
