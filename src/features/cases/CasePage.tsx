import DateField from '../../components/DateField';
import Dialog from '../../components/Dialog';
import Select from '../../components/Select';
import CaseOverview from './CaseOverview';
import CaseTags from './CaseTags';
import ProceedingPath from './ProceedingPath';
import CaseSchedule from './CaseSchedule';
import { proceedingName } from '../../domain/proceedings';
import './case-overview.css';
import ProgramContacts from '../contacts/ProgramContacts';
import Finance from '../finance/Finance';
import { CaseContacts } from '../contacts/Contacts';
import Stages from './Stages';
import Records from './Records';
import Materials from '../materials/Materials';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronsRight, Expand, Folder, Plus, Trash2, X } from 'lucide-react';
import type { CaseFile, CaseInput, ProgramKind, SaveAction, Workspace } from '../../domain/types';
import { programLabels } from '../../domain/types';

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
  const [caseType, setCaseType] = useState(item.caseType);
  const [tags, setTags] = useState(() =>
    data.caseTags.filter((t) => t.caseId === item.id).map((t) => t.tag),
  );
  const [viewedId, setViewedId] = useState(item.currentProceedingId);
  const [parentId, setParentId] = useState<string | null>(null);
  const [finishProgram, setFinishProgram] = useState(false);
  const [statusId, setStatusId] = useState(item.statusId);
  const [tab, setTab] = useState(initialTab);
  const [materialScope, setMaterialScope] = useState('shared');
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');
  const [newProgram, setNewProgram] = useState<ProgramKind>('appeal');
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
          <Folder className="page-symbol" />
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
          <div className="case-properties">
            <label>
              案件状态
              <Select
                aria-label="案件状态"
                value={statusId}
                disabled={saving}
                onValueChange={(value) => {
                  setStatusId(value);
                  if (title.trim()) void commit({ statusId: value });
                }}
              >
                {data.statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
            <div className="case-category">
              <span>案件类型 / 标签</span>
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
          {!saved && (
            <label className="initial-program-option">
              <input
                type="checkbox"
                checked={caseType === 'civil'}
                onChange={(e) => setCaseType(e.target.checked ? 'civil' : 'other')}
              />
              建案时建立一审程序（也可稍后添加）
            </label>
          )}
          {saved && (
            <ProceedingPath
              item={item}
              programs={programs}
              selected={program?.id ?? null}
              data={data}
              onSelect={viewProgram}
              onAdd={addProgram}
            />
          )}
          {localError && (
            <p className="error-message" role="alert">
              {localError}
            </p>
          )}
          <nav className="case-tabs" aria-label="案件功能">
            {[
              ['overview', '概览'],
              ['materials', '材料'],
              ['info', '程序详情'],
              ['finance', '收支'],
            ].map(([id, label]) => (
              <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
            <span className="save-state" aria-live="polite">
              {saving ? '保存中…' : saved ? '已保存' : '填写名称开始'}
            </span>
          </nav>
          {!saved ? (
            <div className="empty-case">
              <p>先为案件起个名称</p>
              <span>其他信息可以在办理过程中逐步完善。</span>
            </div>
          ) : (
            <>
              {tab === 'overview' && (
                <>
                  <CaseOverview
                    item={item}
                    data={data}
                    save={save}
                    onCase={onCase}
                    onProgram={viewProgram}
                  />
                  <div className="overview-next-grid">
                    <section className="case-section">
                      <div className="section-title">
                        <h3>待办</h3>
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
                  </div>
                  <section className="case-section">
                    <div className="section-title">
                      <h3>材料</h3>
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
                </>
              )}
              {tab === 'info' && (
                <section className="case-section">
                  <div className="section-title">
                    <h3>{program ? proceedingName(program, programs) : '办理程序'} · 程序详情</h3>
                  </div>
                  {!program && <p className="empty-text">尚未建立办理程序。</p>}
                  {program && (
                    <div className="program-detail-context">
                      <label>
                        查看程序
                        <Select
                          aria-label="查看程序"
                          value={program.id}
                          onValueChange={setViewedId}
                        >
                          {programs.map((p) => (
                            <option value={p.id} key={p.id}>
                              {proceedingName(p, programs)}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <span>
                        {program.state === 'completed'
                          ? '已办结'
                          : item.currentProceedingId === program.id
                            ? '当前关注 · 办理中'
                            : '办理中'}
                      </span>
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
                  )}
                  {program && (
                    <div className="program-fields" key={program.id}>
                      <label>
                        承接自
                        <Select
                          aria-label="前序程序"
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
                          <option value="">独立程序 / 未指定</option>
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
                      {([['caseNumber', '案号']] as const).map(([key, label]) => (
                        <label key={key}>
                          {label}
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
                      <ProgramContacts
                        key={program.id}
                        program={program}
                        data={data}
                        save={save}
                        onCase={onCase}
                      />
                    </div>
                  )}
                </section>
              )}
              {tab === 'info' && (
                <>
                  {' '}
                  {program && (
                    <Stages caseId={item.id} proceedingId={program.id} data={data} save={save} />
                  )}
                  <CaseContacts caseId={item.id} data={data} save={save} onCase={onCase} />
                </>
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
        <Dialog
          title="新增办理程序"
          onClose={() => setProgramForm(false)}
          submitLabel="新增"
          onSubmit={async () => {
            const id = await save('add_proceeding', {
              caseId: item.id,
              kind: newProgram,
              parentId,
            });
            setViewedId(id);
            setTab('info');
          }}
        >
          <label>
            程序类型
            <Select
              aria-label="新增程序类型"
              value={newProgram}
              onValueChange={(value) => setNewProgram(value as ProgramKind)}
            >
              {Object.entries(programLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label>
            承接自
            <Select
              aria-label="新程序的前序程序"
              value={parentId ?? ''}
              onValueChange={(value) => setParentId(value || null)}
            >
              <option value="">独立程序</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {proceedingName(p, programs)}
                  {p.caseNumber ? ' · ' + p.caseNumber : ''}
                </option>
              ))}
            </Select>
          </label>
          <p className="field-hint">
            新程序有独立的案号、法院、法官、阶段和材料。不会自动办结其他程序或整个案件，可并行推进。
          </p>
        </Dialog>
      )}
      {finishProgram && program && (
        <Dialog
          title={program.state === 'active' ? '办结程序' : '恢复程序办理'}
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
              ? '将此程序标记为办结，保留阶段与全部资料；如果正在关注此程序，会取消关注。'
              : '恢复此程序的办理状态。'}
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
