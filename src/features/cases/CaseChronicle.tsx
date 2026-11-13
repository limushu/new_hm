import { lazy, Suspense, useMemo, useState } from 'react';
import { Flag, NotebookPen, Files, ArrowUpRight, Check, Circle, Plus, Users } from 'lucide-react';
import Dialog from '../../components/Dialog';
import type { CaseFile, Material, SaveAction, Workspace } from '../../domain/types';
import { caseChronicle } from '../../domain/caseChronicle';
import { dateKey } from '../../domain/calendar';
import { currentStage, proceedingName } from '../../domain/proceedings';
import { caseScope, resourceLinks } from '../../domain/workspace';
import { WorkTaskEditor } from './WorkTasks';
import { MilestoneEditor } from './CaseQuickActions';
import { RecordForm } from './Records';
import Materials, { materialIcon } from '../materials/Materials';
const Preview = lazy(() => import('../materials/Preview'));

export default function CaseChronicle({
  item,
  data,
  save,
  onProgram,
  onPeople,
}: {
  item: CaseFile;
  data: Workspace;
  save: SaveAction;
  onProgram: (id: string) => void;
  onPeople: () => void;
}) {
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(8);
  const [eventId, setEventId] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState(false);
  const [draftId, setDraftId] = useState('');
  const [recordId, setRecordId] = useState<string | null>(null);
  const [editRecord, setEditRecord] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [material, setMaterial] = useState<Material | null>(null);
  const [materialGroup, setMaterialGroup] = useState<Material[] | null>(null);
  const today = dateKey(new Date());
  const rows = useMemo(() => caseChronicle(data, item.id), [data, item.id]);
  const visible = rows.filter(
    (r) => (!r.date || r.date <= today) && (filter === 'all' || r.kind === filter),
  );
  const plans = rows.filter((r) => r.date > today);
  const programs = data.proceedings.filter((p) => p.caseId === item.id);
  const focus =
    programs.find((p) => p.id === item.currentProceedingId) ??
    programs.find((p) => p.state === 'active');
  const stages = data.stages
    .filter((s) => s.proceedingId === focus?.id)
    .sort((a, b) => a.position - b.position);
  const pending = data.tasks
    .filter((t) => t.caseId === item.id && !t.completed)
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  const next = pending[0];
  const task = data.tasks.find((t) => t.id === taskId);
  const record = data.workRecords.find((r) => r.id === recordId);
  const event = data.caseEvents.find((e) => e.id === eventId);
  const labels = { event: '发生日期', record: '记录时间', materials: '归档时间' };
  function openFile(m: Material) {
    if (/\.(pdf|png|jpe?g|gif|webp|bmp|webm|ogg|mp3|wav|m4a|mp4|md|txt)$/i.test(m.name))
      setMaterial(m);
    else setMaterialGroup([m]);
  }
  const fileChips = (files: Material[]) => (
    <div className="chronicle-file-chips">
      {files.slice(0, 2).map((m) => (
        <button key={m.id} onClick={() => openFile(m)}>
          {materialIcon(m)}
          <span>{m.name}</span>
        </button>
      ))}
      {files.length > 2 && (
        <button onClick={() => setMaterialGroup(files)}>+{files.length - 2}</button>
      )}
    </div>
  );
  return (
    <div className="case-chronicle">
      <header className="chronicle-context">
        <div>
          <span className="chronicle-eyebrow">案件进度</span>
          <h2>
            {focus
              ? `${proceedingName(focus, programs)} · ${focus.state === 'completed' ? '已办结' : currentStage(data, focus)}`
              : '尚未指定办理流程'}
          </h2>
        </div>
        <button className="chronicle-people-link" onClick={onPeople}>
          <Users />
          相关人
        </button>
      </header>
      {focus && (
        <button
          className="chronicle-stages"
          aria-label="查看当前办理流程"
          onClick={() => onProgram(focus.id)}
        >
          {stages.map((s) => (
            <span key={s.id} className={`chronicle-stage ${s.state}`}>
              {s.state === 'done' ? <Check /> : <Circle />}
              <span>{s.name}</span>
              {s.state === 'current' && <small>当前</small>}
            </span>
          ))}
          <ArrowUpRight />
        </button>
      )}
      {next && (
        <button className="chronicle-next" onClick={() => setTaskId(next.id)}>
          <span className="chronicle-eyebrow">接下来</span>
          <strong>{next.title}</strong>
          <small>
            {next.dueDate
              ? `${next.dueDate < today ? '已逾期 · ' : ''}${next.dueDate} 截止`
              : '尚未设置截止日期'}
          </small>
          <ArrowUpRight />
        </button>
      )}
      {!next && (
        <p className="chronicle-empty-focus">
          {item.statusId === 'closed'
            ? '案件已结案，可继续查阅完整脉络。'
            : '当前没有未完成待办，可从下方「创建」安排下一步。'}
        </p>
      )}
      <div className="chronicle-heading">
        <h3>案件时间轴</h3>
        <button
          onClick={() => {
            setDraftId(crypto.randomUUID());
            setNewEvent(true);
          }}
        >
          <Plus />
          关键事件
        </button>
      </div>
      <nav className="chronicle-filters" aria-label="时间轴筛选">
        {[
          ['all', '全部'],
          ['event', '关键事件'],
          ['record', '工作记录'],
          ['materials', '材料'],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={filter === id}
            onClick={() => {
              setFilter(id);
              setLimit(8);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {plans.length > 0 && (
        <details className="chronicle-plans">
          <summary>后续计划 · {plans.length}</summary>
          {plans.map((e) => (
            <button key={e.id} onClick={() => setEventId(e.resourceId)}>
              <time>{e.date}</time>
              <span>{e.title}</span>
              <small>计划</small>
            </button>
          ))}
        </details>
      )}
      <ol className="chronicle-timeline">
        {visible.slice(0, limit).map((row) => {
          const Icon = row.kind === 'event' ? Flag : row.kind === 'record' ? NotebookPen : Files;
          return (
            <li key={row.id} className={`chronicle-entry chronicle-${row.kind}`}>
              <div className="chronicle-date">
                <time>{row.date || '日期未记录'}</time>
                <small>{labels[row.kind]}</small>
              </div>
              <span className="chronicle-marker">
                <Icon />
              </span>
              <article>
                <button
                  className="chronicle-entry-title"
                  onClick={() =>
                    row.kind === 'event'
                      ? setEventId(row.resourceId)
                      : row.kind === 'record'
                        ? setRecordId(row.resourceId)
                        : setMaterialGroup(row.files)
                  }
                >
                  {row.title}
                  <ArrowUpRight />
                </button>
                {row.kind !== 'materials' && <p className="chronicle-excerpt">{row.body}</p>}
                {fileChips(row.files)}
              </article>
            </li>
          );
        })}
      </ol>
      {!visible.length && (
        <div className="chronicle-empty">
          <Flag />
          <p>这里还没有{filter === 'event' ? '关键事件' : '相关记录'}</p>
          <span>记录一次重要变化，逐步形成案件脉络。</span>
        </div>
      )}
      {visible.length > limit && (
        <button className="chronicle-load-more" onClick={() => setLimit((v) => v + 12)}>
          查看更早记录 · 还有 {visible.length - limit} 条
        </button>
      )}
      {(newEvent || event) && (
        <MilestoneEditor
          value={
            event ?? {
              id: draftId,
              caseId: item.id,
              proceedingId: null,
              title: '',
              eventDate: today,
              notes: '',
            }
          }
          data={data}
          save={save}
          onClose={() => {
            setEventId(null);
            setNewEvent(false);
          }}
        />
      )}
      {task && (
        <WorkTaskEditor task={task} data={data} save={save} onClose={() => setTaskId(null)} />
      )}
      {record && (
        <Dialog
          title="工作记录详情"
          className="chronicle-record-dialog"
          onClose={() => {
            setRecordId(null);
            setEditRecord(false);
          }}
        >
          <p className="chronicle-record-body">{record.body}</p>
          <button onClick={() => setEditRecord(true)}>编辑记录</button>
          <Materials caseId={item.id} data={data} save={save} recordId={record.id} />
        </Dialog>
      )}
      {record && editRecord && (
        <RecordForm
          value={record}
          data={data}
          save={save}
          scope={resourceLinks(data, 'record', record.id)[0] ?? caseScope}
          onClose={() => setEditRecord(false)}
        />
      )}
      {materialGroup && (
        <Dialog title="关联材料" onClose={() => setMaterialGroup(null)}>
          <div className="case-found-materials">
            {materialGroup.map((m) => (
              <div key={m.id}>
                {materialIcon(m)}
                <strong>{m.name}</strong>
                {/\.(pdf|png|jpe?g|gif|webp|bmp|webm|ogg|mp3|wav|m4a|mp4|md|txt)$/i.test(
                  m.name,
                ) && <button onClick={() => setMaterial(m)}>阅读</button>}
              </div>
            ))}
          </div>
          <p className="field-hint">全部原件保留在材料页，不支持预览的格式可从材料页导出。</p>
        </Dialog>
      )}
      {material && (
        <Suspense fallback={null}>
          <Preview item={material} onClose={() => setMaterial(null)} />
        </Suspense>
      )}
    </div>
  );
}
