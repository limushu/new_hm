import { currentStage, proceedingName } from '../../domain/proceedings';
import Dialog from '../../components/Dialog';
import { useId, useRef, useState, type CSSProperties } from 'react';
import { ArrowRightCircle, Folder, Plus, Search, MoreHorizontal, Trash2 } from 'lucide-react';
import type { CaseFile, CaseStatus, SaveAction, Workspace } from '../../domain/types';
import { useBoardDrag, trashTarget } from './useBoardDrag';
import './case-board.css';

interface Props {
  data: Workspace;
  save: SaveAction;
  query: string;
  loading: boolean;
  onQueryChange: (value: string) => void;
  onCreate: (statusId: string) => void;
  onOpen: (id: string) => void;
  onMove: (id: string, statusId: string) => Promise<void>;
}

const palettes: Record<string, CSSProperties> = {
  not_started: {
    '--column-bg': '#202020',
    '--card-bg': '#202020',
    '--card-border': '#333333',
    '--status-bg': '#585854',
    '--status-dot': '#93938c',
    '--status-accent': '#b5b5ad',
  } as CSSProperties,
  in_progress: {
    '--column-bg': '#1b2229',
    '--card-bg': '#203040',
    '--card-border': '#263c50',
    '--status-bg': '#2d5d86',
    '--status-dot': '#3b9be4',
    '--status-accent': '#73a8d2',
  } as CSSProperties,
  closed: {
    '--column-bg': '#1c251f',
    '--card-bg': '#21372a',
    '--card-border': '#294331',
    '--status-bg': '#34664d',
    '--status-dot': '#54a77d',
    '--status-accent': '#7bb493',
  } as CSSProperties,
};

