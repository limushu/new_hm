import { useState } from 'react';
import { ChevronLeft, Pencil, Star } from 'lucide-react';
import Dialog from '../../components/Dialog';
import Button from '../../components/Button';
import { useAction } from '../../components/useAction';
import type { SaveAction, Workspace } from '../../domain/types';
import { resourceKey, type ResourceRef } from '../../case-system/contracts';
import { caseSystem } from '../../case-system/modules';
import { timelineDateLabels } from '../../case-system/timeline';
import { casePresentations } from './resourcePresentations';
import { ResourceRelations } from './ResourceSettings';
import ObjectProperties from './ObjectProperties';
import ObjectActionMenu from './ObjectActionMenu';
import './object-detail.css';

export default function ObjectInspector({
  caseId,
  resource,
  data,
  save,
  onClose,
  initialMode = 'details',
}: {
  caseId: string;
  resource: ResourceRef;
  data: Workspace;
  save: SaveAction;
  onClose: () => void;
  initialMode?: 'details' | 'info';
}) {
  const [history, setHistory] = useState<ResourceRef[]>([resource]);
  const [view, setView] = useState<'details' | 'info' | 'editor' | 'expanded'>(initialMode);
  const current = history[history.length - 1];
  const key = resourceKey(current);
  const item = caseSystem.objects(data, caseId).find((o) => resourceKey(o.resource) === key);
  const [important, setImportant] = useState(item?.importance === 'important');
  const [tags, setTags] = useState(item?.tags.join('，') ?? '');
  const { busy, error, run } = useAction();
  const node = current.kind === 'milestone' || current.kind === 'proceeding';
  const presentation = casePresentations.get(current.kind);
  const Content = presentation?.content;
  const Editor = presentation?.editor;
  const Expanded = presentation?.expanded;
  const editable = data.caseEvents.find((e) => e.id === current.id)?.kind !== 'stage_change';
  const typeLabel =
    caseSystem.types().find((type) => type.id === item?.type)?.label ??
    (
      {
        contact: '人员或机构',
        proceeding: '关键节点',
        party: '当事人',
        material: '材料',
      } as Record<string, string>
    )[current.kind] ??
    '对象';
  function open(ref: ResourceRef) {
    setView('details');
    setHistory((old) => [...old, ref]);
  }
  function editInfo() {
    if (!item) return;
    setImportant(item.importance === 'important');
    setTags(item.tags.join('，'));
    setView('info');
  }
  if (!item)
    return (
      <Dialog title="对象详情" onClose={onClose}>
        <p>对象已删除或不属于本案。</p>
      </Dialog>
    );
  const props = { resource: current, data, save, onOpen: open, onClose: () => setView('details') };
  // A content editor or an explicitly expanded preview replaces the detail
  // surface. No second, hidden detail dialog is mounted underneath it.
  if (view === 'editor' && Editor) return <Editor key={key} {...props} />;
  if (view === 'expanded' && Expanded) return <Expanded key={key} {...props} />;
  const editingInfo = view === 'info';
  return (
    <Dialog
      key={`${key}:${editingInfo ? 'info' : 'details'}`}
      title={node ? '节点详情' : '对象详情'}
      className="object-inspector"
      showFooter={editingInfo}
      cancelAction={() => setView('details')}
      onClose={onClose}
      submitLabel="保存信息"
      onSubmit={
        editingInfo
          ? async () => {
              await save('save_resource_metadata', {
                input: {
                  caseId,
                  resource: current,
                  importance: important ? 'important' : 'normal',
                  tags: tags
                    .split(/[,，]/)
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                },
              });
              setView('details');
              return false;
            }
          : undefined
      }
    >
      {history.length > 1 && !editingInfo && (
        <button
          type="button"
          className="object-back-link"
          onClick={() => {
            setView('details');
            setHistory((old) => old.slice(0, -1));
          }}
        >
          <ChevronLeft />
          返回上一对象
        </button>
      )}
      <div className="object-heading">
        <h3>{item.title}</h3>
        {!editingInfo && (
          <div className="object-heading-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={item.importance === 'important' ? '取消重要标记' : '标为重要'}
              aria-pressed={item.importance === 'important'}
              disabled={busy}
              onClick={() =>
                void run(() =>
                  save('save_resource_metadata', {
                    input: {
                      caseId,
                      resource: current,
                      importance: item.importance === 'important' ? 'normal' : 'important',
                      tags: item.tags,
                    },
                  }),
                )
              }
            >
              <Star className={item.importance === 'important' ? 'important' : ''} />
            </button>
            <ObjectActionMenu
              entry={item}
              save={save}
              label="对象操作"
              onEditInfo={editInfo}
              onRemoved={onClose}
            />
          </div>
        )}
      </div>
      <p className="object-summary">
        {typeLabel}
        {item.businessTime?.value
          ? ` · ${timelineDateLabels[item.businessTime.role]} ${item.businessTime.value}`
          : ''}
      </p>
      {editingInfo ? (
        <>
          <label className="resource-important">
            <input
              type="checkbox"
              checked={important}
              onChange={(event) => setImportant(event.target.checked)}
            />
            标为重要
          </label>
          <label>
            标签
            <input
              aria-label="对象标签"
              value={tags}
              maxLength={2000}
              onChange={(event) => setTags(event.target.value)}
              placeholder="多个标签以逗号分隔"
            />
          </label>
        </>
      ) : (
        <>
          {Content && (
            <Content
              key={key}
              {...props}
              onExpand={Expanded ? () => setView('expanded') : undefined}
            />
          )}
          {!!item.tags.length && (
            <div className="object-tag-list">
              {item.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>
          )}
          {Editor && editable && (
            <Button
              variant="ghost"
              icon={Pencil}
              className="object-edit-link"
              onClick={() => setView('editor')}
            >
              {node ? '编辑节点' : '编辑内容'}
            </Button>
          )}
          <div className="object-info-heading">
            <span>信息与属性</span>
            <button type="button" onClick={editInfo}>
              编辑信息
            </button>
          </div>
          <ObjectProperties key={key} caseId={caseId} resource={current} data={data} save={save} />
          <ResourceRelations
            caseId={caseId}
            source={current}
            data={data}
            save={save}
            onOpen={open}
          />
        </>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </Dialog>
  );
}
