import { useCallback, useRef, useState } from 'react';
import { Ellipsis, Info, Pencil, Star, Trash2 } from 'lucide-react';
import Dialog from '../../components/Dialog';
import { usePopover } from '../../components/usePopover';
import { useAction } from '../../components/useAction';
import type { SaveAction } from '../../domain/types';
import type { TimelineEntry } from '../../case-system/contracts';

export type ObjectActionEntry = Pick<
  TimelineEntry,
  'caseId' | 'resource' | 'title' | 'importance' | 'tags'
>;
export default function ObjectActionMenu({
  entry,
  save,
  onDetails,
  onEditInfo,
  onRemoved,
  label = `条目操作 ${entry.title}`,
}: {
  entry: ObjectActionEntry;
  save: SaveAction;
  onDetails?: () => void;
  onEditInfo: () => void;
  onRemoved?: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [remove, setRemove] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { anchor, popup } = usePopover(open, close, 190);
  const trigger = useRef<HTMLButtonElement>(null);
  const { busy, error, run } = useAction();
  const important = entry.importance === 'important';
  const trashKind =
    entry.resource.kind === 'material' || entry.resource.kind === 'record'
      ? entry.resource.kind
      : null;
  function choose(action: () => void) {
    close();
    action();
  }
  return (
    <div className="object-action-anchor" ref={anchor}>
      <button
        ref={trigger}
        type="button"
        className="timeline-entry-settings"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() =>
              popup.current?.querySelector<HTMLButtonElement>('button')?.focus(),
            );
          }
        }}
      >
        <Ellipsis />
      </button>
      {open && (
        <div
          className="field-popover object-action-menu"
          ref={popup}
          popover="manual"
          role="menu"
          aria-label="对象操作"
          onKeyDown={(event) => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const buttons = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
            ];
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
            buttons[next]?.focus();
          }}
        >
          {onDetails && (
            <button type="button" role="menuitem" onClick={() => choose(onDetails)}>
              <Info />
              查看详情
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => choose(onEditInfo)}>
            <Pencil />
            编辑信息
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              choose(
                () =>
                  void run(() =>
                    save('save_resource_metadata', {
                      input: {
                        caseId: entry.caseId,
                        resource: entry.resource,
                        importance: important ? 'normal' : 'important',
                        tags: entry.tags,
                      },
                    }),
                  ),
              )
            }
          >
            <Star />
            {important ? '取消重要标记' : '标为重要'}
          </button>
          {trashKind && (
            <button
              type="button"
              role="menuitem"
              className="danger-text"
              onClick={() => choose(() => setRemove(true))}
            >
              <Trash2 />
              移至回收站
            </button>
          )}
        </div>
      )}
      {error && (
        <span className="object-action-error" role="alert">
          {error}
        </span>
      )}
      {remove && trashKind && (
        <Dialog
          title="移至回收站？"
          submitLabel="移至回收站"
          danger
          onClose={() => setRemove(false)}
          onSubmit={async () => {
            await save('trash_item', { kind: trashKind, id: entry.resource.id });
            onRemoved?.();
          }}
        >
          <p>{entry.title}</p>
          <p className="field-hint">移除后可在回收站恢复。</p>
        </Dialog>
      )}
    </div>
  );
}
