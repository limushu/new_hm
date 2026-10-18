import DateField from '../../components/DateField';
import Select from '../../components/Select';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Clock3, MapPin, Trash2, X } from 'lucide-react';
import type { CalendarEvent, CaseFile, SaveAction, Workspace, WorkScope } from '../../domain/types';
import WorkScopeField from '../cases/WorkScopeField';
import { caseScope, resourceLinks } from '../../domain/workspace';
import { validateEvent } from './schedule';
import CaseAssociation from './CaseAssociation';

interface Props {
  event: CalendarEvent;
  existing: boolean;
  cases: CaseFile[];
  save: SaveAction;
  onClose: () => void;
  onSaved: (date: string) => void;
  data?: Workspace;
  initialScope?: WorkScope;
}

export default function EventEditor({
  event,
  existing,
  cases,
  save,
  onClose,
  onSaved,
  data,
  initialScope = caseScope,
}: Props) {
  const [scope, setScope] = useState<WorkScope>(
    data ? (resourceLinks(data, 'event', event.id)[0] ?? initialScope) : initialScope,
  );
  const [value, setValue] = useState(event);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inFlight = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLInputElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    title.current?.focus();
  }, []);
  const update = (patch: Partial<CalendarEvent>) => {
    if ('caseId' in patch && patch.caseId !== value.caseId) setScope(caseScope);
    setValue((current) => ({ ...current, ...patch }));
  };
  async function submit() {
    if (inFlight.current) return;
    const invalid = validateEvent(value);
    if (invalid) {
      setError(invalid);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      if (data)
        await save('save_work_event', { input: { ...value, title: value.title.trim() }, ...scope });
      else await save('save_calendar_event', { input: { ...value, title: value.title.trim() } });
      onSaved(value.startDate);
    } catch (reason) {
      setError(String(reason));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (inFlight.current) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await save('delete_calendar_event', { id: value.id });
      onClose();
    } catch (reason) {
      setError(String(reason));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="event-editor"
      aria-labelledby="event-editor-heading"
      onCancel={(e) => {
        e.preventDefault();
        if (!inFlight.current) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <header>
          <span id="event-editor-heading">{existing ? '编辑日程' : '新建日程'}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭日程"
            onClick={onClose}
            disabled={busy}
          >
            <X />
          </button>
        </header>
        <fieldset disabled={busy}>
          <input
            ref={title}
            className="event-title-input"
            aria-label="日程名称"
            placeholder="添加日程名称"
            value={value.title}
            maxLength={200}
            onChange={(e) => update({ title: e.target.value })}
            required
          />
          <label className="all-day-switch">
            <Clock3 />
            <span>全天</span>
            <input
              type="checkbox"
              aria-label="全天日程"
              checked={value.startTime === null}
              onChange={(e) =>
                update(
                  e.target.checked
                    ? { startTime: null, endTime: null }
                    : { startTime: '09:00', endTime: '09:30' },
                )
              }
            />
          </label>
          <div className="event-date-fields">
            <CalendarDays />
            <div>
              <label>
                <span>开始</span>
                <DateField
                  aria-label="开始日期"
                  value={value.startDate}
                  required
                  onValueChange={(date) =>
                    update({
                      startDate: date,
                      endDate: value.endDate < date ? date : value.endDate,
                    })
                  }
                />
                {value.startTime !== null && (
                  <input
                    type="time"
                    aria-label="开始时间"
                    required
                    value={value.startTime}
                    onChange={(e) => update({ startTime: e.target.value })}
                  />
                )}
              </label>
              <label>
                <span>结束</span>
                <DateField
                  aria-label="结束日期"
                  value={value.endDate}
                  required
                  min={value.startDate}
                  onValueChange={(value) => update({ endDate: value })}
                />
                {value.endTime !== null && (
                  <input
                    type="time"
                    aria-label="结束时间"
                    required
                    value={value.endTime}
                    onChange={(e) => update({ endTime: e.target.value })}
                  />
                )}
              </label>
            </div>
          </div>
          <label className="event-reminder-field">
            提醒
            <Select
              aria-label="日程提醒时间"
              value={value.reminderMinutes ?? 'none'}
              onValueChange={(value) =>
                update({
                  reminderMinutes: value === 'none' ? null : Number(value),
                })
              }
            >
              <option value="none">不提醒</option>
              <option value="0">开始时</option>
              <option value="5">提前5分钟</option>
              <option value="15">提前15分钟</option>
              <option value="30">提前30分钟</option>
              <option value="60">提前1小时</option>
              <option value="1440">提前1天</option>
              <option value="10080">提前1周</option>
            </Select>
            {value.startTime === null &&
              value.reminderMinutes !== undefined &&
              value.reminderMinutes !== null && <small>全天安排以当天09:00为提醒基准</small>}
          </label>
          <CaseAssociation
            value={value.caseId}
            cases={cases}
            onChange={(caseId) => update({ caseId })}
          />
          {data && value.caseId && (
            <WorkScopeField caseId={value.caseId} data={data} value={scope} onChange={setScope} />
          )}
          <label className="event-property">
            <MapPin />
            <input
              aria-label="地点"
              placeholder="添加地点"
              maxLength={500}
              value={value.location}
              onChange={(e) => update({ location: e.target.value })}
            />
          </label>
          <textarea
            aria-label="日程备注"
            placeholder="添加备注…"
            maxLength={20000}
            rows={3}
            value={value.notes}
            onChange={(e) => update({ notes: e.target.value })}
          />
        </fieldset>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <footer>
          {existing && (
            <button
              type="button"
              className={`event-delete ${confirmDelete ? 'confirming' : ''}`}
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 />
              {confirmDelete ? '确认删除' : '删除'}
            </button>
          )}
          <button type="button" className="event-cancel" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="submit" className="calendar-primary" disabled={busy || !value.title.trim()}>
            {busy ? '保存中…' : '保存日程'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
