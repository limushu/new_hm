import { useId, useRef, useState, type CSSProperties } from 'react';
import { ArrowRightCircle, Folder, Plus, Search } from 'lucide-react';
import { programLabels } from '../../domain/types';
import type { CaseFile, Workspace } from '../../domain/types';
import { useBoardDrag } from './useBoardDrag';
import './case-board.css';

interface Props {
  data: Workspace;
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
}: Props) {
  const board = useRef<HTMLDivElement>(null);
  const instructionId = useId();
  const [pending, setPending] = useState<{ id: string; statusId: string } | null>(null);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const activeCases = data.cases.filter((item) => !item.deletedAt);
  const queryText = query.trim().toLocaleLowerCase();
  const matches = (item: CaseFile) =>
    item.title.toLocaleLowerCase().includes(queryText) ||
    data.proceedings.some(
      (program) =>
        program.caseId === item.id && program.caseNumber.toLocaleLowerCase().includes(queryText),
    );
  const statusOf = (item: CaseFile) => (pending?.id === item.id ? pending.statusId : item.statusId);

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
    !!pending,
    (id, statusId) => {
      void move(id, statusId);
    },
  );
  const dragItem = drag ? activeCases.find((item) => item.id === drag.id) : null;
  const overName = data.statuses.find((status) => status.id === drag?.over)?.name;

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
          {program
            ? programLabels[program.kind]
            : item.caseType === 'civil'
              ? '民商事诉讼'
              : '其他案件'}
          {program?.stage ? ` · ${program.stage}` : ''}
        </span>
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
        拖动到其他状态列更改状态。键盘可按空格拿起，左右方向键选列，回车放下，Escape 取消。
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
                style={palettes[status.id]}
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
                {drag && (
                  <span className="column-drop-hint" aria-hidden="true">
                    {drag.over === status.id ? '放到这里' : ''}
                  </span>
                )}
              </section>
            );
          })}
        </div>
      )}
      {drag && dragItem && !drag.keyboard && (
        <div
          className="case-card case-drag-preview"
          aria-hidden="true"
          style={{
            ...palettes[drag.over ?? statusOf(dragItem)],
            left: drag.x,
            top: drag.y,
            width: drag.width,
          }}
        >
          {content(dragItem)}
        </div>
      )}
    </div>
  );
}
