import type { ReactNode } from 'react';
import CreationProperties from './CreationProperties';
import ImportMaterials from '../materials/ImportMaterials';
import { defaultCreationProperties } from '../../case-system/objects';
import { useObjectCreation } from '../../case-system/useObjectCreation';
import { EntryForm } from '../finance/Finance';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Mic, Plus, Search, FileText, Flag, NotebookPen, ArrowUpRight } from 'lucide-react';
import Dialog from '../../components/Dialog';
import DateField from '../../components/DateField';
import Select from '../../components/Select';
import Recorder from '../materials/Recorder';
import TextDocument from '../materials/TextDocument';
import { materialIcon, fileSize } from '../materials/Materials';
import { RecordForm } from './Records';
import { WorkTaskEditor } from './WorkTasks';
import { useSubsystems } from '../../platform/SubsystemProvider';
import { supports } from '../../platform/subsystems';
import { dateKey } from '../../domain/calendar';
import { proceedingName } from '../../domain/proceedings';
import { caseScope } from '../../domain/workspace';
import type { CaseEvent, Material, SaveAction, Workspace } from '../../domain/types';
const Preview = lazy(() => import('../materials/Preview'));

export function MilestoneEditor({
  value,
  data,
  save,
  onClose,
  properties,
  nodeMode = false,
}: {
  value: CaseEvent;
  data: Workspace;
  save: SaveAction;
  onClose: () => void;
  properties?: ReactNode;
  nodeMode?: boolean;
}) {
  const [input, setInput] = useState(value);
  return (
    <Dialog
      title={nodeMode ? '关键节点' : '关键事件'}
      submitLabel={nodeMode ? '保存节点' : '保存事件'}
      onClose={onClose}
      onSubmit={async () => {
        await save('save_case_event', { input });
      }}
    >
      {properties}
      <label>
        {nodeMode ? '节点名称' : '发生了什么'}
        <input
          aria-label={nodeMode ? '节点名称' : '事件名称'}
          required
          maxLength={200}
          value={input.title}
          onChange={(e) => setInput({ ...input, title: e.target.value })}
        />
      </label>
      <label>
        {nodeMode ? '节点日期（可选）' : '发生日期'}
        <DateField
          aria-label="事件日期"
          value={input.eventDate}
          onValueChange={(eventDate) => setInput({ ...input, eventDate })}
        />
      </label>
      {!properties && (
        <label>
          关联流程
          <Select
            aria-label="事件关联流程"
            value={input.proceedingId ?? ''}
            onValueChange={(v) => setInput({ ...input, proceedingId: v || null })}
          >
            <option value="">案件共用</option>
            {data.proceedings
              .filter((p) => p.caseId === input.caseId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {proceedingName(p, data.proceedings)}
                </option>
              ))}
          </Select>
        </label>
      )}
      <label>
        说明与依据
        <textarea
          aria-label="事件说明"
          rows={5}
          value={input.notes}
          onChange={(e) => setInput({ ...input, notes: e.target.value })}
        />
      </label>
      <p className="field-hint">
        请按实际情况填写。将来的日期显示为计划，文件归档时间不会自动当作事实发生日期。
      </p>
    </Dialog>
  );
}

