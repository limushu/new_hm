import { Folder, Plus, Search } from 'lucide-react';
import { programLabels } from '../../domain/types';
import type { Workspace } from '../../domain/types';

interface Props {
  data: Workspace;
  query: string;
  loading: boolean;
  onQueryChange: (value: string) => void;
  onCreate: (statusId: string) => void;
  onOpen: (id: string) => void;
}

export default function CaseBoard({
  data,
  query,
  loading,
  onQueryChange,
  onCreate,
  onOpen,
}: Props) {
  const activeCases = data.cases.filter((item) => !item.deletedAt);
  const matches = (item: Workspace['cases'][number]) =>
    item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()) ||
    data.proceedings.some(
      (program) => program.caseId === item.id && program.caseNumber.includes(query),
    );

  return (
    <div className="cases-page">
      <h1>
        <Folder />
        案件
      </h1>
      <div className="board-toolbar">
        <span className="view-pill">按状态</span>
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
      {loading ? (
        <p className="empty-text">正在打开本地工作空间…</p>
      ) : (
        <div className="case-board">
          {data.statuses.map((status, index) => {
            const cases = activeCases.filter(
              (item) => item.statusId === status.id && matches(item),
            );
            return (
              <section className={`case-column column-${index}`} key={status.id}>
                <header>
                  <i style={{ background: status.color }} />
                  <span>{status.name}</span>
                  <small>{cases.length}</small>
                  <button
                    className="icon-button"
                    title={`在${status.name}中新建案件`}
                    onClick={() => onCreate(status.id)}
                  >
                    <Plus />
                  </button>
                </header>
                <div className="case-cards">
                  {cases.map((item) => {
                    const program = data.proceedings.find(
                      (program) => program.id === item.currentProceedingId,
                    );
                    const next = data.tasks
                      .filter((task) => task.caseId === item.id && !task.completed && task.dueDate)
                      .sort((left, right) => left.dueDate!.localeCompare(right.dueDate!))[0];
                    return (
                      <button className="case-card" key={item.id} onClick={() => onOpen(item.id)}>
                        <small>
                          <Folder />
                          {program
                            ? programLabels[program.kind]
                            : item.caseType === 'civil'
                              ? '民商事诉讼'
                              : '其他案件'}
                          {program?.stage ? ` · ${program.stage}` : ''}
                        </small>
                        <span>{item.title}</span>
                        {next && (
                          <time>
                            {next.dueDate} · {next.title}
                          </time>
                        )}
                      </button>
                    );
                  })}
                </div>
                {index === 0 && (
                  <button className="new-case" onClick={() => onCreate(status.id)}>
                    <Plus />
                    新建案件
                  </button>
                )}
                {!cases.length && query && <p className="column-empty">没有匹配的案件</p>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
