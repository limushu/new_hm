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
import WorkTasks from './WorkTasks';
import StageWork from './StageWork';
import { ScopeFilter } from './WorkScopeField';
import { caseScope, resourceLinks } from '../../domain/workspace';
import './work-area.css';
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
} from 'lucide-react';
import type { CaseFile, CaseInput, SaveAction, Workspace, WorkScope } from '../../domain/types';

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
  const [materialScope, setMaterialScope] = useState<WorkScope>(caseScope);
  const [financeScope, setFinanceScope] = useState<WorkScope>(caseScope);
  const [stageSelection, setStageSelection] = useState<Record<string, string | null>>({});
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');
  const [programForm, setProgramForm] = useState(false);
  const [saved, setSaved] = useState(!draft);
  const [remove, setRemove] = useState(false);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const pendingAction = useRef<Promise<boolean> | null>(null);
  const section = useRef<HTMLElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const programs = data.proceedings.filter((p) => p.caseId === item.id);
  const program =
    programs.find((p) => p.id === viewedId) ??
    programs.find((p) => p.id === item.currentProceedingId) ??
    programs[0];
  const stages = data.stages.filter((s) => s.proceedingId === program?.id);
  const selectedStageId =
    program && program.id in stageSelection
      ? stageSelection[program.id]
      : (stages.find((s) => s.state === 'current')?.id ?? null);
  const workScope: WorkScope = {
    proceedingId: program?.id ?? null,
    stageId: stages.some((s) => s.id === selectedStageId) ? (selectedStageId ?? null) : null,
  };
  function viewWork(scope: WorkScope) {
    if (scope.proceedingId) {
      setViewedId(scope.proceedingId);
      setStageSelection((v) => ({ ...v, [scope.proceedingId!]: scope.stageId }));
    }
    setTab('info');
  }
  function viewProgram(id: string) {
    setViewedId(id);
    setTab('info');
  }
  function addProgram() {
    setParentId(null);
    setProgramForm(true);
    setTab('info');
  }
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
                状态
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
                标签
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
              { id: 'overview', label: '概况', Icon: LayoutDashboard },
              { id: 'materials', label: '材料', Icon: Files },
              { id: 'info', label: '办理', Icon: Workflow },
              { id: 'finance', label: '费用', Icon: Wallet },
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
                    onAdd={addProgram}
                    actions={
                      <>
                        <WorkTasks caseId={item.id} data={data} save={save} onWork={viewWork} />
                        <CaseSchedule caseId={item.id} data={data} save={save} />
                      </>
                    }
                    onFinance={() => {
                      setFinanceScope(caseScope);
                      setTab('finance');
                    }}
                  />
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
                        { id: 'all', name: '全案材料' },
                        { id: 'shared', name: '案件共用' },
                        ...programs.map((p) => ({ id: p.id, name: proceedingName(p, programs) })),
                      ].map((scope) => (
                        <button
                          key={scope.id}
                          onClick={() => {
                            setMaterialScope({
                              proceedingId: scope.id === 'all' ? null : scope.id,
                              stageId: null,
                            });
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
                                  (scope.id === 'all' ||
                                    (m.proceedingId ?? 'shared') === scope.id ||
                                    resourceLinks(data, 'material', m.id).some(
                                      (l) => l.proceedingId === scope.id,
                                    )),
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
                  {programs.length > 1 && (
                    <div className="work-navigation">
                      <nav className="work-programs" aria-label="办理工作选择">
                        {programs.map((p) => (
                          <button
                            key={p.id}
                            aria-label={`查看${proceedingName(p, programs)}流程`}
                            aria-pressed={p.id === program?.id}
                            onClick={() => setViewedId(p.id)}
                          >
                            <strong>{proceedingName(p, programs)}</strong>
                            <small>
                              {p.state === 'completed' ? '已办结' : p.stage || '未指定阶段'}
                              {p.id === item.currentProceedingId ? ' · 关注' : ''}
                            </small>
                          </button>
                        ))}
                      </nav>
                      <button className="work-add-program" onClick={addProgram}>
                        <Plus />
                        新增流程
                      </button>
                    </div>
                  )}
                  {programs.length > 1 && (
                    <details className="work-relations">
                      <summary>流程关系</summary>
                      <ProceedingPath
                        item={item}
                        programs={programs}
                        selected={program?.id ?? null}
                        data={data}
                        onSelect={viewProgram}
                      />
                    </details>
                  )}
                  {!program && (
                    <>
                      <button className="work-add-program" onClick={addProgram}>
                        <Plus />
                        新增流程
                      </button>
                      <p className="quiet-empty">直接记录待办与日程，或新增流程组织工作。</p>
                      <WorkTasks caseId={item.id} data={data} save={save} />
                      <CaseSchedule caseId={item.id} data={data} save={save} />
                      <Records caseId={item.id} data={data} save={save} />
                    </>
                  )}
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
                        {programs.length === 1 && (
                          <button onClick={addProgram}>
                            <Plus />
                            新增流程
                          </button>
                        )}
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
                      selected={workScope.stageId}
                      onSelect={(id) => setStageSelection((v) => ({ ...v, [program.id]: id }))}
                      data={data}
                      save={save}
                    >
                      <StageWork
                        key={`${program.id}-${workScope.stageId ?? 'all'}`}
                        caseId={item.id}
                        data={data}
                        save={save}
                        scope={workScope}
                        onMaterials={(scope) => {
                          setMaterialScope(scope);
                          setTab('materials');
                        }}
                        onFinance={(scope) => {
                          setFinanceScope(scope);
                          setTab('finance');
                        }}
                      />
                      <details className="work-details">
                        <summary>流程资料与当事人</summary>
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
                        <CaseParties
                          key={`parties-${program.id}`}
                          caseId={item.id}
                          program={program}
                          data={data}
                          save={save}
                          onCase={onCase}
                        />
                        <CaseContacts caseId={item.id} data={data} save={save} onCase={onCase} />
                      </details>
                    </Stages>
                  )}
                </div>
              )}
              {tab === 'materials' && (
                <>
                  {materialScope.proceedingId && (
                    <ScopeFilter
                      data={data}
                      value={materialScope}
                      onClear={() => setMaterialScope(caseScope)}
                      onBack={() => viewWork(materialScope)}
                    />
                  )}
                  <Materials
                    caseId={item.id}
                    data={data}
                    save={save}
                    focusId={focusMaterialId}
                    initialScope={materialScope.proceedingId ?? 'all'}
                    initialStageId={materialScope.stageId}
                    onScopeChange={setMaterialScope}
                  />
                </>
              )}
              {tab === 'finance' && (
                <>
                  <ScopeFilter
                    data={data}
                    value={financeScope}
                    onClear={() => setFinanceScope(caseScope)}
                    onBack={() => viewWork(financeScope)}
                  />
                  <Finance caseId={item.id} data={data} save={save} scope={financeScope} />
                </>
              )}
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