export default function CaseBoard({
  data,
  query,
  loading,
  onQueryChange,
  onCreate,
  onOpen,
  onMove,
  save,
}: Props) {
  const [exampleId] = useState(() => crypto.randomUUID());
  const [exampleBusy, setExampleBusy] = useState(false);
  const [statusEdit, setStatusEdit] = useState<CaseStatus | null>(null);
  const [statusName, setStatusName] = useState('');
  const [statusColor, setStatusColor] = useState('#768b9a');
  function editStatus(status: CaseStatus) {
    setStatusEdit(status);
    setStatusName(status.name);
    setStatusColor(status.color);
  }
  const tone = (id: string) =>
    ((data.statuses.find((s) => s.id === id)?.color ?? '').toLowerCase() ===
    (
      { not_started: '#96938b', in_progress: '#7098b9', closed: '#7e9b85' } as Record<
        string,
        string
      >
    )[id]
      ? palettes[id]
      : undefined) ??
    ({
      '--column-bg': (data.statuses.find((s) => s.id === id)?.color ?? '#768b9a') + '12',
      '--card-bg': (data.statuses.find((s) => s.id === id)?.color ?? '#768b9a') + '20',
      '--card-border': (data.statuses.find((s) => s.id === id)?.color ?? '#768b9a') + '40',
      '--status-bg': (data.statuses.find((s) => s.id === id)?.color ?? '#768b9a') + '60',
      '--status-dot': data.statuses.find((s) => s.id === id)?.color ?? '#768b9a',
      '--status-accent': data.statuses.find((s) => s.id === id)?.color ?? '#768b9a',
    } as CSSProperties);
  const board = useRef<HTMLDivElement>(null);
  const instructionId = useId();
  const [pending, setPending] = useState<{ id: string; statusId: string } | null>(null);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [removed, setRemoved] = useState<CaseFile | null>(null);
  const [trashBusy, setTrashBusy] = useState(false);
  const activeCases = data.cases.filter((item) => !item.deletedAt);
  const queryText = query.trim().toLocaleLowerCase();
  const matches = (item: CaseFile) =>
    item.title.toLocaleLowerCase().includes(queryText) ||
    data.caseTags.some(
      (t) => t.caseId === item.id && t.tag.includes(queryText.replace(/^#/, '')),
    ) ||
    data.proceedings.some(
      (program) =>
        program.caseId === item.id && program.caseNumber.toLocaleLowerCase().includes(queryText),
    );
  const statusOf = (item: CaseFile) => (pending?.id === item.id ? pending.statusId : item.statusId);
  async function trash(id: string) {
    const item = activeCases.find((c) => c.id === id);
    if (!item || saving.current) return;
    saving.current = true;
    setTrashBusy(true);
    setError('');
    try {
      await save('trash_case', { id });
      setRemoved(item);
      setNotice(`“${item.title}”已移入回收站`);
    } catch (error) {
      setError(`删除未完成，案件已保留。${String(error)}`);
    } finally {
      saving.current = false;
      setTrashBusy(false);
    }
  }

  async function move(id: string, statusId: string) {
    const item = activeCases.find((item) => item.id === id);
    const status = data.statuses.find((status) => status.id === statusId);
    if (!item || !status || item.statusId === statusId || saving.current) return;
    saving.current = true;
    setPending({ id, statusId });
    setError('');
    setNotice(`正在将“${item.title}”移至${status.name}`);
    try {
      await onMove(id, statusId);
      setNotice(`“${item.title}”已移至${status.name}`);
    } catch (error) {
      setError(`状态未保存，案件已回到原来的列。${String(error)}`);
      setNotice('移动未完成');
    } finally {
      saving.current = false;
      setPending(null);
      requestAnimationFrame(() => {
        Array.from(board.current?.querySelectorAll<HTMLButtonElement>('[data-case-id]') ?? [])
          .find((card) => card.dataset.caseId === id)
          ?.focus({ preventScroll: true });
      });
    }
  }
  const { drag, pointerDown, lift, canOpen } = useBoardDrag(
    board,
    data.statuses,
    !!pending || trashBusy,
    (id, statusId) => {
      if (statusId === trashTarget) void trash(id);
      else void move(id, statusId);
    },
  );
  const dragItem = drag ? activeCases.find((item) => item.id === drag.id) : null;
  const overName =
    drag?.over === trashTarget
      ? '回收站'
      : data.statuses.find((status) => status.id === drag?.over)?.name;

  function content(item: CaseFile) {
    const program = data.proceedings.find((program) => program.id === item.currentProceedingId);
    const next = data.tasks
      .filter((task) => task.caseId === item.id && !task.completed && task.dueDate)
      .sort((left, right) => left.dueDate!.localeCompare(right.dueDate!))[0];
    return (
      <>
        <span className="case-card-title">
          <Folder />
          <span>{item.title}</span>
        </span>
        <span className="case-card-meta">
          {program ? '关注 ' + proceedingName(program, data.proceedings) : '案件档案'}
          {program ? ` · ${currentStage(data, program)}` : ' · 未指定关注程序'}
        </span>
        {data.caseTags.some((t) => t.caseId === item.id) && (
          <span className="case-card-tags">
            {data.caseTags
              .filter((t) => t.caseId === item.id)
              .slice(0, 2)
              .map((t) => (
                <span key={t.tag}>#{t.tag}</span>
              ))}
          </span>
        )}
        {next && (
          <time dateTime={next.dueDate!} title={next.title}>
            {next.dueDate} · {next.title}
          </time>
        )}
      </>
    );
  }

  return (
    <div className="cases-page">
      <h1>
        <Folder />
        案件
      </h1>
      {!loading && !data.cases.length && (
        <p className="onboarding-note">
          直接新建案件开始，也可以先
          <button
            disabled={exampleBusy}
            onClick={async () => {
              if (exampleBusy) return;
              setExampleBusy(true);
              try {
                await save('seed_example', { id: exampleId });
              } catch (error) {
                setError(String(error));
              } finally {
                setExampleBusy(false);
              }
            }}
          >
            添加虚构示例案件
          </button>
          熟悉功能。
        </p>
      )}
      <div className="board-toolbar">
        <span className="view-pill">
          <ArrowRightCircle />
          按状态
        </span>
        <label className="board-search">
          <Search />
          <input
            aria-label="搜索案件"
            placeholder="搜索案件名称、案号"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
        <span className="case-count">{activeCases.length} 个案件</span>
      </div>
      <p className="board-sr-only" id={instructionId}>
        拖动到其他状态列更改状态，或拖到回收站删除。键盘可按空格拿起，左右方向键选列，向下选回收站，回车放下，Escape
        取消。
      </p>
      <p className="board-sr-only" role="status" aria-live="polite">
        {drag
          ? `已拿起“${dragItem?.title}”。${overName ? `目标：${overName}` : '移至状态列后放下'}`
          : notice}
      </p>
      {error && (
        <p className="board-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="empty-text">正在打开本地工作空间…</p>
      ) : (
        <div className={`case-board ${drag ? 'has-drag' : ''}`} ref={board}>
          {data.statuses.map((status, index) => {
            const cases = activeCases.filter(
              (item) => statusOf(item) === status.id && matches(item),
            );
            return (
              <section
                className={`case-column ${drag?.over === status.id ? 'is-drop-target' : ''}`}
                style={tone(status.id)}
                key={status.id}
                data-status-id={status.id}
                aria-label={`${status.name}案件`}
              >
                <header>
                  <span className="board-status-pill">
                    <i />
                    {status.name}
                  </span>
                  <small>{cases.length}</small>
                  <button
                    className="icon-button column-menu"
                    title={`编辑${status.name}状态`}
                    onClick={() => editStatus(status)}
                  >
                    <MoreHorizontal />
                  </button>
                  <button
                    className="icon-button column-create"
                    title={`在${status.name}中新建案件`}
                    onClick={() => onCreate(status.id)}
                  >
                    <Plus />
                  </button>
                </header>
                <div className="case-cards">
                  {cases.map((item) => (
                    <button
                      className={`case-card ${drag?.id === item.id ? 'is-dragging' : ''} ${pending?.id === item.id ? 'is-saving' : ''}`}
                      key={item.id}
                      data-case-id={item.id}
                      aria-label={item.title}
                      aria-describedby={instructionId}
                      aria-disabled={pending?.id === item.id || undefined}
                      onPointerDown={(event) => pointerDown(event, item.id)}
                      onKeyDown={(event) => {
                        if (event.key === ' ' && !drag && !event.repeat) {
                          event.preventDefault();
                          event.stopPropagation();
                          lift(item.id, statusOf(item));
                        }
                      }}
                      onClick={() => {
                        if (canOpen() && !pending) onOpen(item.id);
                      }}
                    >
                      {content(item)}
                    </button>
                  ))}
                </div>
                {index === 0 && (
                  <button className="new-case" onClick={() => onCreate(status.id)}>
                    <Plus />
                    新建案件
                  </button>
                )}
                {!cases.length && queryText && <p className="column-empty">没有匹配的案件</p>}
              </section>
            );
          })}
          <button
            className="add-status"
            title="新增状态"
            onClick={() => editStatus({ id: crypto.randomUUID(), name: '', color: '#768b9a' })}
          >
            <Plus />
          </button>
        </div>
      )}
      {drag && dragItem && !drag.keyboard && (
        <div
          className="case-card case-drag-preview"
          aria-hidden="true"
          style={{
            ...tone(drag.over && drag.over !== trashTarget ? drag.over : statusOf(dragItem)),
            left: drag.x,
            top: drag.y,
            width: drag.width,
          }}
        >
          {content(dragItem)}
        </div>
      )}
      {!loading && (
        <div className="board-bottom">
          <div
            className={`case-trash-target ${drag ? 'drag-ready' : ''} ${drag?.over === trashTarget ? 'is-over' : ''}`}
            data-case-trash-target="true"
            role="region"
            aria-label="拖拽删除案件"
          >
            <Trash2 />
            <span>{drag?.over === trashTarget ? '松开移入回收站' : '拖到这里删除案件'}</span>
          </div>
          {removed && (
            <div className="case-trash-notice" role="status">
              <span>“{removed.title}”已移入回收站</span>
              <button
                disabled={trashBusy}
                onClick={async () => {
                  if (saving.current) return;
                  saving.current = true;
                  setTrashBusy(true);
                  setError('');
                  try {
                    await save('restore_item', { kind: 'case', id: removed.id });
                    setRemoved(null);
                  } catch (error) {
                    setError(String(error));
                  } finally {
                    saving.current = false;
                    setTrashBusy(false);
                  }
                }}
              >
                撤销
              </button>
            </div>
          )}
        </div>
      )}
      {statusEdit && (
        <Dialog
          title={statusEdit.name ? '编辑案件状态' : '新增案件状态'}
          onClose={() => setStatusEdit(null)}
          onSubmit={async () => {
            await save('save_case_status', {
              input: { ...statusEdit, name: statusName, color: statusColor },
            });
          }}
        >
          <label>
            状态名称
            <input
              aria-label="状态名称"
              required
              maxLength={30}
              value={statusName}
              onChange={(e) => setStatusName(e.target.value)}
            />
          </label>
          <label>
            状态颜色
            <input
              aria-label="状态颜色"
              type="color"
              value={statusColor}
              onChange={(e) => setStatusColor(e.target.value)}
            />
          </label>
          {!['not_started', 'in_progress', 'closed'].includes(statusEdit.id) &&
            data.statuses.some((s) => s.id === statusEdit.id) && (
              <button
                type="button"
                className="inline-link danger"
                onClick={async () => {
                  try {
                    await save('delete_case_status', { id: statusEdit.id });
                    setStatusEdit(null);
                  } catch (error) {
                    setError(String(error));
                    setStatusEdit(null);
                  }
                }}
              >
                删除空状态列
              </button>
            )}
        </Dialog>
      )}
    </div>
  );
}