export default function CaseQuickActions({
  caseId,
  data,
  save,
  onMaterials,
}: {
  caseId: string;
  data: Workspace;
  save: SaveAction;
  onMaterials: () => void;
}) {
  const { manifest } = useSubsystems();
  const [objectProperties, setObjectProperties] = useState(defaultCreationProperties);
  const creation = useObjectCreation(caseId, data, objectProperties, save);
  const fields = (
    <CreationProperties
      caseId={caseId}
      data={data}
      value={objectProperties}
      onChange={setObjectProperties}
    />
  );
  const [panel, setPanel] = useState<
    | 'recording'
    | 'create'
    | 'document'
    | 'record'
    | 'event'
    | 'task'
    | 'search'
    | 'ledger'
    | 'import'
    | 'node'
    | null
  >(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Material | null>(null);
  const [draftId, setDraftId] = useState('');
  const target = { caseId, proceedingId: null, parentId: null, recordId: null };
  function create(kind: typeof panel) {
    creation.reset();
    setObjectProperties(defaultCreationProperties());
    setDraftId(crypto.randomUUID());
    setPanel(kind);
  }
  const files = useMemo(
    () =>
      data.materials
        .filter((m) => m.caseId === caseId && m.kind === 'file' && !m.deletedAt)
        .filter((m) =>
          `${m.name} ${m.notes}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [caseId, data.materials, query],
  );
  const [limit, setLimit] = useState(20);
  const [unsupported, setUnsupported] = useState('');
  function open(item: Material) {
    if (!/\.(pdf|png|jpe?g|gif|webp|bmp|webm|ogg|mp3|wav|m4a|mp4|md|txt)$/i.test(item.name)) {
      setUnsupported('此格式可在材料页导出，再使用对应应用打开。');
      return;
    }
    setUnsupported('');
    setSelected(item);
  }
  return (
    <>
      <nav className="case-quick-actions" aria-label="案件快捷操作">
        <button
          aria-label="快速录音"
          disabled={!supports(manifest, 'record-audio')}
          onClick={() => create('recording')}
        >
          <Mic />
          <span>录音</span>
        </button>
        <button onClick={() => setPanel('create')}>
          <Plus />
          <span>创建</span>
        </button>
        <button
          aria-label="查找案件材料"
          onClick={() => {
            setQuery('');
            setLimit(20);
            setPanel('search');
          }}
        >
          <Search />
          <span>查找</span>
        </button>
      </nav>
      {panel === 'recording' && (
        <Recorder
          target={target}
          save={creation.save}
          properties={fields}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'create' && (
        <Dialog title="创建到当前案件" onClose={() => setPanel(null)}>
          <div className="case-create-options">
            <button onClick={() => create('node')}>
              <Flag />
              <span>
                <strong>关键节点</strong>
                <small>例如一审、二审、立案或开庭，可自由命名</small>
              </span>
            </button>
            <button onClick={() => create('import')}>
              <FileText />
              <span>
                <strong>导入本地材料</strong>
                <small>归档已有文件，并设置公共属性</small>
              </span>
            </button>
            <button onClick={() => create('ledger')}>
              <FileText />
              <span>
                <strong>记一笔收支</strong>
                <small>关联本案账目与凭据</small>
              </span>
            </button>
            <button onClick={() => create('event')}>
              <Flag />
              <span>
                <strong>关键事件</strong>
                <small>记录事实或重要的办理节点</small>
              </span>
            </button>
            <button onClick={() => create('record')}>
              <NotebookPen />
              <span>
                <strong>工作记录</strong>
                <small>记下沟通、进展与办案思路</small>
              </span>
            </button>
            <button onClick={() => create('document')}>
              <FileText />
              <span>
                <strong>新建文档</strong>
                <small>撰写并保存为本地文档</small>
              </span>
            </button>
            <button onClick={() => create('task')}>
              <Plus />
              <span>
                <strong>添加待办</strong>
                <small>安排接下来要做的事</small>
              </span>
            </button>
          </div>
        </Dialog>
      )}
      {panel === 'ledger' && (
        <EntryForm
          value={{
            id: draftId,
            caseId,
            proceedingId: null,
            kind: 'expense',
            amountCents: 0,
            entryDate: dateKey(new Date()),
            category: '',
            notes: '',
            reimbursement: 'none',
            materialId: null,
          }}
          data={data}
          save={creation.save}
          properties={fields}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'node' && (
        <MilestoneEditor
          nodeMode
          value={{ id: draftId, caseId, proceedingId: null, title: '', eventDate: '', notes: '' }}
          data={data}
          save={creation.save}
          properties={fields}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'import' && (
        <ImportMaterials
          onRetryProperties={creation.complete}
          target={target}
          save={creation.save}
          properties={fields}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'document' && (
        <TextDocument
          target={target}
          save={creation.save}
          properties={fields}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'record' && (
        <RecordForm
          value={{ id: draftId, caseId, body: '' }}
          data={data}
          scope={caseScope}
          save={creation.save}
          properties={fields}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'event' && (
        <MilestoneEditor
          value={{
            id: draftId,
            caseId,
            proceedingId: null,
            title: '',
            eventDate: dateKey(new Date()),
            notes: '',
          }}
          data={data}
          save={creation.save}
          properties={fields}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'task' && (
        <WorkTaskEditor
          task={{ id: draftId, caseId, title: '', completed: false, dueDate: null }}
          data={data}
          save={creation.save}
          properties={fields}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'search' && (
        <Dialog
          title="查找案件材料"
          className="case-finder"
          onClose={() => {
            setPanel(null);
            setUnsupported('');
          }}
        >
          <label>
            搜索本案全部材料
            <input
              aria-label="搜索历史材料"
              autoFocus
              placeholder="文件名或备注，包括录音与文档"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(20);
              }}
            />
          </label>
          <p className="field-hint">{files.length} 份材料 · 全案范围</p>
          <div className="case-found-materials">
            {files.slice(0, limit).map((m) => (
              <button key={m.id} onClick={() => open(m)}>
                {materialIcon(m)}
                <span>
                  <strong>{m.name}</strong>
                  <small>
                    {new Date(m.createdAt).toLocaleDateString('zh-CN')} 归档 · {fileSize(m.size)}
                  </small>
                </span>
                <ArrowUpRight />
              </button>
            ))}
          </div>
          {!files.length && <p className="quiet-empty">没有找到匹配材料</p>}
          {files.length > limit && (
            <button onClick={() => setLimit((v) => v + 20)}>显示更多材料</button>
          )}
          {unsupported && <p role="status">{unsupported}</p>}
          <button
            onClick={() => {
              setPanel(null);
              onMaterials();
            }}
          >
            打开完整材料库 <ArrowUpRight />
          </button>
        </Dialog>
      )}
      {selected && (
        <Suspense fallback={null}>
          <Preview item={selected} onClose={() => setSelected(null)} />
        </Suspense>
      )}
    </>
  );
}
