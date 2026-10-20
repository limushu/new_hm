import { errorMessage } from '../../services/errors';
import Select from '../../components/Select';
import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import {
  Folder,
  FileText,
  Image as ImageIcon,
  Music,
  MoreHorizontal,
  Plus,
  Search,
  ChevronRight,
  Mic,
  Upload,
  Link2,
} from 'lucide-react';
import { watchMaterialDrop } from '../../platform/documents';
import Dialog from '../../components/Dialog';
import { useAction } from '../../components/useAction';
import type {
  Material,
  MaterialTarget,
  SaveAction,
  Workspace,
  WorkScope,
} from '../../domain/types';
import { matchesScope, resourceLinks, scopeName as workScopeName } from '../../domain/workspace';
import ResourceAssociation from '../cases/ResourceAssociation';
import { proceedingName } from '../../domain/proceedings';
import { command, nativeRuntime } from '../../services/repository';
import Recorder from './Recorder';
import { useSubsystems } from '../../platform/SubsystemProvider';
import { supports } from '../../platform/subsystems';
import './materials.css';
const Preview = lazy(() => import('./Preview'));
export function materialIcon(item: Material) {
  const ext = item.name.split('.').pop()?.toLowerCase();
  return item.kind === 'folder' ? (
    <Folder />
  ) : ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].includes(ext ?? '') ? (
    <ImageIcon />
  ) : ['webm', 'mp3', 'wav', 'm4a', 'ogg', 'mp4'].includes(ext ?? '') ? (
    <Music />
  ) : (
    <FileText />
  );
}
export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
export default function Materials({
  caseId,
  data,
  save,
  recordId = null,
  focusId,
  initialScope = 'all',
  initialStageId = null,
  workScope,
  onScopeChange,
}: {
  caseId: string;
  data: Workspace;
  save: SaveAction;
  recordId?: string | null;
  focusId?: string;
  initialScope?: string;
  initialStageId?: string | null;
  workScope?: WorkScope;
  onScopeChange?: (scope: WorkScope) => void;
}) {
  const { manifest } = useSubsystems();
  const nativeDrop = supports(manifest, 'native-drop');
  const filePicker = supports(manifest, 'file-picker');
  const recordingAvailable = supports(manifest, 'record-audio');
  const fileExport = supports(manifest, 'file-export');
  const externalOpen = supports(manifest, 'external-open');
  const focused = data.materials.find(
    (m) => m.id === focusId && m.caseId === caseId && !m.deletedAt,
  );
  const [scope, setScope] = useState(
    workScope?.proceedingId ?? (focused ? (focused.proceedingId ?? 'shared') : initialScope),
  );
  const [stageId, setStageId] = useState(workScope?.stageId ?? initialStageId);
  const filterProp = useRef({ scope: initialScope, stage: initialStageId });
  useEffect(() => {
    if (filterProp.current.scope === initialScope && filterProp.current.stage === initialStageId)
      return;
    filterProp.current = { scope: initialScope, stage: initialStageId };
    if (!workScope) {
      setScope(initialScope);
      setStageId(initialStageId);
      setFolder(null);
      setQuery('');
    }
  }, [initialScope, initialStageId, workScope]);
  const [association, setAssociation] = useState<Material | null>(null);
  const [folder, setFolder] = useState<string | null>(focused?.parentId ?? null);
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<Material | null>(null);
  const [menu, setMenu] = useState<{ item: Material; x: number; y: number } | null>(null);
  const [edit, setEdit] = useState<{
    kind: 'folder' | 'rename' | 'move' | 'notes' | 'trash';
    item?: Material;
  } | null>(null);
  const [value, setValue] = useState('');
  const [moveScope, setMoveScope] = useState('shared');
  const [moveFolder, setMoveFolder] = useState('');
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState('');
  const [drop, setDrop] = useState(false);
  const { busy, error, setError, run } = useAction();
  const fileInput = useRef<HTMLInputElement>(null);
  const target = useRef<MaterialTarget>({ caseId, proceedingId: null, parentId: null, recordId });
  target.current = {
    caseId,
    proceedingId: folder
      ? (data.materials.find((m) => m.id === folder)?.proceedingId ?? null)
      : scope === 'shared' || scope === 'all'
        ? null
        : scope,
    stageId,
    parentId: folder,
    recordId,
  };
  const programs = data.proceedings.filter((p) => p.caseId === caseId);
  const materials = data.materials.filter((m) => m.caseId === caseId && !m.deletedAt);
  const rows = materials.filter(
    (m) =>
      (recordId
        ? m.recordId === recordId
        : stageId
          ? resourceLinks(data, 'material', m.id).some((l) =>
              matchesScope(l, { proceedingId: scope, stageId }),
            )
          : scope === 'all' ||
            m.proceedingId === target.current.proceedingId ||
            resourceLinks(data, 'material', m.id).some((l) => l.proceedingId === scope)) &&
      (query || stageId
        ? m.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
        : m.parentId === folder ||
          (!folder &&
            scope !== 'all' &&
            scope !== 'shared' &&
            m.proceedingId !== scope &&
            resourceLinks(data, 'material', m.id).some((l) => l.proceedingId === scope))),
  );
  const current = materials.find((m) => m.id === folder);
  const scopeName =
    scope === 'all'
      ? '全案材料'
      : scope === 'shared'
        ? '案件共用'
        : proceedingName(programs.find((p) => p.id === scope)!, programs);
  const ancestors: Material[] = [];
  let at = current;
  const visited = new Set<string>();
  while (at && !visited.has(at.id)) {
    visited.add(at.id);
    ancestors.unshift(at);
    const parentId = at.parentId;
    at = materials.find((m) => m.id === parentId);
  }
  function report(result: {
    imported: number;
    errors: (string | { name: string; error: unknown })[];
  }) {
    if (result.imported) setNotice(`已添加 ${result.imported} 份材料`);
    if (result.errors.length)
      setError(
        result.errors
          .map((issue) =>
            typeof issue === 'string' ? issue : `${issue.name}：${errorMessage(issue.error)}`,
          )
          .join('\n'),
      );
  }
  useEffect(() => {
    if (!nativeRuntime || !nativeDrop) return;
    let canceled = false;
    let stop: (() => void) | undefined;
    void watchMaterialDrop((event) => {
      if (event.type === 'over') setDrop(true);
      if (event.type === 'leave') setDrop(false);
      if (event.type === 'drop') {
        setDrop(false);
        const selected = { ...target.current };
        const paths = event.paths;
        void run(async () =>
          report(await save('import_material_paths', { target: selected, paths })),
        );
      }
    })
      .then((unlisten) => {
        if (canceled) unlisten();
        else stop = unlisten;
      })
      .catch((reason) => {
        if (!canceled) setError(String(reason));
      });
    return () => {
      canceled = true;
      stop?.();
    };
    // The refs keep a native drop bound to the currently visible folder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, recordId, nativeDrop]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element).closest('.material-menu,.material-menu-trigger'))
        setMenu(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', key);
    };
  }, [menu]);
  function showEdit(kind: NonNullable<typeof edit>['kind'], item?: Material) {
    setMenu(null);
    setValue(kind === 'rename' ? (item?.name ?? '') : kind === 'notes' ? (item?.notes ?? '') : '');
    setMoveScope(item?.proceedingId ?? 'shared');
    setMoveFolder(item?.parentId ?? '');
    setEdit({ kind, item });
  }
  async function add() {
    if (!nativeRuntime) {
      fileInput.current?.click();
      return;
    }
    await run(async () => report(await save('pick_materials', { target: target.current })));
  }
  async function open(item: Material) {
    if (item.kind === 'folder') {
      setFolder(item.id);
      setQuery('');
      return;
    }
    const ext = item.name.split('.').pop()?.toLowerCase();
    if (
      [
        'pdf',
        'png',
        'jpg',
        'jpeg',
        'gif',
        'webp',
        'bmp',
        'webm',
        'ogg',
        'mp3',
        'wav',
        'm4a',
        'mp4',
      ].includes(ext ?? '')
    )
      setPreview(item);
    else if (externalOpen) await run(() => command('open_material', { id: item.id }));
    else setError('当前设备暂不支持打开此文件格式。');
  }
  function pathOf(item: Material) {
    const names = [item.name];
    let parent = item.parentId;
    const seen = new Set([item.id]);
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      const value = materials.find((m) => m.id === parent);
      if (!value) break;
      names.unshift(value.name);
      parent = value.parentId;
    }
    return names.join(' / ');
  }
  function descendant(item: Material, parent: string) {
    let at: Material | undefined = item;
    const seen = new Set<string>();
    while (at && !seen.has(at.id)) {
      if (at.id === parent) return true;
      seen.add(at.id);
      at = materials.find((m) => m.id === at?.parentId);
    }
    return false;
  }
  return (
    <section
      className={`materials-panel ${drop ? 'is-file-drop' : ''}`}
      aria-label="案件材料"
      onDragOver={(event) => {
        if (!nativeRuntime) {
          event.preventDefault();
          setDrop(true);
        }
      }}
      onDragLeave={() => setDrop(false)}
      onDrop={(event) => {
        if (nativeRuntime) return;
        event.preventDefault();
        setDrop(false);
        const files = Array.from(event.dataTransfer.files);
        void run(async () => {
          const { registerPreviewFiles } = await import('../../services/preview');
          report(
            await save('import_material_paths', {
              target: target.current,
              paths: registerPreviewFiles(files),
            }),
          );
        });
      }}
    >
      {!recordId && !workScope && (
        <nav className="material-scopes" aria-label="按流程查看材料">
          {[
            { id: 'all', name: '全案材料' },
            { id: 'shared', name: '案件共用' },
            ...programs.map((p) => ({ id: p.id, name: proceedingName(p, programs) })),
          ].map((group) => (
            <button
              key={group.id}
              aria-pressed={scope === group.id}
              className={scope === group.id ? 'active' : ''}
              onClick={() => {
                setScope(group.id);
                onScopeChange?.({
                  proceedingId: group.id === 'all' ? null : group.id,
                  stageId: null,
                });
                setStageId(null);
                setFolder(null);
                setQuery('');
              }}
            >
              <span>{group.name}</span>
              <small>
                {
                  materials.filter(
                    (m) =>
                      (group.id === 'all' ||
                        (m.proceedingId ?? 'shared') === group.id ||
                        resourceLinks(data, 'material', m.id).some(
                          (l) => l.proceedingId === group.id,
                        )) &&
                      m.kind === 'file',
                  ).length
                }
              </small>
            </button>
          ))}
        </nav>
      )}
      {!recordId && !workScope && scope !== 'all' && scope !== 'shared' && (
        <div className="material-stage-filter">
          <Select
            aria-label="材料阶段筛选"
            value={stageId ?? ''}
            onValueChange={(v) => {
              setStageId(v || null);
              onScopeChange?.({ proceedingId: scope, stageId: v || null });
              setFolder(null);
            }}
          >
            <option value="">全部阶段</option>
            {data.stages
              .filter((s) => s.proceedingId === scope)
              .map((s) => (
                <option value={s.id} key={s.id}>
                  {s.name}
                </option>
              ))}
          </Select>
          {stageId && (
            <button
              onClick={() => {
                setStageId(null);
                onScopeChange?.({ proceedingId: scope, stageId: null });
              }}
            >
              清除阶段筛选
            </button>
          )}
        </div>
      )}
      <div className="feature-toolbar material-toolbar">
        <label className="material-search">
          <Search />
          <input
            aria-label="搜索材料"
            placeholder="搜索文件名"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {!stageId && (
          <button type="button" disabled={busy} onClick={() => showEdit('folder')}>
            <Plus />
            文件夹
          </button>
        )}
        <button
          type="button"
          disabled={busy || !recordingAvailable}
          onClick={() => setRecording(true)}
        >
          <Mic />
          录音
        </button>
        <button
          type="button"
          className="primary-action"
          title={`添加到 ${scopeName}${current ? ' / ' + pathOf(current) : ''}`}
          disabled={busy || !filePicker}
          onClick={() => void add()}
        >
          <Upload />
          添加材料
        </button>
      </div>
      <input
        hidden
        ref={fileInput}
        type="file"
        multiple
        aria-label="选择材料文件"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          void run(async () => {
            const { registerPreviewFiles } = await import('../../services/preview');
            report(
              await save('import_material_paths', {
                target: target.current,
                paths: registerPreviewFiles(files),
              }),
            );
          });
        }}
      />
      {(current || query) && (
        <div className="materials-scope">
          <nav className="material-breadcrumb" aria-label="材料路径">
            <button
              type="button"
              aria-label="全部材料"
              aria-current={!current && !query ? 'location' : undefined}
              onClick={() => {
                setFolder(null);
                setQuery('');
              }}
            >
              {scopeName}
            </button>
            {ancestors.map((ancestor) => (
              <span className="material-path-part" key={ancestor.id}>
                <ChevronRight aria-hidden="true" />
                <button
                  type="button"
                  aria-current={ancestor.id === folder && !query ? 'location' : undefined}
                  onClick={() => {
                    setFolder(ancestor.id);
                    setQuery('');
                  }}
                >
                  {ancestor.name}
                </button>
              </span>
            ))}
            {query && <span className="material-search-context">搜索结果</span>}
          </nav>
          <span className="material-count">{rows.length} 项</span>
        </div>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="material-notice">
          {notice}
        </p>
      )}
      <div className="material-list">
        <div className="material-list-heading">
          <span>名称</span>
          <span>大小</span>
          <span>添加时间</span>
          <span />
        </div>
        {rows.map((item) => (
          <div
            className={`material-row ${item.id === focusId ? 'is-focused' : ''}`}
            key={item.id}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({
                item,
                x: Math.min(event.clientX, innerWidth - 205),
                y: Math.min(event.clientY, innerHeight - 260),
              });
            }}
          >
            <button
              type="button"
              className="material-name"
              aria-label={item.name}
              title={query ? pathOf(item) : item.name}
              onClick={() => {
                if (item.kind === 'folder') void open(item);
              }}
              onDoubleClick={() => {
                if (item.kind !== 'folder') void open(item);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && item.kind !== 'folder') {
                  event.preventDefault();
                  void open(item);
                }
              }}
            >
              {materialIcon(item)}
              <span>
                {item.name}
                {item.notes && <small>{item.notes}</small>}
                {resourceLinks(data, 'material', item.id).length > 0 && (
                  <small className="material-uses">
                    {resourceLinks(data, 'material', item.id)
                      .map((l) => `${workScopeName(data, l)}${l.label ? ' · ' + l.label : ''}`)
                      .join(' / ')}
                  </small>
                )}
              </span>
            </button>
            <small>{item.kind === 'folder' ? '—' : fileSize(item.size)}</small>
            <time>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</time>
            <button
              type="button"
              className="icon-button material-menu-trigger"
              aria-label={`${item.name}的操作`}
              aria-haspopup="menu"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setMenu(
                  menu?.item.id === item.id
                    ? null
                    : {
                        item,
                        x: Math.min(rect.right - 195, innerWidth - 205),
                        y: Math.min(rect.bottom + 4, innerHeight - 260),
                      },
                );
              }}
            >
              <MoreHorizontal />
            </button>
          </div>
        ))}
        {!rows.length && (
          <div className="materials-empty">
            <Folder />
            <p>{query ? '没有匹配的材料' : '拖入文件，或添加材料'}</p>
          </div>
        )}
      </div>
      {association && (
        <ResourceAssociation
          caseId={caseId}
          kind="material"
          resourceId={association.id}
          data={data}
          save={save}
          onClose={() => setAssociation(null)}
        />
      )}
      {menu && (
        <div
          className="material-menu"
          role="menu"
          style={{ left: Math.max(8, menu.x), top: Math.max(8, menu.y) }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void open(menu.item);
              setMenu(null);
            }}
          >
            {menu.item.kind === 'folder' ? '打开文件夹' : '打开'}
          </button>
          <button type="button" role="menuitem" onClick={() => showEdit('rename', menu.item)}>
            重命名
          </button>
          <button type="button" role="menuitem" onClick={() => showEdit('move', menu.item)}>
            移动到…
          </button>
          <button type="button" role="menuitem" onClick={() => showEdit('notes', menu.item)}>
            备注
          </button>
          {menu.item.kind === 'file' && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAssociation(menu.item);
                setMenu(null);
              }}
            >
              <Link2 />
              工作关联
            </button>
          )}
          {menu.item.kind === 'file' && fileExport && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const id = menu.item.id;
                setMenu(null);
                void run(() => command('export_material', { id }));
              }}
            >
              导出副本
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => showEdit('trash', menu.item)}
          >
            移入回收站
          </button>
        </div>
      )}
      {edit && (
        <Dialog
          title={
            edit.kind === 'folder'
              ? '新建文件夹'
              : edit.kind === 'rename'
                ? '重命名材料'
                : edit.kind === 'move'
                  ? '移动材料'
                  : edit.kind === 'notes'
                    ? '材料备注'
                    : '移入回收站'
          }
          onClose={() => setEdit(null)}
          danger={edit.kind === 'trash'}
          submitLabel={edit.kind === 'trash' ? '移入回收站' : '保存'}
          onSubmit={async () => {
            if (edit.kind === 'folder')
              await save('create_material_folder', { target: target.current, name: value });
            else if (edit.kind === 'rename')
              await save('rename_material', { id: edit.item!.id, name: value });
            else if (edit.kind === 'notes')
              await save('update_material_notes', { id: edit.item!.id, notes: value });
            else if (edit.kind === 'trash')
              await save('trash_item', { kind: 'material', id: edit.item!.id });
            else
              await save('move_material', {
                id: edit.item!.id,
                target: {
                  caseId,
                  proceedingId: moveScope === 'shared' ? null : moveScope,
                  parentId: moveFolder || null,
                },
              });
          }}
        >
          {edit.kind === 'trash' ? (
            <p className="feature-description">
              “{edit.item?.name}”将移入回收站，可以恢复。
              {edit.item?.kind === 'folder' ? '文件夹内的材料也会一起移入。' : ''}
            </p>
          ) : edit.kind === 'move' ? (
            <>
              <label>
                归属范围
                <Select
                  aria-label="目标材料范围"
                  value={moveScope}
                  onValueChange={(value) => {
                    setMoveScope(value);
                    setMoveFolder('');
                  }}
                >
                  <option value="shared">案件共用</option>
                  {programs.map((p) => (
                    <option value={p.id} key={p.id}>
                      {proceedingName(p, data.proceedings)}
                    </option>
                  ))}
                </Select>
              </label>
              <label>
                目标文件夹
                <Select
                  aria-label="目标文件夹"
                  value={moveFolder}
                  onValueChange={(value) => setMoveFolder(value)}
                >
                  <option value="">根目录</option>
                  {materials
                    .filter(
                      (m) =>
                        m.kind === 'folder' &&
                        m.proceedingId === (moveScope === 'shared' ? null : moveScope) &&
                        !descendant(m, edit.item!.id),
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {pathOf(m)}
                      </option>
                    ))}
                </Select>
              </label>
            </>
          ) : (
            <label>
              {edit.kind === 'notes' ? '备注' : '名称'}
              {edit.kind === 'notes' ? (
                <textarea
                  aria-label="材料备注"
                  value={value}
                  maxLength={20000}
                  rows={4}
                  onChange={(event) => setValue(event.target.value)}
                />
              ) : (
                <input
                  aria-label={edit.kind === 'folder' ? '文件夹名称' : '材料名称'}
                  autoFocus
                  required
                  value={value}
                  maxLength={180}
                  onChange={(event) => setValue(event.target.value)}
                />
              )}
            </label>
          )}
        </Dialog>
      )}
      {recording && recordingAvailable && (
        <Recorder target={target.current} save={save} onClose={() => setRecording(false)} />
      )}
      {preview && (
        <Suspense fallback={<p className="quiet-empty">正在打开预览…</p>}>
          <Preview item={preview} onClose={() => setPreview(null)} />
        </Suspense>
      )}
    </section>
  );
}
