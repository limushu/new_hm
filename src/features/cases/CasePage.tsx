import DateField from '../../components/DateField';
import Dialog from '../../components/Dialog';
import Select from '../../components/Select';
import CaseOverview from './CaseOverview';
import CaseParties from './CaseParties';
import WorkflowForm from './WorkflowForm';
import CaseTags from './CaseTags';
import CaseStatusPicker from './CaseStatusPicker';
import ProceedingPath from './ProceedingPath';
import CaseSchedule from './CaseSchedule';
import { proceedingName } from '../../domain/proceedings';
import './case-overview.css';
import './program-detail.css';
import './case-workspace.css';
import ProgramContacts from '../contacts/ProgramContacts';
import Finance from '../finance/Finance';
import { CaseContacts } from '../contacts/Contacts';
import Stages from './Stages';
import Records from './Records';
import Materials from '../materials/Materials';
import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  CircleDot,
  Tag,
  ChevronRight,
  ChevronsRight,
  Expand,
  Plus,
  Trash2,
  X,
  LayoutDashboard,
  Files,
  Workflow,
  Wallet,
  CheckSquare,
} from 'lucide-react';
import type { CaseFile, CaseInput, SaveAction, Workspace } from '../../domain/types';

interface Props {
  item: CaseFile;
  data: Workspace;
  draft: boolean;
  save: SaveAction;
  close: () => void;
  created: (id: string) => void;
  onCase: (id: string) => void;
  initialTab?: string;
  focusMaterialId?: string;
}
export default function CasePage({
  item,
  data,
  draft,
  save,
  close,
  created,
  onCase,
  initialTab = 'overview',
  focusMaterialId,
}: Props) {
  const [title, setTitle] = useState(item.title);
  const caseType = item.caseType;
  const [tags, setTags] = useState(() =>
    data.caseTags.filter((t) => t.caseId === item.id).map((t) => t.tag),
  );
  const [viewedId, setViewedId] = useState(item.currentProceedingId);
  const [parentId, setParentId] = useState<string | null>(null);
  const [finishProgram, setFinishProgram] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [workflowName, setWorkflowName] = useState('');
  const [statusId, setStatusId] = useState(item.statusId);
  const [tab, setTab] = useState(initialTab);
  const [materialScope, setMaterialScope] = useState('shared');
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');
  const [programForm, setProgramForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDate, setTaskDate] = useState('');
  const [taskForm, setTaskForm] = useState(false);
  const [saved, setSaved] = useState(!draft);
  const [remove, setRemove] = useState(false);
  const [taskOverrides, setTaskOverrides] = useState<Record<string, boolean>>({});
  const inFlight = useRef<Promise<boolean> | null>(null);
  const pendingAction = useRef<Promise<boolean> | null>(null);
  const section = useRef<HTMLElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const programs = data.proceedings.filter((p) => p.caseId === item.id);
  const program =
    programs.find((p) => p.id === viewedId) ??
    programs.find((p) => p.id === item.currentProceedingId) ??
    programs[0];
  function viewProgram(id: string) {
    setViewedId(id);
    setTab('info');
  }
  function addProgram() {
    setParentId(program?.id ?? null);
    setProgramForm(true);
    setTab('info');
  }
  const tasks = data.tasks.filter((t) => t.caseId === item.id);
  useEffect(() => {
    if (draft) titleInput.current?.focus();
  }, [draft]);
  useEffect(() => {
    setSaved(!draft);
  }, [draft]);

  function act(action: () => Promise<unknown>): Promise<boolean> {
    if (pendingAction.current) return pendingAction.current;
    if (saving) return Promise.resolve(false);
    setSaving(true);
    setLocalError('');
    // Read event-bound values before React restores controlled inputs.
    const task = (async () => {
      try {
        await action();
        return true;
      } catch (error) {
        setLocalError(String(error));
        return false;
      } finally {
        setSaving(false);
      }
    })();
    pendingAction.current = task;
    void task.finally(() => {
      if (pendingAction.current === task) pendingAction.current = null;
    });
    return task;
  }
  function commit(overrides: Partial<CaseInput> = {}): Promise<boolean> {
    if (inFlight.current) return inFlight.current;
    const value = { id: item.id, title: title.trim(), caseType, statusId, tags, ...overrides };
    if (!value.title) return Promise.resolve(false);
    if (
      saved &&
      value.title === item.title &&
      value.caseType === item.caseType &&
      value.statusId === item.statusId &&
      JSON.stringify([...value.tags].sort()) ===
        JSON.stringify(
          data.caseTags
            .filter((t) => t.caseId === item.id)
            .map((t) => t.tag)
            .sort(),
        )
    )
      return Promise.resolve(true);
    setLocalError('');
    setSaving(true);
    const promise = (async () => {
      try {
        if (!saved) {
          await save('create_case', { input: value });
          setSaved(true);
          created(item.id);
        } else await save('update_case', { input: value });
        return true;
      } catch (error) {
        setLocalError(String(error));
        return false;
      } finally {
        setSaving(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = promise;
    return promise;
  }
  async function onClose() {
    // Light-dismiss must flush the active information field before unmounting it.
    const active = document.activeElement;
    if (active instanceof HTMLElement && section.current?.contains(active)) active.blur();
    if (pendingAction.current && !(await pendingAction.current)) return;
    if (!title.trim() && !saved) {
      close();
      return;
    }
    if (!title.trim()) {
      setLocalError('案件名称不能为空');
      titleInput.current?.focus();
      return;
    }
    if (await commit()) close();
  }

  return (
    <>
      <button
        className="case-dismiss-surface"
        aria-label="返回主页面"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void onClose()}
      />
      <section
        ref={section}
        className={`case-page ${expanded ? 'expanded' : ''}`}
        aria-label="案件详情"
      >
        <div className="case-toolbar">
          <button className="icon-button" title="返回看板" onClick={onClose}>
            <ChevronsRight />
          </button>
          <span>案件 / {draft ? '新建案件' : item.title}</span>
          <button className="expand-action" onClick={() => setExpanded(!expanded)}>
            <Expand />
            {expanded ? '收起为侧页' : '展开案件'}
          </button>
          {saved && (
            <button
              className="case-delete-action"
              disabled={saving}
              onClick={() => setRemove(true)}
            >
              <Trash2 />
              删除案件
            </button>
          )}
        </div>
        <div className="case-body">
          <div className="case-title-row">
            <BookOpen className="case-page-icon" aria-hidden="true" />
            <input
              ref={titleInput}
              aria-label="案件名称"
              className="page-title-input"
              placeholder="新建案件"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (title.trim()) void commit();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void commit();
              }}
            />
          </div>
          <div className="case-properties">
            <div className="case-status-property">
              <span>
                <CircleDot aria-hidden="true" />
                案件状态
              </span>
              <CaseStatusPicker
                value={statusId}
                statuses={data.statuses}
                disabled={saving}
                onChoose={async (status, create) =>
                  act(async () => {
                    if (create) await save('save_case_status', { input: status });
                    setStatusId(status.id);
                    if (title.trim() && !(await commit({ statusId: status.id })))
                      throw new Error('案件状态尚未保存，请重试');
                  })
                }
              />
            </div>
            <div className="case-category">
              <span>
                <Tag aria-hidden="true" />
                案件类型 / 标签
              </span>
              <CaseTags
                value={tags}
                catalog={data.tagCatalog}
                disabled={saving}
                onChange={(value) => {
                  setTags(value);
                  if (title.trim()) void commit({ tags: value });
                }}
              />
            </div>
          </div>
          {localError && (
            <p className="error-message" role="alert">
              {localError}
            </p>
          )}
          <nav className="case-tabs" aria-label="案件功能" role="tablist">
            {[
              { id: 'overview', label: '概览', Icon: LayoutDashboard },
              { id: 'materials', label: '材料', Icon: Files },
              { id: 'info', label: '流程详情', Icon: Workflow },
              { id: 'finance', label: '收支', Icon: Wallet },
            ].map(({ id, label, Icon }, index) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                tabIndex={tab === id ? 0 : -1}
                className={tab === id ? 'active' : ''}
                onClick={() => setTab(id)}
                onKeyDown={(e) => {
                  const ids = ['overview', 'materials', 'info', 'finance'];
                  const next =
                    e.key === 'ArrowRight'
                      ? (index + 1) % 4
                      : e.key === 'ArrowLeft'
                        ? (index + 3) % 4
                        : e.key === 'Home'
                          ? 0
                          : e.key === 'End'
                            ? 3
                            : -1;
                  if (next >= 0) {
                    e.preventDefault();
                    setTab(ids[next]);
                    e.currentTarget.parentElement
                      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                      [next]?.focus();
                  }
                }}
              >
                <Icon aria-hidden="true" />
                {label}
              </button>
            ))}
            <span className="save-state" aria-live="polite">
              {saving ? '保存中…' : saved ? '已保存' : '填写名称开始'}
            </span>
          </nav>
          {saved && (
            <ProceedingPath
              compact={tab === 'info'}
              item={item}
              programs={programs}
              selected={program?.id ?? null}
              data={data}
              onSelect={viewProgram}
              onAdd={addProgram}
            />
          )}
          {!saved ? (
            <div className="empty-case">
              <p>先为案件起个名称</p>
              <span>其他信息可以在办理过程中逐步完善。</span>
            </div>
          ) : (
            <>
              {tab === 'overview' && (
                <div className="case-overview-content">
                  <CaseOverview
                    item={item}
                    data={data}
                    save={save}
                    onCase={onCase}
                    onProgram={viewProgram}
                  />
                  <section className="case-section" data-tone="amber">
                    <div className="section-title">
                      <h3>
                        <CheckSquare aria-hidden="true" />
                        待办
                      </h3>
                      <button disabled={saving} onClick={() => setTaskForm(!taskForm)}>
                        <Plus />
                        添加待办
                      </button>
                    </div>
                    {!tasks.length && !taskForm && <p className="empty-text">暂无待办</p>}
                    {tasks.map((t) => {
                      const completed = taskOverrides[t.id] ?? t.completed;
                      return (
                        <label key={t.id} className={`todo-row ${completed ? 'completed' : ''}`}>
                          <input
                            type="checkbox"
                            checked={completed}
                            disabled={saving}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setTaskOverrides((value) => ({ ...value, [t.id]: checked }));
                              void act(async () => {
                                try {
                                  await save('toggle_task', { id: t.id, completed: checked });
                                } finally {
                                  setTaskOverrides((value) => {
                                    const next = { ...value };
                                    delete next[t.id];
                                    return next;
                                  });
                                }
                              });
                            }}
                          />
                          <span>{t.title}</span>
                          {t.dueDate && <time>{t.dueDate}</time>}
                        </label>
                      );
                    })}
                  </section>
                  <CaseSchedule caseId={item.id} data={data} save={save} />
                  <section className="case-section" data-tone="violet">
                    <div className="section-title">
                      <h3>
                        <Files aria-hidden="true" />
                        材料
                      </h3>
                      <button onClick={() => setTab('materials')}>
                        查看材料
                        <ChevronRight />
                      </button>
                    </div>
                    <div className="overview-materials">
                      {[
                        { id: 'shared', name: '案件共用' },
                        ...programs.map((p) => ({ id: p.id, name: proceedingName(p, programs) })),
                      ].map((scope) => (
                        <button
                          key={scope.id}
                          onClick={() => {
                            setMaterialScope(scope.id);
                            setTab('materials');
                          }}
                        >
                          <span>{scope.name}</span>
                          <strong>
                            {
                              data.materials.filter(
                                (m) =>
                                  m.caseId === item.id &&
                                  !m.deletedAt &&
                                  m.kind === 'file' &&
                                  (m.proceedingId ?? 'shared') === scope.id,
                              ).length
                            }{' '}
                            份
                          </strong>
                        </button>
                      ))}
                    </div>
                  </section>
                  <Records caseId={item.id} data={data} save={save} />
                </div>
              )}
              {tab === 'info' && (
                <div className="program-detail">
                  {!program && <p className="empty-text">尚未建立办理流程。</p>}
                  {program && (
                    <header className="program-detail-heading">
                      <h2>{proceedingName(program, programs)}</h2>
                      <span>
                        {program.state === 'completed'
                          ? '已办结'
                          : item.currentProceedingId === program.id
                            ? '当前关注 · 办理中'
                            : '办理中'}
                      </span>
                      <div className="program-detail-actions">
                        <button
                          onClick={() => {
                            setWorkflowName(program.name);
                            setRenaming(true);
                          }}
                        >
                          重命名
                        </button>
                        {program.state === 'active' && item.currentProceedingId !== program.id && (
                          <button
                            disabled={saving}
                            onClick={() =>
                              void act(() =>
                                save('select_proceeding', {
                                  caseId: item.id,
                                  proceedingId: program.id,
                                }),
                              )
                            }
                          >
                            设为当前关注
                          </button>
                        )}
                        <button disabled={saving} onClick={() => setFinishProgram(true)}>
                          {program.state === 'completed' ? '恢复办理' : '标记办结'}
                        </button>
                      </div>
                    </header>
                  )}
                  {program && (
                    <Stages
                      key={program.id}
                      caseId={item.id}
                      proceedingId={program.id}
                      data={data}
                      save={save}
                    >
                      <section className="program-details-section" aria-label="流程资料">
                        <header>
                          <h3>流程资料</h3>
                        </header>
                        <div className="program-fields" key={program.id}>
                          {(
                            [
                              [
                                'caseNumber',
                                program.category === 'non_litigation' ? '参考编号' : '案号',
                              ],
                            ] as const
                          ).map(([key, label]) => (
                            <label key={key}>
                              <span>{label}</span>
                              <input
                                aria-label={label}
                                defaultValue={program[key]}
                                maxLength={200}
                                placeholder="未填写"
                                disabled={saving}
                                onBlur={(e) => {
                                  if (e.target.value !== program[key])
                                    void act(() =>
                                      save('update_proceeding', {
                                        input: {
                                          id: program.id,
                                          stage: program.stage,
                                          court: program.court,
                                          judge: program.judge,
                                          [key]: e.target.value,
                                        },
                                      }),
                                    );
                                }}
                              />
                            </label>
                          ))}
                          <label>
                            <span>承接自</span>
                            <Select
                              aria-label="前序流程"
                              value={program.parentId ?? ''}
                              disabled={saving}
                              onValueChange={(value) =>
                                void act(() =>
                                  save('update_proceeding_meta', {
                                    input: {
                                      id: program.id,
                                      parentId: value || null,
                                      state: program.state,
                                    },
                                  }),
                                )
                              }
                            >
                              <option value="">独立流程 / 未指定</option>
                              {programs
                                .filter((p) => p.id !== program.id)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {proceedingName(p, programs)}
                                    {p.caseNumber ? ' · ' + p.caseNumber : ''}
                                  </option>
                                ))}
                            </Select>
                          </label>
                          {program.category === 'non_litigation' ? (
                            <details className="optional-judicial">
                              <summary>司法信息（可选）</summary>{' '}
                              <ProgramContacts
                                key={program.id}
                                program={program}
                                data={data}
                                save={save}
                                onCase={onCase}
                              />
                            </details>
                          ) : (
                            <>
                              {' '}
                              <ProgramContacts
                                key={program.id}
                                program={program}
                                data={data}
                                save={save}
                                onCase={onCase}
                              />
                            </>
                          )}
                        </div>
                      </section>
                    </Stages>
                  )}
                  <CaseParties
                    key={`parties-${program?.id ?? 'no-flow'}`}
                    caseId={item.id}
                    program={program}
                    data={data}
                    save={save}
                    onCase={onCase}
                  />
                  <CaseContacts caseId={item.id} data={data} save={save} onCase={onCase} />
                </div>
              )}
              {tab === 'materials' && (
                <Materials
                  caseId={item.id}
                  data={data}
                  save={save}
                  focusId={focusMaterialId}
                  initialScope={materialScope}
                />
              )}
              {tab === 'finance' && <Finance caseId={item.id} data={data} save={save} />}
            </>
          )}
        </div>
        <button className="mobile-case-close icon-button" aria-label="关闭案件" onClick={onClose}>
          <X />
        </button>
      </section>
      {programForm && (
        <WorkflowForm
          caseId={item.id}
          programs={programs}
          parent={parentId}
          data={data}
          save={save}
          onClose={() => setProgramForm(false)}
          onCreated={(id) => {
            setViewedId(id);
            setTab('info');
          }}
        />
      )}
      {renaming && program && (
        <Dialog
          title="重命名流程"
          onClose={() => setRenaming(false)}
          onSubmit={async () => {
            await save('rename_proceeding', { id: program.id, name: workflowName.trim() });
          }}
        >
          <label>
            流程名称
            <input
              aria-label="新的流程名称"
              required
              maxLength={80}
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
            />
          </label>
        </Dialog>
      )}
      {finishProgram && program && (
        <Dialog
          title={program.state === 'active' ? '办结流程' : '恢复流程办理'}
          onClose={() => setFinishProgram(false)}
          onSubmit={async () => {
            await save('update_proceeding_meta', {
              input: {
                id: program.id,
                parentId: program.parentId,
                state: program.state === 'active' ? 'completed' : 'active',
              },
            });
          }}
        >
          <p className="feature-description">
            {program.state === 'active'
              ? '将此流程标记为办结，保留阶段与全部资料；如果正在关注此流程，会取消关注。'
              : '恢复此流程的办理状态。'}
            此操作不改变整个案件的结案状态。
          </p>
        </Dialog>
      )}
      {taskForm && (
        <Dialog
          title="新建待办"
          className="task-editor"
          onClose={() => {
            setTaskForm(false);
            setTaskTitle('');
            setTaskDate('');
          }}
          submitLabel="添加"
          onSubmit={async () => {
            await save('add_task', {
              input: { caseId: item.id, title: taskTitle.trim(), dueDate: taskDate || null },
            });
          }}
        >
          <input
            className="task-title"
            aria-label="待办内容"
            placeholder="要做什么？"
            autoFocus
            required
            maxLength={500}
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
          />
          <label className="task-date">
            <span>截止日期（可选）</span>
            <DateField aria-label="截止日期" value={taskDate} onValueChange={setTaskDate} />
          </label>
        </Dialog>
      )}
      {remove && (
        <Dialog
          title="删除案件"
          danger
          submitLabel="移入回收站"
          onClose={() => setRemove(false)}
          onSubmit={async () => {
            await save('trash_case', { id: item.id });
            close();
          }}
        >
          <p className="feature-description">
            将“{item.title}”移入回收站？案件及其材料、工作记录会保留，可在回收站恢复。
          </p>
        </Dialog>
      )}
    </>
  );
}
